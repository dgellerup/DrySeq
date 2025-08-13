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

        // const interval = setInterval(() => {
        //     fetchFastqAnalyses();
        // }, 15000);

        // return () => clearInterval(interval);
    }, [token]);


    return (
        <div>
            <div>
                <h2>Welcome to DrySeq</h2>
                <p>Please use the sidebar to upload genomic or primer sequences, or to start an analysis.</p>
            </div>
        </div>
    );
}