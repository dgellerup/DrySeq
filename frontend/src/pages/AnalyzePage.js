import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";

import { useAuth } from "../contexts/AuthContext";

import { API_BASE } from "../api";

import "./AnalyzePage.css";

export default function AnalyzePage() {
    const [analysisName, setAnalysisName] = useState("");
    const [sampleName, setSampleName] = useState("");
    const [sequenceCount, setSequenceCount] = useState("");

    const [pcrFiles, setPcrFiles] = useState([]);
    const [pcrFile, setPcrFile] = useState("");
    const [referenceFile, setReferenceFile] = useState("");
    const [loading, setLoading] = useState("");

    const { token } = useAuth();

    useEffect(() => {
        const fetchFiles = async () => {
            try {
                const res = await fetch(`${API_BASE}/fasta-files`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (!res.ok) {
                    const errText = await res.text(); // fallback in case it's HTML or text
                    console.error("Failed to fetch files:", errText);
                    return;
                }

                const files = await res.json();

                const pcrs = files.filter(file => file.category === "PCR");

                setPcrFiles(pcrs);
            } catch (err) {
                console.error("Error fetching files:", err);
            }
        };

        if (token) {
            fetchFiles();
        }
    }, [token]);

    const handleAnalyze = async (event) => {
        event.preventDefault();

        if (!pcrFile || !analysisName || !sampleName || !sequenceCount) {
            alert("Please fill in all fields.");
            return;
        }

        setLoading(true);

        try {
            const res = await fetch(`${API_BASE}/create-fastq`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    pcrFileId: pcrFile,
                    analysisName: analysisName,
                    sampleName: sampleName,
                    sequenceCount: sequenceCount,
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

        } catch (err) {
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
                <form onSubmit={handleAnalyze}>
                    <div>
                        <label>Analysis Name:</label>
                        <input
                            type="text"
                            value={analysisName}
                            onChange={(e) => setAnalysisName(e.target.value)}
                            required
                        />
                    </div>

                    <div>
                        <label>Sample Name:</label>
                        <input
                            type="text"
                            value={sampleName}
                            onChange={(e) => setSampleName(e.target.value)}
                            required
                        />
                    </div>

                    <div>
                        <label>Number of Sequences (max 50,000):</label>
                        <input
                            type="number"
                            min="1"
                            max="50000"
                            value={sequenceCount}
                            onChange={(e) => setSequenceCount(parseInt(e.target.value))}
                            required
                        />
                    </div>

                    <div>
                        <label>PCR File:</label>
                        <select
                            value={pcrFile}
                            onChange={(e) => setPcrFile(parseInt(e.target.value))}
                            className="analyze-select"
                        >
                            <option value="" disabled hidden>Select PCR File</option>
                            {pcrFiles.map((file) => (
                                <option key={file.id} value={file.id}>
                                    {file.filename}
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        style={{ marginTop: "15px" }}
                    >
                        {loading ? "Creating..." : "Create FASTQs"}
                    </button>
                </form>
                
            </>
        )}
    </div>
    );
}