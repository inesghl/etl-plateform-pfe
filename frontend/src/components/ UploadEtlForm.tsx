import React, { useState, useRef } from "react";

type Props = {
  onUpload: (formData: FormData) => Promise<void>;
  loading: boolean;
};

export function UploadEtlForm({ onUpload, loading }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
const fileInputRef = useRef<HTMLInputElement | null>(null);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", description);
    formData.append("version", version);
    formData.append("zip_file", selectedFile);
    await onUpload(formData);
    setName("");
    setDescription("");
    setVersion("1.0");
    setSelectedFile(null);
  };

  return (
    <section style={{ marginBottom: 24 }}>
      <form
        onSubmit={handleSubmit}
        style={{
          padding: 16,
          borderRadius: 12,
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          boxShadow: "0 4px 8px rgba(15,23,42,0.04)"
        }}
      >
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Upload new ETL (zip)</h2>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              color: "#0f172a",
              fontSize: 14
            }}
            required
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              color: "#0f172a",
              fontSize: 14,
              resize: "vertical"
            }}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>Version</label>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            style={{
              width: "100%",
              maxWidth: 140,
              padding: "6px 8px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              color: "#0f172a",
              fontSize: 14
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>ETL zip file</label>
          <input
            type="file"
            accept=".zip"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: 13 }}
          />
          <p style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            Expected: zip with main.py, config.json, requirements.txt, etc.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "8px 12px",
            borderRadius: 999,
            border: "none",
            background: "#0f172a",
            color: "white",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? "Uploading..." : "Upload ETL"}
        </button>
      </form>
    </section>
  );
}
