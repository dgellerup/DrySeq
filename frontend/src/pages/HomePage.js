import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext"; // assuming token there
import { API_BASE } from "../api";

export default function HomePage() {
    const { token } = useAuth();

    const [fastaFiles, setFastaFiles] = useState([]);
    const [fastqAnalyses, setFastqAnalyses] = useState([]);

    const fetchFastaFiles = async() => {
        try {
            const res = await fetch(`${API_BASE}/fasta-files`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setFastaFiles(data);
        } catch (err) {
            console.error("Failed to fetch FASTA files:", err);
        }
    };

    const fetchFastqAnalyses = async() => {
        try {
            const res = await fetch(`${API_BASE}/fastq-files`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setFastqAnalyses(data);
        } catch (err) {
             console.error("Failed to fetch FASTQ files:", err);
        }
    }

    useEffect(() => {
        if (!token) return;

        fetchFastaFiles();
        fetchFastqAnalyses();

        // const interval = setInterval(() => {
        //     fetchFastqAnalyses();
        // }, 15000);

        // return () => clearInterval(interval);
    }, [token]);


    return (
        <div>
            <div>
                <h2>Welcome to DrySeq</h2>
                <p>This is your personal sequence analysis dashboard.</p>
                <p>Please use the sidebar to upload genomic or primer sequences, or to start an analysis.</p>
            </div>
            <div className="p-4">
              <h2 className="text-xl font-bold mb-4">Uploaded FASTA Files ({ fastaFiles.length }/6)</h2>  
              <ul className="space-y-4">
                {fastaFiles.length === 0 ? (
                    <p>No FASTA Files Uploaded Yet.</p>
                ) : (
                    fastaFiles.map((file) => (
                    <li key={file.id} className="border p-2 rounded">
                        <div>
                            <strong>{file.filename}</strong> - {file.category} - {file.fastaAnalysis?.result || "Processing"}
                        </div>
                        <div className="text-sm text-gray-600">
                            Uploaded: {new Date(file.uploadedAt).toLocaleString()}
                        </div>
                        {file.primerAnalyses?.length > 0 && (
                            <div className="mt-2">
                                <strong>Used as Primer in:</strong>
                                <ul className="ml-4 list-disc">
                                    {file.primerAnalyses.map((a) => (
                                        <li key={a.id}>
                                            {a.sampleName}: vs {a.fastqFileR1.filename} + {a.fastqFileR2.filename}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </li>
                    )
                    ))}
                </ul>

            <h2 className="text-xl font-bold mt-10 mb-4">Generated FASTQ Files ({ fastqAnalyses.length }/3)</h2>    
            <ul className="space-y-4">
                {fastqAnalyses.length === 0 && <p>No FASTQ Files Generated Yet</p>}
                {fastqAnalyses.map((analysis) => (
                    <li key={analysis.id} className="border p-2 rounded">
                        <div>
                            <strong>{analysis.analysisName}</strong> - {analysis.sequenceCount} reads
                        </div>
                        <div className="text-sm text-gray-600">
                            R1: {analysis.fastqFileR1.filename}<br />
                            R2: {analysis.fastqFileR2.filename}<br />
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                            PCR Input: {analysis.pcrFilename}<br />
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                            Created: {new Date(analysis.createdAt).toLocaleString()}
                        </div>
                    </li>
                ))}
            </ul>
            </div>
        </div>
    );
}