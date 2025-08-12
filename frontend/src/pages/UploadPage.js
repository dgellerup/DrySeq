import React, { useState } from "react";
import { toast } from "react-toastify";

import { useAuth } from "../contexts/AuthContext";

import { API_BASE } from "../api";

export default function UploadPage() {
    const [file, setFile] = useState(null);
    const [category, setCategory] = useState("genomic");

    const { token } = useAuth();

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file) return;

        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", category);

        let data = null;
        try {
          const uploadFastaResponse = await fetch(`${API_BASE}/upload`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formData,
          });

          if (!uploadFastaResponse.ok) {
            const errData = await uploadFastaResponse.json();
            const errorMsg = errData.error || "Upload failed";
            toast.info(errorMsg);
            return;
          }

          data = await uploadFastaResponse.json();

          const message = `Uploaded to ${data.category}`;

          toast.info(message);

        } catch (err) {
          const errorMsg = "Upload: Could not connect to the server.";
          toast.info(errorMsg);
        }

        try {
          const analyzeFastaResponse = await fetch(`${API_BASE}/analyze-fasta`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ fileId: data.fileId }),
          });
          
          if (!analyzeFastaResponse.ok) {
            const analyzeErrData = await analyzeFastaResponse.json();
            const errorMsg = analyzeErrData.error || "Processing FASTA failed";
            toast.info(errorMsg);
            return;
          }

          const message = `${data.filename} processed successfully.`;

          toast.info(message);

        } catch (err) {
          const errorMsg = "FASTA Analysis: Could not connect to the server.";
          toast.info(errorMsg);
        }
    };

    return (
    <div>
      <h2>Upload FASTA File</h2>
      {!token ? (
        <p>Please log in</p>
      ) : (
        <form onSubmit={handleUpload}>
          <input type="file" onChange={(e) => setFile(e.target.files[0])} accept=".fa,.fasta" required />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="genomic">Genomic</option>
            <option value="primer">Primer</option>
          </select>
          <button type="submit">Upload</button>
        </form>
      )}
    </div>
  );
}