import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function UploadPage() {
    const [file, setFile] = useState(null);
    const [category, setCategory] = useState("genomic");
    const [uploadSuccess, setUploadSuccess] = useState("");
    const [uploadError, setUploadError] = useState("");
    const [analyzeSuccess, setAnalyzeSuccess] = useState("");
    const [analyzeError, setAnalyzeError] = useState("");

    const { token } = useAuth();

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file) return;

        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", category);

        let data = null;
        try {
          const uploadFastaResponse = await fetch("http://localhost:5000/upload", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formData,
          });

          if (!uploadFastaResponse.ok) {
            const errData = await uploadFastaResponse.json();
            setUploadError(errData.error || "Upload failed");
            return;
          }

          data = await uploadFastaResponse.json();

          setUploadSuccess(`Uploaded to ${data.category}`);
          setUploadError("");

        } catch (err) {
          setUploadError("Upload: Could not connect to the server.");
        }

        try {

          const analyzeFastaResponse = await fetch("http://localhost:5000/analyze-fasta", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ fileId: data.fileId }),
          });

          if (!analyzeFastaResponse.ok) {
            const analyzeErrData = await analyzeFastaResponse.json();
            setAnalyzeError(analyzeErrData.error || "Processing FASTA failed");
            return;
          }

          setAnalyzeSuccess(`${data.filename} processed successfully.`);
          setAnalyzeError("");

        } catch (err) {
          setAnalyzeError("FASTA Analysis: Could not connect to the server.");
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
      {uploadError && <p style={{ color: "red" }}>{uploadError}</p>}
      {uploadSuccess && <p style={{ color: "green" }}>{uploadSuccess}</p>}
      {analyzeError && <p style={{ color: "red" }}>{analyzeError}</p>}
      {analyzeSuccess && <p style={{ color: "green" }}>{analyzeSuccess}</p>}
    </div>
  );
}