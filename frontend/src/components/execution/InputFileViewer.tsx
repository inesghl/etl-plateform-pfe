import React, { useState, useEffect } from "react";
import { Execution } from "../../types/execution";
import { Card } from "../common/Card";
import { Badge } from "../common/Badge";
import { apiFetch } from "../../api/api";

type Props = {
  execution: Execution;
  onClose: () => void;
};

export function InputFileViewer({ execution, onClose }: Props) {
  const [inputsData, setInputsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInputsData();
  }, [execution.id]);

  async function loadInputsData() {
    try {
      const data = await apiFetch(`/executions/${execution.id}/available_inputs/`);
      setInputsData(data);
    } catch (e) {
      console.error("Failed to load inputs:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadDefault(filename: string) {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(
        `http://localhost:8000/api/executions/${execution.id}/download-default-input/${filename}/`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      alert('Failed to download file');
      console.error(e);
    }
  }

  if (loading) {
    return (
      <div style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100
      }}>
        <Card style={{ padding: 40 }}>Loading inputs...</Card>
      </div>
    );
  }

  if (!inputsData) return null;

  const hasUserUploads = inputsData.user_uploads && inputsData.user_uploads.length > 0;
  const hasDefaults = inputsData.default_inputs && inputsData.default_inputs.length > 0;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15,23,42,0.55)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 100
    }}>
      <Card style={{ width: "90%", maxWidth: 700, maxHeight: "90vh", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Input Files Used</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              {execution.execution_label || execution.etl_name}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
              color: "#94a3b8"
            }}
          >
            ×
          </button>
        </div>

        {/* User Uploaded Files */}
        {hasUserUploads && (
          <div style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#15803d",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 6
            }}>
              ✓ YOUR UPLOADED FILES (Used in execution)
            </div>
            {inputsData.user_uploads.map((upload: any) => (
              <div
                key={upload.id}
                style={{
                  padding: 14,
                  marginBottom: 8,
                  borderRadius: 8,
                  background: "#f0fdf4",
                  border: "2px solid #86efac"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#15803d" }}>
                      ✓ {upload.original_filename}
                    </div>
                    <div style={{ fontSize: 11, color: "#16a34a", marginTop: 4 }}>
                      Key: {upload.file_key} · {(upload.file_size / 1024).toFixed(1)} KB
                    </div>
                    <div style={{ fontSize: 11, color: "#15803d", marginTop: 2, fontWeight: 600 }}>
                      This file replaced the default
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Badge label="USED" color="#16a34a" />
                    {upload.file_url && (
                      <a
                        href={upload.file_url}
                        download
                        style={{
                          fontSize: 11,
                          color: "#16a34a",
                          textDecoration: "none",
                          padding: "6px 12px",
                          border: "1px solid #86efac",
                          borderRadius: 6,
                          background: "#fff",
                          fontWeight: 600
                        }}
                      >
                        ⬇ Download
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Default Files */}
        {hasDefaults && (
          <div>
            <div style={{
              fontSize: 12,
              fontWeight: 700,
              color: hasUserUploads ? "#94a3b8" : "#3b82f6",
              marginBottom: 10
            }}>
              {hasUserUploads ? "📦 DEFAULT FILES (Not used - replaced by uploads)" : "📦 DEFAULT FILES (Used in execution)"}
            </div>
            {inputsData.default_inputs.map((file: any, idx: number) => {
              // Check if this default was replaced
              const wasReplaced = inputsData.user_uploads?.some((u: any) => {
                const uploadKey = u.file_key.toLowerCase();
                const fileNameNoExt = file.filename.replace(/\.[^/.]+$/, "").toLowerCase();
                return uploadKey === fileNameNoExt;
              });

              return (
                <div
                  key={idx}
                  style={{
                    padding: 14,
                    marginBottom: 8,
                    borderRadius: 8,
                    background: wasReplaced ? "#fef2f2" : "#eff6ff",
                    border: `2px solid ${wasReplaced ? "#fca5a5" : "#93c5fd"}`,
                    opacity: wasReplaced ? 0.7 : 1
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: wasReplaced ? "#991b1b" : "#1e40af",
                        textDecoration: wasReplaced ? "line-through" : "none"
                      }}>
                        {wasReplaced ? "✗" : "✓"} {file.filename}
                      </div>
                      <div style={{ fontSize: 11, color: wasReplaced ? "#dc2626" : "#3b82f6", marginTop: 4 }}>
                        {(file.file_size / 1024).toFixed(1)} KB · Bundled with ETL
                      </div>
                      {wasReplaced && (
                        <div style={{ fontSize: 11, color: "#dc2626", marginTop: 2, fontWeight: 600 }}>
                          Not used (replaced by user upload)
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {wasReplaced ? (
                        <Badge label="NOT USED" color="#dc2626" />
                      ) : (
                        <Badge label="USED" color="#3b82f6" />
                      )}
                      <button
                        onClick={() => handleDownloadDefault(file.filename)}
                        style={{
                          fontSize: 11,
                          color: wasReplaced ? "#dc2626" : "#3b82f6",
                          textDecoration: "none",
                          padding: "6px 12px",
                          border: `1px solid ${wasReplaced ? "#fca5a5" : "#93c5fd"}`,
                          borderRadius: 6,
                          background: "#fff",
                          fontWeight: 600,
                          cursor: "pointer"
                        }}
                      >
                        ⬇ Download {wasReplaced ? "Original" : ""}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* No inputs at all */}
        {!hasUserUploads && !hasDefaults && (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
            <div>This execution has no input files.</div>
          </div>
        )}
      </Card>
    </div>
  );
}