import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext"; // assuming token there

export default function HomePage() {
    const { token } = useAuth();

    const [fastaFiles, setFastaFiles] = useState([]);
    const [fastqFiles, setFastqFiles] = useState([]);

    const fetchFastaFiles = async() => {
        try {
            const res = await fetch("http://localhost:5000/fasta-files", {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setFastaFiles(data);
        } catch (err) {
            console.error("Failed to fetch FASTA files:", err);
        }
    };

    const fetchFastqFiles = async() => {
        try {
            const res = await fetch("http://localhost:5000/fastq-files", {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setFastqFiles(data);
        } catch (err) {
             console.error("Failed to fetch FASTQ files:", err);
        }
    }

    useEffect(() => {
        if (!token) return;

        fetchFastaFiles();
        fetchFastqFiles();

        // const interval = setInterval(() => {
        //     fetchFastqFiles();
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
                {fastaFiles.map((file) => (
                    <li key={file.id} className="border p-2 rounded">
                        <div>
                            <strong>{file.filename}</strong> - {file.category} - {file.analysisResult || "Processing"}
                        </div>
                        <div className="text-sm text-gray-600">
                            Uploaded: {new Date(file.uploadedAt).toLocaleString()}
                        </div>
                        {file.metadata?.content && (
                            <div className="mt-2">
                                <em>Metadata:</em> <pre>{file.metadata.content}</pre>
                            </div>
                        )}
                        {file.primerAnalyses?.length > 0 && (
                            <div className="mt-2">
                                <strong>Used as Primer in:</strong>
                                <ul className="ml-4 list-disc">
                                    {file.primerAnalyses.map((a) => (
                                        <li key={a.id}>
                                            vs {a.referenceFile?.filename} - <pre>{a.result}</pre>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {file.referenceAnalyses?.length > 0 && (
                            <div className="mt-2">
                                <strong>Used as Reference in:</strong>
                                <ul className="ml-4 list-disc">
                                    {file.referenceAnalyses.map((a) => (
                                        <li key={a.id}>
                                            with {a.primerFile?.filename} - <pre>{a.result}</pre>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </li>
                ))}
            </ul>

            <h2 className="text-xl font-bold met-10 mb-4">Generated FASTQ Files ({ fastqFiles.length }/3)</h2>    
            <ul className="space-y-4">
                {fastqFiles.length == 0 && <p>No FASTQ Files Generated Yet</p>}
                {fastqFiles.map((file) => (
                    <li key={file.id} className="border p-2 rounded">
                        <div><strong>{file.filename}</strong></div>
                        <div className="text-sm text-gray-600">
                            Generated: {new DataTransfer(file.uploadedAt).toLocaleString()}
                        </div>
                        {file.metadata?.content && (
                            <div className="mt-2">
                                <em>Metadata:</em> <pre>{file.metadata.content}</pre>
                            </div>
                        )}
                        {file.fastqAnalyses?.length > 0 && (
                            <div className="mt-2">
                                <strong>Analysis Result:</strong>
                                <pre>{file.fastqAnalyses[0].result}</pre>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
            </div>
        </div>
    );
}