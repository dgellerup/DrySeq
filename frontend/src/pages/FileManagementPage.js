import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext"; // assuming token there
import { toast } from "react-toastify";

export default function FileManagementPage() {
    const { token } = useAuth();

    const [fastaFiles, setFastaFiles] = useState([]);
    const [fastqFiles, setFastqFiles] = useState([]);

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
            const res = await fetch(`http://localhost:5000/download/${fileId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "file.fasta"; // optionally replace with dynamic filename
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            console.error("Failed to download file:", err);
        }
    };

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
        }
    };

    const renderTable = (files, label) => (
                <>
            <h2 className="text-xl font-bold my-4">{label} ({files.length})</h2>
            <table className="w-full table-auto border-collapse">
                <thead>
                    <tr className="bg-gray-200 text-left">
                        <th className="p-2 border">Filename</th>
                        <th className="p-2 border">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {files.map((file) => (
                        <tr key={file.id} className="border-t">
                            <td className="p-2 border">{file.filename}</td>
                            <td className="p-2 border space-x-2">
                                <button
                                    className="bg-blue-500 text-white px-3 py-1 rounded"
                                    onClick={() => handleDownload(file.id)}
                                >
                                    Download
                                </button>
                                <button
                                    className="bg-red-500 text-white px-3 py-1 rounded"
                                    onClick={() => handleDelete(file.id)}
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                    {files.length === 0 && (
                        <tr>
                            <td colSpan={2} className="p-2 text-gray-500 italic text-center">
                                No files found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </>
    );

    return (
        <div className="p-4">
            {renderTable(fastaFiles, "FASTA Files")}
            {renderTable(fastqFiles, "FASTQ Files")}
        </div>
    );
}