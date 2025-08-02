import json
import sys
from Bio import SeqIO

def parse_fasta(file_path: str):
    records = {}
    for record in SeqIO.parse(file_path, "fasta"):
        records[record.id] = record.seq
    return records

def process_fastas(fasta_path: str):
    sequences = parse_fasta(fasta_path)

    result = {
        "sequence_count": len(sequences)
    }
    print(json.dumps(result))

if __name__ == "__main__":
    process_fastas(sys.argv[1])