import React, { useState } from "react";
import { Card } from "../common/Card";
import { Button } from "../common/Button";
import { Etl } from "../../types/etl";

type Props = {
  onUpload: (formData: FormData) => Promise<Etl>;
  onGetConfig: (id: string) => Promise<{ parsed: Record<string, any>; raw: string; config_file_path: string }>;
  loading: boolean;
};

export function UploadEtlForm({ onUpload, onGetConfig, loading }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [entryPointPath, setEntryPointPath] = useState("");
  const [configFilePath, setConfigFilePath] = useState("");
  const [requirementsPath, setRequirementsPath] = useState("requirements.txt");
  const [pythonVersion, setPythonVersion] = useState("");
  const [uploadedEtl, setUploadedEtl] = useState<Etl | null>(null);
  const [configPreview, setConfigPreview] = useState<Record<string, any> | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [rawConfig, setRawConfig] = useState("");
  const [configPath, setConfigPath] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const inputCss: React.CSSProperties = {
    width: "100%", padding: "7px 10px", borderRadius: 8,
    border: "1px solid #e2e8f0", background: "#f8fafc",
    color: "#0f172a", fontSize: 13, marginTop: 5, boxSizing: "border-box",
  };

  const labelCss: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: "#64748b",
  };

  const hintCss: React.CSSProperties = {
    fontSize: 11, color: "#94a3b8", marginTop: 3,
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;
    setErr(null);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", description);
    formData.append("version", version);
    formData.append("zip_file", selectedFile);
    formData.append("entry_point_path", entryPointPath);
    formData.append("config_file_path", configFilePath);
    formData.append("requirements_path", requirementsPath);
    formData.append("python_version", pythonVersion);

    try {
      const etl = await onUpload(formData);
      setUploadedEtl(etl);

      // If a config file was specified, fetch and show the parsed result
      if (configFilePath && etl.id) {
        try {
          const cfg = await onGetConfig(etl.id);
          setConfigPreview(cfg.parsed);
          setRawConfig(cfg.raw);
          setConfigPath(cfg.config_file_path);
        } catch {
          // Config preview is informational — don't block on failure
        }
      }
    } catch (e: any) {
      setErr(e.message);
    }
  }

  function resetForm() {
    setName(""); setDescription(""); setVersion("1.0");
    setSelectedFile(null); setEntryPointPath("");
    setConfigFilePath(""); setRequirementsPath("requirements.txt");
    setPythonVersion(""); setUploadedEtl(null);
    setConfigPreview(null); setRawConfig(""); setErr(null);
  }

  // ── Success state: show config preview ──────────────────────────
  if (uploadedEtl) {
    return (
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 18 }}>✓</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#15803d" }}>
              ETL uploaded successfully
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              {uploadedEtl.name} v{uploadedEtl.version}
            </div>
          </div>
        </div>

        {/* Next steps */}
        <div style={{
          padding: 12, borderRadius: 8,
          background: "#eff6ff", border: "1px solid #93c5fd", marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1e40af", marginBottom: 6 }}>
            Next steps
          </div>
          <div style={{ fontSize: 12, color: "#3b82f6", lineHeight: 1.7 }}>
            1. Review the parsed config below to confirm it looks correct<br />
            2. Click <strong>Validate</strong> on the ETL card<br />
            3. Click <strong>Activate</strong> to make it available to users
          </div>
        </div>

        {/* Config preview */}
        {configPreview && (
          <div style={{ marginBottom: 16 }}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "center", marginBottom: 8,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>
                Parsed config — {configPath}
              </div>
              <button
                onClick={() => setShowRaw(r => !r)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 11, color: "#64748b",
                }}
              >
                {showRaw ? "Show parsed" : "Show raw"}
              </button>
            </div>

            {showRaw ? (
              <pre style={{
                background: "#0f172a", color: "#e2e8f0",
                borderRadius: 8, padding: 12, fontSize: 11,
                fontFamily: "monospace", whiteSpace: "pre-wrap",
                maxHeight: 300, overflowY: "auto",
              }}>
                {rawConfig}
              </pre>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {Object.entries(configPreview).map(([key, value]) => (
                  <div key={key} style={{
                    display: "flex", gap: 8, padding: "6px 10px",
                    borderRadius: 6, background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                  }}>
                    <span style={{
                      fontFamily: "monospace", fontSize: 12,
                      color: "#64748b", minWidth: 160,
                    }}>
                      {key}
                    </span>
                    <span style={{ fontSize: 12, color: "#0f172a" }}>
                      {typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!configPreview && (
          <div style={{
            padding: 10, borderRadius: 8,
            background: "#fefce8", border: "1px solid #fde047",
            fontSize: 12, color: "#854d0e", marginBottom: 16,
          }}>
            No config file was specified — the ETL will run without a config.
          </div>
        )}

        <Button onClick={resetForm} variant="ghost">
          Upload another ETL
        </Button>
      </Card>
    );
  }

  // ── Upload form ──────────────────────────────────────────────────
  return (
    <Card>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>
        Upload new ETL
      </div>

      {err && (
        <div style={{
          padding: 10, borderRadius: 8, background: "#fee2e2",
          color: "#b91c1c", fontSize: 12, marginBottom: 14,
        }}>
          {err}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Basic info */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelCss}>Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} required style={inputCss} />
          </div>
          <div style={{ width: 100 }}>
            <label style={labelCss}>Version</label>
            <input value={version} onChange={e => setVersion(e.target.value)} style={inputCss} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelCss}>Description</label>
          <textarea
            value={description} onChange={e => setDescription(e.target.value)}
            rows={2} style={{ ...inputCss, resize: "vertical" }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelCss}>ZIP file *</label>
          <div style={{ marginTop: 5 }}>
            <input
              type="file" accept=".zip" required
              onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
              style={{ fontSize: 13 }}
            />
          </div>
        </div>

        {/* Divider */}
        <div style={{
          borderTop: "1px solid #e2e8f0", margin: "16px 0",
          paddingTop: 16,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 12 }}>
            ETL configuration
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelCss}>Entry point path *</label>
            <input
              value={entryPointPath}
              onChange={e => setEntryPointPath(e.target.value)}
              placeholder="e.g. main.py or src/run.py"
              required style={inputCss}
            />
            <div style={hintCss}>Path relative to the ZIP root</div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelCss}>Config file path</label>
            <input
              value={configFilePath}
              onChange={e => setConfigFilePath(e.target.value)}
              placeholder="e.g. config/config.json"
              style={inputCss}
            />
            <div style={hintCss}>JSON or TOML — leave empty if none</div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelCss}>Requirements path</label>
            <input
              value={requirementsPath}
              onChange={e => setRequirementsPath(e.target.value)}
              placeholder="e.g. requirements.txt"
              style={inputCss}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelCss}>Python version</label>
            <input
              value={pythonVersion}
              onChange={e => setPythonVersion(e.target.value)}
              placeholder="e.g. 3.11"
              style={{ ...inputCss, maxWidth: 120 }}
            />
            <div style={hintCss}>Leave empty to use server default</div>
          </div>
        </div>

        <Button type="submit" disabled={loading || !name || !selectedFile || !entryPointPath}>
          {loading ? "Uploading…" : "Upload ETL"}
        </Button>
      </form>
    </Card>
  );
}