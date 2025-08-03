from __future__ import annotations

import gzip
import json
import sys
import random
from itertools import count
from pathlib import Path

import ahocorasick
from Bio.SeqRecord import SeqRecord
from Bio import SeqIO
from Bio.Seq import Seq

def parse_fasta(file_path: Path) -> dict[str, str]:
    records = {}
    for record in SeqIO.parse(file_path, "fasta"):
        records[record.id] = record.seq
    return records

def find_primer_locations(reference_seq: str, primer_sequences: dict) -> list[tuple[str, int]]:

    A = ahocorasick.Automaton()
    B = ahocorasick.Automaton()
    for primer_name, primer_seq in primer_sequences.items():
        reverse_comp_seq = Seq(primer_seq).reverse_complement()
        A.add_word(primer_seq, (primer_name, primer_seq))
        B.add_word(reverse_comp_seq, (primer_name, reverse_comp_seq))
    A.make_automaton()
    B.make_automaton()

    forward_results = []
    for end_index, (idx, primer) in A.iter(reference_seq):
        start_index = end_index - len(primer) + 1
        forward_results.append((idx, start_index))

    reverse_results = [(idx, end_index)  for end_index, (idx, primer) in A.iter(reference_seq)]

    return {
        "forward_results": forward_results,
        "reverse_results": reverse_results,
    }

def generate_artificial_amplicons(reference_sequences: dict[str, str], primer_sequences: dict[str, str]):
    amplicons_dict = {}
    for reference_name, reference_seq in reference_sequences.items():
        primer_positions = find_primer_locations(reference_seq, primer_sequences)
        for f_primer_name, f_primer_index in primer_positions["forward_results"]:
            for r_primer_name, r_primer_index in primer_positions["reverse_results"]:
                amplicon_seq = reference_seq[f_primer_index:r_primer_index]
                amplicons_dict[f"{reference_name}_{f_primer_name}_{r_primer_name}"] = amplicon_seq
    return amplicons_dict

def load_cycle_stats() -> list[float]:

    script_dir = Path(__file__).resolve().parent

    cycle_quality_stats_path = script_dir.parent / "resources" / "cycle_quality_stats.json"

    with cycle_quality_stats_path.open("r") as f:
        cycle_quality_stats = json.load(f)

    return cycle_quality_stats

def load_overrun_base_probabilities() -> dict[str, float]:

    script_dir = Path(__file__).resolve().parent

    base_probabilities_path = script_dir.parent / "resources" / "read_overrun_base_probabilities.json"

    with base_probabilities_path.open("R") as f:
        overrun_base_probabilities = json.load(f)

    return overrun_base_probabilities

def choose_overrun_bases(overrun_base_probabilities: dict[str, float], num_bases: int) -> list[str]:
    return random.choices(
        list(overrun_base_probabilities.keys(),
        weights=overrun_base_probabilities.values()),
        k=num_bases)

def create_overrun_sequence(overrun_base_probabilities: dict[str, float], num_bases: int) -> str:
    return ''.join(choose_overrun_bases(overrun_base_probabilities, num_bases))

def create_overrun_qualities(num_bases: int) -> list[int]:
    return random.choices(list(range(1, 11)), k=num_bases)

def generate_read_name_generator(instrument="M00000", run_id="00001", flowcell="AAAAAA", lane=1):
    read_counter = count(1)

    def generate_read_names():
        read_number = next(read_counter)
        tile = 1101 + ((read_number // 1000) % 100)
        x = (read_number * 37) % 5000
        y = (read_number * 73) % 5000
        is_filtered = random.choice(["Y", "N"])
        control_number = 0

        return (
            f"{instrument}:{run_id}:{flowcell}:{lane}:{tile}:{x}:{y} 1:{is_filtered}:{control_number}:1",
            f"{instrument}:{run_id}:{flowcell}:{lane}:{tile}:{x}:{y} 2:{is_filtered}:{control_number}:1"
        )
    
    return generate_read_names

def generate_fastq_filename(sample_name: str, read: str):
    sample_num = random.randint(1, 100)
    lane = "L001"
    index = "001"
    return f"{sample_name}_S{sample_num}_{lane}_{read}_{index}.fastq.gz"

def write_fastq_files(amplicons_dict: dict, sequence_count: int, output_dir: Path, sample_name: str) -> tuple[Path, Path]:

    r1_path = output_dir / generate_fastq_filename(sample_name, "R1")
    r2_path = output_dir / generate_fastq_filename(sample_name, "R2")

    cycle_quality_stats = load_cycle_stats()
    overrun_base_probabilities = load_overrun_base_probabilities()

    gen_read_names = generate_read_name_generator()
    
    with gzip.open(r1_path, "wt") as r1_file, gzip.open(r2_path, "wt") as r2_file:
        for _ in range(sequence_count):
            _, amplicon = random.choice(list(amplicons_dict.values()))
            amplicon = amplicon.upper()
            r1_read_name, r2_read_name = gen_read_names()

            if len(amplicon) >= 251:
                r1_seq = amplicon[:251]
                r1_qual = [round(x) for x in cycle_quality_stats[:251]]
            else:
                overrun_length = 251 - len(amplicon)
                r1_seq = Seq(amplicon + create_overrun_sequence(overrun_base_probabilities, overrun_length))
                r1_qual = [round(x) for x in cycle_quality_stats[:-overrun_length]] + create_overrun_qualities(overrun_length)


            if len(amplicon) >= 251:
                r2_seq = Seq(amplicon[-251:]).reverse_complement()
                r2_qual = [round(q) for q in cycle_quality_stats[:251]]
            else:
                overrun_len = 251 - len(amplicon)
                r2_raw = create_overrun_sequence(overrun_base_probabilities, overrun_length) + amplicon
                r2_seq = Seq(r2_raw[-251:]).reverse_complement()
                r2_qual = create_overrun_qualities(overrun_len) + [round(q) for q in cycle_quality_stats[:len(amplicon)]]
            
            r1_record = SeqRecord(r1_seq, id=r1_read_name, description="")
            r1_record.letter_annotations["phred_quality"] = r1_qual

            r2_record = SeqRecord(r2_seq, id=r2_read_name, description="")
            r2_record.letter_annotations["phred_quality"] = r2_qual

            SeqIO.write(r1_record, r1_file, "fastq")
            SeqIO.write(r2_record, r2_file, "fastq")

    return (r1_path, r2_path)

def create_fastq(primer_path: Path, reference_path: Path, output_dir: Path, sample_name: str, sequence_count: int):
    try:
        primer_sequences = parse_fasta(primer_path)
        reference_sequences = parse_fasta(reference_path)

        amplicons_dict = generate_artificial_amplicons(reference_sequences, primer_sequences)

        r1_path, r2_path = write_fastq_files(amplicons_dict, sequence_count, output_dir, sample_name)

        result = {"status": "success",
                  "r1_path": r1_path,
                  "r2_path": r2_path,
                  }
    except Exception as e:
        result = {"status": "fail",
                  "error": str(e),
                  "r1_path": None,
                  "r2_path": None}

    print(json.dumps(result))

if __name__ == "__main__":
    create_fastq(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), str(sys.argv[4]), int(sys.argv[5]))