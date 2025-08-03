import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext"; // assuming token there
import { toast } from "react-toastify";
import { Download, Trash2 } from "lucide-react";

import ConfirmDialogModal from "../components/ConfirmDialogModal";

import "./FileTable.css";

export default function FileManagementPage() {
    const { token } = useAuth();

    const [fastaFiles, setFastaFiles] = useState([]);
    const [fastqFiles, setFastqFiles] = useState([]);

    const [fileToDelete, setFileToDelete] = useState(null);
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

    const fetchFastqFiles = useCallback(async() => {
        try {
            const res = await fetch("http://localhost:5000/fastq-files", {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setFastqFiles(data);
        } catch (err) {
             console.error("Failed to fetch FASTQ files:", err);
        }
    }, [token]);

    useEffect(() => {
        if (!token) return;

        fetchFastaFiles();
        fetchFastqFiles();

    }, [token, fetchFastaFiles, fetchFastqFiles]);

    const handleDownload = async (fileId) => {
        try {
            const file =
                fastaFiles.find((f) => f.id === fileId) ||
                fastqFiles.find((f) => f.id === fileId);

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

    const handleDeleteClick = (file) => {
        setFileToDelete(file);
        setConfirmOpen(true);
    }

    const handleDelete = async (fileId) => {
        try {
            const file =
                fastaFiles.find((f) => f.id === fileId) ||
                fastqFiles.find((f) => f.id === fileId);

            await fetch(`http://localhost:5000/delete/${fileId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });

            await fetchFastaFiles();
            await fetchFastqFiles();

            
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

    const getSequenceCount = (file) => {
        console.log("Metadata for file:", file.metadata);
        const foundMeta = file.metadata?.find((m) => m.key === "analysis_result");
        console.log("Found metadata:", foundMeta);
        if (!foundMeta) return "N/A";

        const match = foundMeta.value.match(/Found (\d+) sequences/i);
        return match ? parseInt(match[1], 10) : "N/A";
    };

    const renderTable = (files, label) => (
        <>
            <h2 className="text-xl font-bold my-4">{label} ({files.length})</h2>
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
                                    onClick={() => handleDeleteClick(file)}
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
            {renderTable(fastaFiles, "FASTA Files")}
            {renderTable(fastqFiles, "FASTQ Files")}

            
            <ConfirmDialogModal
                isOpen={confirmOpen}
                onConfirm={() => handleDelete(fileToDelete.id)}
                onCancel={() => setConfirmOpen(false)}
                message={`Are you sure you want to delete "${fileToDelete?.filename}"?`}
            />
        </div>
    );
}