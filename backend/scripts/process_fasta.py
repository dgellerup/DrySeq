import json
import sys
from Bio import SeqIO

def parse_fasta(file_path: str):
    records = {}
    for record in SeqIO.parse(file_path, "fasta"):
        records[record.id] = record.seq
    return records

def process_fastas(primers_path: str, reference_path: str):
    primers = parse_fasta(primers_path)
    references = parse_fasta(reference_path)

    result = {
        "primer_count": len(primers),
        "reference_count": len(references),
    }
    print(json.dumps(result))

if __name__ == "__main__":
    process_fastas(sys.argv[1], sys.argv[2])