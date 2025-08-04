import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext"; // assuming token there
import { toast } from "react-toastify";
import { Download, Trash2 } from "lucide-react";

import ConfirmDialogModal from "../components/ConfirmDialogModal";

import "./FileTable.css";

export default function FileManagementPage() {
    const { token } = useAuth();

    const [fastaFiles, setFastaFiles] = useState([]);
    const [FastqAnalyses, setFastqAnalyses] = useState([]);

    const [fileToDelete, setFileToDelete] = useState(null);
    const [analysisToDelete, setAnalysisToDelete] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const fetchFastaFiles = useCallback(async() => {
        try {
            const res = await fetch("http://localhost:5000/fasta-files", {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setFastaFiles(data);
        } catch (err) {
            console.error("Failed to fetch FASTA files:", err);
        }
    }, [token]);

    const fetchFastqAnalyses = useCallback(async() => {
        try {
            const res = await fetch("http://localhost:5000/fastq-files", {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setFastqAnalyses(data);
        } catch (err) {
             console.error("Failed to fetch FASTQ files:", err);
        }
    }, [token]);

    useEffect(() => {
        if (!token) return;

        fetchFastaFiles();
        fetchFastqAnalyses();

    }, [token, fetchFastaFiles, fetchFastqAnalyses]);

    const handleDownload = async (fileId) => {
        try {
            const file =
                fastaFiles.find((f) => f.id === fileId) ||
                FastqAnalyses.find((f) => f.id === fileId);

            const res = await fetch(`http://localhost:5000/download/${fileId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = file.filename; // optionally replace with dynamic filename
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            console.error("Failed to download file:", err);
        }
    };

    const handleDeleteFastaClick = (file) => {
        setFileToDelete(file);
        setConfirmOpen(true);
    }

    const handleDeleteFastqClick = (analysis) => {
        setAnalysisToDelete(analysis);
        setConfirmOpen(true);
    }

    const handleDeleteFile = async () => {
        if (!fileToDelete) return;

        try {
            const file =
                fastaFiles.find((f) => f.id === fileToDelete.id) ||
                FastqAnalyses.find((f) => f.id === fileToDelete.id);

            await fetch(`http://localhost:5000/delete/${fileToDelete.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });

            await fetchFastaFiles();
            await fetchFastqAnalyses();

            
            if (file) {
                toast.info(`"${file.filename}" has been deleted.`);
            } else {
                toast.info(`File deleted.`);
            }
            
        } catch (err) {
            console.error("Failed to delete file:", err);
            toast.error("Failed to delete file.");
        } finally {
            setConfirmOpen(false);
            setFileToDelete(null);
        }
    };

    const handleDeleteAnalysis = async () => {
        if (!analysisToDelete) return;

        try {
            await fetch(`http://localhost:5000/delete-fastq-analysis/${analysisToDelete.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });

            toast.info("FASTQ analysis and files deleted.");
            await fetchFastqAnalyses();
        } catch (err) {
            console.error("Failed to delete analysis:", err);
            toast.error("Failed to delete FASTQ analysis.");
        } finally {
            setConfirmOpen(false);
            setAnalysisToDelete(null);
        }
    }

    const getSequenceCount = (file) => {
        
        if (file.category === "GENOMIC" || file.category === "PRIMER") {
            const match = file.fastaAnalysis?.result?.match(/Found (\d+) sequences/i);
            return match ? parseInt(match[1], 10) : "N/A";
        }
        
        if (file.fastqAnalyses?.length > 0) {
            return file.fastqAnalyses[0].sequenceCount ?? "N/A";
        }

        return "N/A";
    };

    const renderFastasTable = (files) => (
        <>
            <h2 className="text-xl font-bold my-4">FASTA Files ({files.length})</h2>
            <table className="w-full table-auto border-collapse">
                <thead>
                    <tr className="bg-gray-200 text-left">
                        <th className="p-2 border">Filename</th>
                        <th className="p-2 border text-center">Sequences</th>
                        <th className="p-2 border text-right">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {files.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="p-2 text-gray-500 italic text-center">
                                No files found.
                                </td>
                            </tr>
                            ) : (
                    files.map((file, index) => (
                        <tr
                            key={file.id}
                            className="border-t"
                        >
                            <td className="p-2 border">{file.filename}</td>
                            <td className="p-2 border">{getSequenceCount(file)}</td>
                            <td className="p-2 border space-x-2">
                                <button
                                    title="Download"
                                    className="download-button"
                                    onClick={() => handleDownload(file.id)}
                                >
                                    <Download size={18} />
                                </button>
                                <button
                                    title="Delete"
                                    className="delete-button"
                                    onClick={() => handleDeleteFastaClick(file)}
                                >
                                    <Trash2 size={18} />
                                </button>
                            </td>
                        </tr>
                        ))
                    )}
                </tbody>
            </table>
        </>
    );

    const renderFastqsTable = (analyses) => (
        <>
            <h2 className="text-xl font-bold my-4">FASTQ Files ({analyses.length})</h2>
            <table className="w-full table-auto border-collapse">
                <thead>
                    <tr className="bg-gray-200 text-left">
                        <th className="p-2 border">Filename</th>
                        <th className="p-2 border text-center">Sequences</th>
                        <th className="p-2 border text-right">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {analyses.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="p-2 text-gray-500 italic text-center">
                                No files found.
                                </td>
                            </tr>
                            ) : (
                    analyses.map((analysis, index) => (
                        <tr
                            key={analysis.id}
                            className="border-t"
                        >
                            <td className="p-2 border">
                                R1: {analysis.fastqFileR1.filename}<br />
                                R2: {analysis.fastqFileR2.filename}<br />
                            </td>
                            <td className="p-2 border">{analysis.sequenceCount}</td>
                            <td className="p-2 border space-x-2">
                                <button
                                    title="Download"
                                    className="download-button"
                                    onClick={() => handleDownload(analysis.id)}
                                >
                                    <Download size={18} />
                                </button>
                                <button
                                    title="Delete"
                                    className="delete-button"
                                    onClick={() => handleDeleteFastqClick(analysis)}
                                >
                                    <Trash2 size={18} />
                                </button>
                            </td>
                        </tr>
                        ))
                    )}
                </tbody>
            </table>
        </>
    );

    return (
        <div className="p-4">
            {renderFastasTable(fastaFiles)}
            {renderFastqsTable(FastqAnalyses)}

            
            <ConfirmDialogModal
                isOpen={confirmOpen}
                onConfirm={
                    fileToDelete
                        ? () => handleDeleteFile(fileToDelete.id)
                        : () => handleDeleteAnalysis()
                    }
                onCancel={() => {
                    setConfirmOpen(false);
                    setFileToDelete(null);
                    setAnalysisToDelete(null);
                }}
                message={
                    fileToDelete
                        ? `Are you sure you want to delete "${fileToDelete?.filename}"?`
                        : `Are you sure you want to delete the FASTQ analysis for "${analysisToDelete?.fastqFileR1?.filename}" + "${analysisToDelete?.fastqFileR2?.filename}"?`
                }
            />
        </div>
    );
}