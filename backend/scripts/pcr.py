from __future__ import annotations

import argparse
import json
from pathlib import Path

import ahocorasick
from Bio.SeqRecord import SeqRecord
from Bio import SeqIO
from Bio.Seq import Seq


def get_arguments() -> argparse.ArgumentParser:

    parser = argparse.ArgumentParser()

    parser.add_argument("--primer_path", required=True, type=str)
    parser.add_argument("--reference_path", required=True, type=str)
    parser.add_argument("--output_dir", required=True, type=str)
    parser.add_argument("--pcr_analysis_name", required=True, type=str)
    parser.add_argument("--cycle_count", required=True, type=int)

    return parser.parse_args()

def parse_fasta(file_path: Path) -> dict[str, str]:
    records = {}
    for record in SeqIO.parse(file_path, "fasta"):
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

def write_pcr_fasta(amplicons_dict, pcr_analysis_name, output_dir):
    pcr_path = output_dir / pcr_analysis_name

    with pcr_path.open("w") as f:
        for key, seq in amplicons_dict.items():
            f.write(f">{key}\n{seq}\n")

    return pcr_path

def run_pcr(primer_path: Path, reference_path: Path, output_dir: Path, pcr_analysis_name: str, cycle_count: int):
    try:
        primer_sequences = parse_fasta(primer_path)
        reference_sequences = parse_fasta(reference_path)

        amplicons_dict = generate_artificial_amplicons(reference_sequences, primer_sequences)

        pcr_path = write_pcr_fasta(amplicons_dict, pcr_analysis_name, output_dir, cycle_count)

        result = {"status": "success",
                "pcr_path": str(pcr_path),
                }

    except Exception as e:
        result = {"status": "fail_main",
                "error": str(e),
                "pcr_path": None,}

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

    primer_path = Path(args.primer_path)
    reference_path = Path(args.reference_path)
    output_dir = Path(args.output_dir)
    pcr_analysis_name = args.pcr_analysis_name
    cycle_count = args.cycle_count

    run_pcr(primer_path, reference_path, output_dir, pcr_analysis_name, cycle_count)