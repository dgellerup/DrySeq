import json
import sys
from Bio import SeqIO

import argparse
import smart_open


def get_arguments() -> argparse.ArgumentParser:

    parser = argparse.ArgumentParser;

    parser.add_argument("--fasta_path", required=True, type=str)
    
    return parser.parse_args()

def parse_fasta(file_path: str):
    records = {}
    with smart_open.open(file_path, "rt") as f_handle:
        for record in SeqIO.parse(f_handle, "fasta"):
            records[record.id] = str(record.seq)
            
    return records

def process_fastas(fasta_path: str):
    try:
        sequences = parse_fasta(fasta_path)

        result = {"status": "success",
                  "sequence_count": len(sequences)}
        
    except Exception as e:
        result = {"status": "fail_main",
                  "error": str(e),
                  "sequence_count": None
                  }
    
    print(json.dumps(result))

if __name__ == "__main__":
    try:
        args = get_arguments()
    except Exception as e:
        result = {"status": "fail_args",
                  "error": str(e),
                  "sequence_count": None
                  }
    process_fastas(sys.argv[1])