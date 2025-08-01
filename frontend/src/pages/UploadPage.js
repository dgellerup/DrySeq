import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function UploadPage() {
    const [file, setFile] = useState(null);
    const [category, setCategory] = useState("genomic");
    const [message, setMessage] = useState("");

    const { token } = useAuth();

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file) return;

        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", category);

        try {
          const res = await fetch("http://localhost:5000/upload", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formData,
          });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText);
          }

          const data = await res.json();
          setMessage(`Uploaded to ${data.category}`);
        } catch (err) {
          setMessage(`Error: ${err.message}`);
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
      {message && <p>{message}</p>}
    </div>
  );
}