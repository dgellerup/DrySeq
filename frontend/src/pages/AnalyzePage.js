import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";

import { useAuth } from "../contexts/AuthContext";

import "./AnalyzePage.css";

export default function AnalyzePage() {
    const [primerFiles, setPrimerFiles] = useState([]);
    const [referenceFiles, setReferenceFiles] = useState([]);
    const [primerFile, setPrimerFile] = useState("");
    const [referenceFile, setReferenceFile] = useState("");
    const [result, setResult] = useState("");
    const [loading, setLoading] = useState("");

    const { token } = useAuth();

    useEffect(() => {
        const fetchFiles = async () => {
            try {
                const res = await fetch("http://localhost:5000/fasta-files", {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (!res.ok) {
                    const errText = await res.text(); // fallback in case it's HTML or text
                    console.error("Failed to fetch files:", errText);
                    return;
                }

                const files = await res.json();

                const primers = files.filter(file => file.category === "PRIMER");
                const genomics = files.filter(file => file.category === "GENOMIC");

                setPrimerFiles(primers);
                setReferenceFiles(genomics);
            } catch (err) {
                console.error("Error fetching files:", err);
            }
        };

        if (token) {
            fetchFiles();
        }
    }, [token]);

    const handleAnalyze = async () => {
        if (!primerFile || !referenceFile) {
            alert("Please select both a primer file and a reference file.");
            return;
        }

        setLoading(true);
        setResult("");

        try {
            const res = await fetch("http://localhost:5000/create-fastq", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    primerFileId: primerFile,
                    referenceFileId: referenceFile,
                    sampleName: "test-123",
                    sequenceCount: 200,
                }),
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || "Analysis request failed");
            }

            const data = await res.json();

            toast.info(
                <div>
                    {data.message} <br /> {data.sampleName}
                </div>
                )

            setResult(data.result);
        } catch (err) {
            setResult(`Error: ${err.message}`);
            const errorMsg = `FASTQ Files Creation Failed - ${err.message}`;
            toast.info(errorMsg);
        } finally {
            setLoading(false);
        }
    };

return (
    <div className="analyze-container">
        <h2 className="analyze-title">Create Paired FASTQs</h2>
        {!token ? (
            <p>Please log in</p>
        ) : (
            <>
                <div>
                    <label className="analyze-label">Primer File:</label>
                    <select
                        value={primerFile}
                        onChange={(e) => setPrimerFile(parseInt(e.target.value))}
                        className="analyze-select"
                    >
                        <option value="" disabled hidden>Select Primer File</option>
                        {primerFiles.map((file) => (
                            <option key={file.id} value={file.id}>
                                {file.filename}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="analyze-label">Reference File:</label>
                    <select
                        value={referenceFile}
                        onChange={(e) => setReferenceFile(parseInt(e.target.value))}
                        className="analyze-select"
                    >
                        <option value="" disabled hidden>Select Reference File</option>
                        {referenceFiles.map((file) => (
                            <option key={file.id} value={file.id}>
                                {file.filename}
                            </option>
                        ))}
                    </select>
                </div>

                <button
                    onClick={handleAnalyze}
                    disabled={loading}
                    style={{ marginTop: "20px" }}
                >
                    {loading ? "Creating..." : "Create FASTQs"}
                </button>

            </>
        )}
    </div>
    );
}