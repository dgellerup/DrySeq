import React, { useState } from "react";
import { uploadFile } from "../api";

export default function UploadPage() {
    const [file, setFile] = useState(null);
    const [category, setCategory] = useState("genomic");
    const [message, setMessage] = useState("");

    const token = localStorage.getItem("token");

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file) return;

        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", category);

        const res = await fetch("http://localhost:5000/upload", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`},
            body: formData
        });

        const data = await res.json();
        setMessage(res.ok ? `Uploaded to ${data.category}` : `Error: ${data.error}`);
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
      {message && <p>{message}</p>}
    </div>
  );
}