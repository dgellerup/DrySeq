import React, { useState } from "react";
import { toast } from "react-toastify";

import { useAuth } from "../contexts/AuthContext";

import { API_BASE } from "../api";

import "./AnalyzePage.css";

export default function UploadPage() {
    const [file, setFile] = useState(null);
    const [category, setCategory] = useState("");

    const [loading, setLoading] = useState("");

    const { token } = useAuth();

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file) return;

        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", category);

        setLoading(true);

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
        } finally {
          setLoading(false);
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
      <div className="analyze-container">
        <h2 className="analyze-title">Upload FASTA File</h2>
        {!token ? (
          <p>Please log in</p>
        ) : (
          <form onSubmit={handleUpload}>
            <div>
              <label>Select File</label>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files[0])}
                accept=".fa,.fasta"
                required />
            </div>

            <fieldset className="field">
              <label>Select Category</label>

              <div className="seg" role="radiogroup" aria-label="Select Category">
                <label className={`seg-pill ${category === 'genomic' ? 'is-active' : ''}`}>
                  <input
                    className="sr-only"
                    type="radio"
                    name="category"
                    value="genomic"
                    checked={category === 'genomic'}
                    onChange={(e) => setCategory(e.target.value)}
                    required={!category}              // force a choice
                  />
                  <span>Genomic</span>
                </label>

                <label className={`seg-pill ${category === 'primer' ? 'is-active' : ''}`}>
                  <input
                    className="sr-only"
                    type="radio"
                    name="category"
                    value="primer"
                    checked={category === 'primer'}
                    onChange={(e) => setCategory(e.target.value)}
                    required={!category}
                  />
                  <span>Primer</span>
                </label>
              </div>
            </fieldset>

            <button
              type="submit"
              disabled={!category}
              style={{ marginTop: "15px" }}
            >
              {loading ? "Uploading..." : "Upload"}
            </button>
          </form>
        )}
      </div>
    );
}