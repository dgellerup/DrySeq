import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";

import { useAuth } from "../contexts/AuthContext";

import "./AnalyzePage.css";

export default function PCRPage() {
    const [pcrAnalysisName, setpcrAnalysisName] = useState("");
    const [cyclesCount, setCyclesCount] = useState("");

    const [primerFiles, setPrimerFiles] = useState([]);
    const [referenceFiles, setReferenceFiles] = useState([]);
    const [primerFile, setPrimerFile] = useState("");
    const [referenceFile, setReferenceFile] = useState("");
    const [loading, setLoading] = useState("");


    const { token } = useAuth();

    useEffect(() => {
        const fetchFiles = async () => {
            try {
                const res = await fetch("http://localhost:5000/fasta-files", {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (!res.ok) {
                    const errText = await res.text();
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

        const handleAnalyze = async (event) => {
            event.preventDefault();
    
            if (!primerFile || !referenceFile || !pcrAnalysisName || !cyclesCount) {
                alert("Please fill in all fields.");
                return;
            }
    
            setLoading(true);
    
            try {
                const res = await fetch("http://localhost:5000/run-pcr", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        primerFileId: primerFile,
                        referenceFileId: referenceFile,
                        pcrAnalysisName: pcrAnalysisName,
                        cyclesCount: cyclesCount,
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
                const errorMsg = `PCR Run Failed - ${err.message}`;
                toast.info(errorMsg);
            } finally {
                setLoading(false);
            }
        };   


return (
    <div className="analyze-container">
        <h2 className="analyze-title">Run PCR Amplification</h2>
        {!token ? (
            <p>Please log in</p>
        ) : (
            <>
                <form onSubmit={handleAnalyze}>
                    <div>
                        <label>PCR Run Name:</label>
                        <input
                            type="text"
                            value={pcrAnalysisName}
                            onChange={(e) => setpcrAnalysisName(e.target.value)}
                            required
                        />
                    </div>

                    <div>
                        <label>Number of Cycles (max 50):</label>
                        <input
                            type="number"
                            min="1"
                            max="50"
                            value={cyclesCount}
                            onChange={(e) => setCyclesCount(parseInt(e.target.value))}
                            required
                        />
                    </div>

                    <div>
                        <label>Primer File:</label>
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
                        <label>Reference File:</label>
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
                        type="submit"
                        disabled={loading}
                        style={{ marginTop: "15px" }}
                    >
                        {loading ? "Running..." : "Run PCR"}
                    </button>
                </form>
                
            </>
        )}
    </div>
    );
}