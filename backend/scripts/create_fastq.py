from __future__ import annotations

import json
import sys
from pathlib import Path

import ahocorasick
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


def create_fastq(primer_path: Path, reference_path: Path, output_path: Path, sequence_count: int):
    primer_sequences = parse_fasta(primer_path)
    reference_sequences = parse_fasta(reference_path)

    amplicons_dict = generate_artificial_amplicons(reference_sequences, primer_sequences)

    result = {
        "sequence_count": len()
    }
    print(json.dumps(result))

if __name__ == "__main__":
    create_fastq(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), int(sys.argv[4]))