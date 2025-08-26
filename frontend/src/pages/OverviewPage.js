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
        if (!token) {
            setFastaFiles([]);
            setFastqAnalyses([]);
            return;
        }

        fetchFastaFiles();
        fetchFastqAnalyses();

    }, [token]);


    return (
        <div>
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
                        {file.usedAsPrimerInPcr?.length > 0 && (
                            <div className="mt-2">
                                <strong>Used as Primer in:</strong>
                                <ul className="ml-4 list-disc">
                                    {file.usedAsPrimerInPcr.map((a) => (
                                        <li key={a.id}>
                                            {a.pcrAnalysisName ?? "(unnamed)"} - PCR: {a.pcrFile?.filename ?? "(output missing)"} - Ref: {a.referenceFile?.filename ?? "(missing)"}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {file.usedAsReferenceInPcr?.length > 0 && (
                            <div className="mt-2">
                                <strong>Used as Reference in:</strong>
                                <ul className="ml-4 list-disc">
                                {file.usedAsReferenceInPcr.map(a => (
                                    <li key={a.id}>
                                        {a.pcrAnalysisName ?? "(unnamed)"} — PCR: {a.pcrFile?.filename ?? "(output missing)"} — Primer: {a.primerFile?.filename ?? "(missing)"}
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
                            R1: {analysis.r1?.filename ?? "(missing)"}<br />
                            R2: {analysis.r2?.filename ?? "(missing)"}<br />
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                            PCR Input: {analysis.pcr.displayName ?? analysis.pcr?.filename ?? "(n/a)"}<br />
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