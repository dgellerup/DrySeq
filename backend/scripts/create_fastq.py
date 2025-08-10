from __future__ import annotations

import argparse
import gzip
import io
import json
import random
from itertools import count
from pathlib import Path

import boto3
import smart_open

import ahocorasick
from Bio.SeqRecord import SeqRecord
from Bio import SeqIO
from Bio.Seq import Seq


def get_arguments() -> argparse.ArgumentParser:

    parser = argparse.ArgumentParser()

    parser.add_argument("--primer_path", required=True, type=str)
    parser.add_argument("--reference_path", required=True, type=str)
    parser.add_argument("--output_s3_prefix", required=True, type=str)
    parser.add_argument("--sample_name", required=True, type=str)
    parser.add_argument("--sequence_count", required=True, type=int)

    return parser.parse_args()

def parse_fasta(file_path: str) -> dict[str, str]:
    records = {}
    with smart_open.open(file_path, "rt") as f_handle:
        for record in SeqIO.parse(f_handle, "fasta"):
            records[record.id] = str(record.seq)
    return records

def find_primer_locations(reference_seq: str, primer_sequences: dict) -> list[tuple[str, int]]:

    A = ahocorasick.Automaton()
    B = ahocorasick.Automaton()
    for primer_name, primer_seq in primer_sequences.items():
        reverse_comp_seq = str(Seq(primer_seq).reverse_complement())
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

    with base_probabilities_path.open("r") as f:
        overrun_base_probabilities = json.load(f)

    return overrun_base_probabilities

def choose_overrun_bases(overrun_base_probabilities: dict[str, float], num_bases: int) -> list[str]:
    return random.choices(
        population=list(overrun_base_probabilities.keys()),
        weights=list(overrun_base_probabilities.values()),
        k=num_bases,
    )

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

def generate_fastq_filename(sample_name: str, sample_num: int, read: str):
    lane = "L001"
    index = "001"
    return f"{sample_name}_S{sample_num}_{lane}_{read}_{index}.fastq.gz"

def write_fastq_files(amplicons_dict: dict, sequence_count: int, output_s3_prefix: str, sample_name: str) -> tuple[str, str]:
    sample_num = random.randint(1, 100)
    r1_path = f'{output_s3_prefix}/{generate_fastq_filename(sample_name, sample_num, "R1")}'
    r2_path = f'{output_s3_prefix}/{generate_fastq_filename(sample_name, sample_num, "R2")}'
    cycle_quality_stats = load_cycle_stats()
    overrun_base_probabilities = load_overrun_base_probabilities()
    gen_read_names = generate_read_name_generator()
    
    with smart_open.open(r1_path, "wb") as r1_file, smart_open.open(r2_path, "wb") as r2_file:
        with gzip.GzipFile(fileobj=r1_file, mode="wb") as r1_gz, gzip.GzipFile(fileobj=r2_file, mode="wb") as r2_gz:
            with io.TextIOWrapper(r1_gz, encoding="utf-8", newline="") as r1_handle, io.TextIOWrapper(r2_gz, encoding="utf-8", newline="") as r2_handle:
                for _ in range(sequence_count):
                    amplicon = random.choice(list(amplicons_dict.values()))
                    amplicon = amplicon.upper()
                    r1_read_name, r2_read_name = gen_read_names()

                    if len(amplicon) >= 251:
                        r1_seq = amplicon[:251]
                        r1_qual = [round(x) for x in cycle_quality_stats[:251]]
                    else:
                        overrun_length = 251 - len(amplicon)
                        r1_seq = Seq(amplicon + create_overrun_sequence(overrun_base_probabilities, overrun_length))
                        r1_qual = [round(x) for x in cycle_quality_stats[:len(amplicon)]] + create_overrun_qualities(overrun_length)


                    if len(amplicon) >= 251:
                        r2_seq = str(Seq(amplicon[-251:]).reverse_complement())
                        r2_qual = [round(q) for q in cycle_quality_stats[:251]]
                    else:
                        overrun_length = 251 - len(amplicon)
                        r2_raw = create_overrun_sequence(overrun_base_probabilities, overrun_length) + amplicon
                        r2_seq = str(Seq(r2_raw[-251:]).reverse_complement())
                        r2_qual = create_overrun_qualities(overrun_length) + [round(q) for q in cycle_quality_stats[:len(amplicon)]]

                    r1_record = SeqRecord(r1_seq, id=r1_read_name, description="")
                    r1_record.letter_annotations["phred_quality"] = r1_qual

                    r2_record = SeqRecord(r2_seq, id=r2_read_name, description="")
                    r2_record.letter_annotations["phred_quality"] = r2_qual

                    SeqIO.write(r1_record, r1_handle, "fastq")
                    SeqIO.write(r2_record, r2_handle, "fastq")

    return (r1_path, r2_path)

def create_fastq(primer_path: str, reference_path: str, output_s3_prefix: str, sample_name: str, sequence_count: int):
    try:

        primer_sequences = parse_fasta(primer_path)
        reference_sequences = parse_fasta(reference_path)

        amplicons_dict = generate_artificial_amplicons(reference_sequences, primer_sequences)

        r1_path, r2_path = write_fastq_files(amplicons_dict, sequence_count, output_s3_prefix, sample_name)

        result = {"status": "success",
                  "r1_path": str(r1_path),
                  "r2_path": str(r2_path),
                  }
    except Exception as e:
        result = {"status": "fail_main",
                  "error": str(e),
                  "r1_path": None,
                  "r2_path": None}

    print(json.dumps(result))

if __name__ == "__main__":

    try:
        args = get_arguments()
    except Exception as e:
        result = {"status": "fail_args",
                "error": str(e),
                "r1_path": None,
                "r2_path": None,
                }
        print(json.dumps(result))

    primer_path = args.primer_path
    reference_path = args.reference_path
    output_s3_prefix = args.output_s3_prefix
    sample_name = args.sample_name
    sequence_count = args.sequence_count

    create_fastq(primer_path, reference_path, output_s3_prefix, sample_name, sequence_count)