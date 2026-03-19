import React, { useState } from "react";
import { Card } from "../common/Card";
import { Button } from "../common/Button";

type Props = {
  onUpload: (formData: FormData) => Promise<void>;
  loading: boolean;
};

export function UploadEtlForm({ onUpload, loading }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const inputCss: React.CSSProperties = {
    width: "100%", padding: "7px 10px", borderRadius: 8,
    border: "1px solid #e2e8f0", background: "#f8fafc", color: "#0f172a",
    fontSize: 13, marginTop: 5, boxSizing: "border-box",
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", description);
    formData.append("version", version);
    formData.append("zip_file", selectedFile);

    await onUpload(formData);

    // Reset form
    setName("");
    setDescription("");
    setVersion("1.0");
    setSelectedFile(null);
  }

  return (
    <Card>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>
        Upload new ETL (zip)
      </h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} required style={inputCss} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            rows={3} style={{ ...inputCss, resize: "vertical" }} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Version</label>
          <input value={version} onChange={e => setVersion(e.target.value)}
            style={{ ...inputCss, maxWidth: 120 }} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>ZIP file *</label>
          <div style={{ marginTop: 5 }}>
            <input type="file" accept=".zip" required
              onChange={e => setSelectedFile(e.target.files?.[0] ?? null)} style={{ fontSize: 13 }} />
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
            Include main.py, config.json (with input_requirements), requirements.txt
          </div>
        </div>

        <Button type="submit" disabled={loading || !name || !selectedFile}>
          {loading ? "Uploading…" : "Upload ETL"}
        </Button>
      </form>
    </Card>
  );
}