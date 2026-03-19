import React, { useState, useEffect } from "react";
import { Execution } from "../../types/execution";
import { Card } from "../common/Card";
import { Button } from "../common/Button";
import { Badge } from "../common/Badge";
import { apiFetch } from "../../api/api";
import { uploadInputFile } from "../../api/inputFile";

type Props = {
  execution: Execution;
  onClose: () => void;
  onFilesChanged: () => void;
  embedded?: boolean; // If true, we're inside LaunchModal
};

type InputStatus = {
  required: boolean;
  description: string;
  extensions: string[];
  user_upload: any | null;
  default_available: any | null;
  status: 'uploaded' | 'default' | 'missing';
};

export function InputFileManager({ execution, onClose, onFilesChanged, embedded = false }: Props) {
  const [inputsData, setInputsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  useEffect(() => {
    loadInputsData();
  }, [execution.id]);

  async function loadInputsData() {
    try {
      const data = await apiFetch(`/executions/${execution.id}/available_inputs/`);
      console.log('Inputs data received:', data);
      setInputsData(data);
    } catch (e) {
      console.error("Failed to load inputs:", e);
    } finally {
      setLoading(false);
    }
  }

async function handleUpload(fileKey: string, file: File) {
  try {
    setUploadingKey(fileKey);
    await uploadInputFile(execution.id, fileKey, file);
    await loadInputsData();
    onFilesChanged();
    // ✅ Removed alert - the UI update is enough
  } catch (e: any) {
    alert(`Upload failed: ${e.message}`);
  } finally {
    setUploadingKey(null);
  }
}

  if (loading) {
    return embedded ? (
      <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
        Loading inputs...
      </div>
    ) : (
      <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
        <Card style={{ padding: 40 }}>Loading inputs...</Card>
      </div>
    );
  }

  if (!inputsData) return null;

  const inputsStatus: Record<string, InputStatus> = inputsData.inputs_status || {};

const content = (
  <>
    {/* User Uploads - Show first if they exist */}
    {inputsData.user_uploads && inputsData.user_uploads.length > 0 && (
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
          ✓ YOUR UPLOADED FILES
        </div>
        <div style={{ fontSize: 12, color: "#16a34a", marginBottom: 12 }}>
          These files will replace the defaults when you launch the ETL.
        </div>
        {inputsData.user_uploads.map((upload: any) => (
          <div
            key={upload.id}
            style={{
              padding: 12,
              marginBottom: 8,
              borderRadius: 8,
              background: "#f0fdf4",
              border: "2px solid #86efac"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#15803d" }}>
                  ✓ {upload.original_filename}
                </div>
                <div style={{ fontSize: 11, color: "#16a34a", marginTop: 2 }}>
                  Key: {upload.file_key} · {(upload.file_size / 1024).toFixed(1)} KB
                </div>
                <div style={{ fontSize: 11, color: "#15803d", marginTop: 2, fontWeight: 600 }}>
                  Will replace default file
                </div>
              </div>
              <Badge label="UPLOADED" color="#16a34a" />
            </div>
          </div>
        ))}
      </div>
    )}

    {/* Required/Optional Inputs */}
    {Object.keys(inputsStatus).length > 0 && (
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 10 }}>
          REQUIRED & OPTIONAL INPUTS
        </div>
        {Object.entries(inputsStatus).map(([key, status]) => (
          <InputFileRow
            key={key}
            fileKey={key}
            status={status}
            onUpload={handleUpload}
            uploading={uploadingKey === key}
          />
        ))}
      </div>
    )}

    {/* Default files */}
    {inputsData.default_inputs && inputsData.default_inputs.length > 0 && (
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 10 }}>
          DEFAULT FILES IN ETL
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
          These files are bundled with the ETL. Upload your own to replace them.
        </div>
        {inputsData.default_inputs.map((file: any, idx: number) => (
          <DefaultFileRow
            key={idx}
            file={file}
            executionId={execution.id}
            onUpload={handleUpload}
            uploading={uploadingKey === file.filename}
          />
        ))}
      </div>
    )}

    {/* No inputs at all */}
    {Object.keys(inputsStatus).length === 0 &&
     (!inputsData.user_uploads || inputsData.user_uploads.length === 0) &&
     (!inputsData.default_inputs || inputsData.default_inputs.length === 0) && (
      <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
        <div>This ETL has no input files.</div>
      </div>
    )}
  </>
);

  if (embedded) {
    return content;
  }

  // Standalone modal
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <Card style={{ width: "90%", maxWidth: 700, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Input Files</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              {execution.execution_label || execution.etl_name}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>
        {content}
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// INPUT FILE ROW - For required/optional inputs from ETL config
// ════════════════════════════════════════════════════════════════════

type InputFileRowProps = {
  fileKey: string;
  status: InputStatus;
  onUpload: (key: string, file: File) => Promise<void>;
  uploading: boolean;
};

function InputFileRow({ fileKey, status, onUpload, uploading }: InputFileRowProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const statusColors = {
    uploaded: '#16a34a',
    default: '#3b82f6',
    missing: '#dc2626',
  };

  const statusLabels = {
    uploaded: 'User uploaded',
    default: 'Using default',
    missing: 'Missing',
  };

  return (
    <div style={{
      padding: 14,
      marginBottom: 12,
      borderRadius: 8,
      border: "2px solid #e2e8f0",
      borderColor: status.required && status.status === 'missing' ? '#fca5a5' : '#e2e8f0',
      background: status.required && status.status === 'missing' ? '#fef2f2' : '#fff'
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{fileKey}</span>
          {status.required ? (
            <Badge label="required" color="#dc2626" />
          ) : (
            <Badge label="optional" color="#64748b" />
          )}
          <Badge label={statusLabels[status.status]} color={statusColors[status.status]} />
        </div>
      </div>

      {/* Description */}
      {status.description && (
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
          {status.description}
        </div>
      )}

      {/* Extensions */}
      {status.extensions && status.extensions.length > 0 && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>
          Accepted: {status.extensions.join(", ")}
        </div>
      )}

      {/* Current file info with DOWNLOAD */}
      {status.user_upload && (
        <div style={{ padding: 10, borderRadius: 6, background: "#f0fdf4", border: "1px solid #86efac", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, color: "#15803d", fontWeight: 600 }}>
                ✓ Uploaded: {status.user_upload.original_filename}
              </div>
              <div style={{ fontSize: 11, color: "#16a34a", marginTop: 4 }}>
                {(status.user_upload.file_size / 1024).toFixed(1)} KB
              </div>
            </div>
            {status.user_upload.file_url && (
              <a
                href={status.user_upload.file_url}
                download
                style={{
                  fontSize: 11,
                  color: "#16a34a",
                  textDecoration: "none",
                  padding: "4px 8px",
                  border: "1px solid #86efac",
                  borderRadius: 4,
                  background: "#fff"
                }}
              >
                ⬇ Download
              </a>
            )}
          </div>
        </div>
      )}

      {status.default_available && !status.user_upload && (
        <div style={{ padding: 10, borderRadius: 6, background: "#eff6ff", border: "1px solid #93c5fd", marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "#1e40af", fontWeight: 600 }}>
            📄 Default: {status.default_available.filename}
          </div>
          <div style={{ fontSize: 11, color: "#3b82f6", marginTop: 4 }}>
            {(status.default_available.file_size / 1024).toFixed(1)} KB · Cannot download (embedded in ETL)
          </div>
        </div>
      )}

      {/* Upload controls */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="file"
          accept={status.extensions?.join(",") || undefined}
          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
          disabled={uploading}
          style={{ fontSize: 12, flex: 1 }}
        />

        {selectedFile && (
          <Button
            small
            onClick={() => {
              if (selectedFile) {
                onUpload(fileKey, selectedFile);
                setSelectedFile(null);
              }
            }}
            disabled={uploading}
          >
            {uploading ? "Uploading..." : (status.user_upload ? "Replace" : "Upload")}
          </Button>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// DEFAULT FILE ROW - For default files bundled in ETL's data/ folder
// ════════════════════════════════════════════════════════════════════

type DefaultFileRowProps = {
  file: any;
  executionId: string;
  onUpload: (key: string, file: File) => Promise<void>;
  uploading: boolean;
};

function DefaultFileRow({ file, executionId, onUpload, uploading }: DefaultFileRowProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const fileKey = file.filename.replace(/\.[^/.]+$/, "");

  async function handleDownload() {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(
        `http://localhost:8000/api/executions/${executionId}/download-default-input/${file.filename}/`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      alert(`Failed to download file: ${e.message}`);
      console.error(e);
    }
  }

  return (
    <div style={{
      padding: 14,
      marginBottom: 12,
      borderRadius: 8,
      border: "1px solid #e2e8f0",
      background: "#fff"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            📄 {file.filename}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
            {(file.file_size / 1024).toFixed(1)} KB · Default from ETL
          </div>
        </div>
        <Badge label="default" color="#3b82f6" />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          onClick={handleDownload}
          style={{
            fontSize: 12,
            color: "#3b82f6",
            background: "#fff",
            padding: "6px 12px",
            border: "1px solid #93c5fd",
            borderRadius: 6,
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          ⬇ Download
        </button>

        {!showUpload && (
          <button
            onClick={() => setShowUpload(true)}
            style={{
              fontSize: 12,
              color: "#64748b",
              background: "#fff",
              padding: "6px 12px",
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            📤 Replace
          </button>
        )}
      </div>

      {showUpload && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
            Upload your file to replace the default:
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="file"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              disabled={uploading}
              style={{ fontSize: 12, flex: 1 }}
            />

            {selectedFile && (
              <Button
                small
                onClick={async () => {
                  if (selectedFile) {
                    await onUpload(fileKey, selectedFile);
                    setSelectedFile(null);
                    setShowUpload(false);
                  }
                }}
                disabled={uploading}
              >
                {uploading ? "Uploading..." : "Upload"}
              </Button>
            )}

            <Button
              small
              variant="ghost"
              onClick={() => {
                setShowUpload(false);
                setSelectedFile(null);
              }}
            >
              Cancel
            </Button>
          </div>

          {/* ✅ Show upload status */}
          {uploading && (
            <div style={{
              marginTop: 8,
              padding: 8,
              borderRadius: 6,
              background: "#eff6ff",
              color: "#1e40af",
              fontSize: 11
            }}>
              ⏳ Uploading... This will replace the default file when you launch.
            </div>
          )}
        </div>
      )}
    </div>
  );
}