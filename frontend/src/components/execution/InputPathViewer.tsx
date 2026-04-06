import React, { useState, useEffect } from "react";
import { Execution } from "../../types/execution";
import { apiFetch } from "../../api/api";

type PathEntry = {
  config_key: string;
  path: string | null;
  raw_path?: string | null;
  accessible: boolean;
  classification: "input" | "output" | "other";
  path_type?: "absolute" | "relative_to_zip";
  issue?: string;
  // file metadata
  size_display?: string;
  size_bytes?: number;
  last_modified?: string;
  extension?: string;
  is_file?: boolean;
  is_dir?: boolean;
  files_in_dir?: number;
  // dataframe preview
  dataframe_preview?: {
    columns?: string[];
    dtypes?: Record<string, string>;
    row_count?: number | null;
    // Each row is now string[] aligned to columns[]
    sample_rows?: string[][];
    skipped?: boolean;
    reason?: string;
    error?: string;
  };
};

type InputsData = {
  mode: "config_driven" | "no_classifications";
  inputs?: PathEntry[];
  outputs?: PathEntry[];
  other?: PathEntry[];
  inputs_accessible?: boolean;
  inputs_missing?: string[];
  config_used?: Record<string, any>;
  // no_classifications
  detail?: string;
  config_keys_available?: string[];
};

type Props = {
  execution: Execution;
  onClose: () => void;
  embedded?: boolean;
};

export function InputPathViewer({ execution, onClose, embedded = false }: Props) {
  const [data, setData] = useState<InputsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch(`/executions/${execution.id}/available_inputs/`)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [execution.id]);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
        Checking paths…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16, borderRadius: 8, background: "#fef2f2", border: "1px solid #fca5a5", fontSize: 13, color: "#dc2626" }}>
        Failed to load path info: {error}
      </div>
    );
  }

  if (!data) return null;

  const content = data.mode === "config_driven"
    ? <ConfigDrivenView data={data} expandedKey={expandedKey} onToggleExpand={setExpandedKey} />
    : <NoClassificationsView data={data} />;

  if (embedded) return <>{content}</>;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }}>
      <div style={{
        background: "#fff", borderRadius: 12, width: "90%", maxWidth: 720,
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
      }}>
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid #e2e8f0",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Input & output paths</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              {execution.execution_label || (execution as any).etl_name}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>{content}</div>
      </div>
    </div>
  );
}

// ── Config-driven view ────────────────────────────────────────────
function ConfigDrivenView({
  data, expandedKey, onToggleExpand,
}: {
  data: InputsData;
  expandedKey: string | null;
  onToggleExpand: (key: string | null) => void;
}) {
  const inputs = data.inputs || [];
  const outputs = data.outputs || [];
  const others = data.other || [];

  const allEmpty = inputs.length === 0 && outputs.length === 0 && others.length === 0;

  return (
    <div>
      {/* Summary banner */}
      {inputs.length > 0 && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, marginBottom: 16,
          background: data.inputs_accessible ? "#f0fdf4" : "#fef9c3",
          border: `1px solid ${data.inputs_accessible ? "#86efac" : "#fde047"}`,
          fontSize: 13,
          color: data.inputs_accessible ? "#15803d" : "#854d0e",
        }}>
          {data.inputs_accessible
            ? `✓ All ${inputs.length} input path${inputs.length !== 1 ? "s" : ""} accessible`
            : `⚠ ${data.inputs_missing?.length} input path${(data.inputs_missing?.length ?? 0) !== 1 ? "s" : ""} not accessible: ${data.inputs_missing?.join(", ")}`
          }
        </div>
      )}

      {inputs.length > 0 && (
        <Section title="Inputs" count={inputs.length} color="#15803d">
          {inputs.map(p => (
            <PathCard key={p.config_key} entry={p}
              expanded={expandedKey === p.config_key}
              onToggle={() => onToggleExpand(expandedKey === p.config_key ? null : p.config_key)}
            />
          ))}
        </Section>
      )}

      {outputs.length > 0 && (
        <Section title="Outputs" count={outputs.length} color="#2563eb">
          {outputs.map(p => (
            <PathCard key={p.config_key} entry={p}
              expanded={expandedKey === p.config_key}
              onToggle={() => onToggleExpand(expandedKey === p.config_key ? null : p.config_key)}
            />
          ))}
        </Section>
      )}

      {others.length > 0 && (
        <Section title="Other paths" count={others.length} color="#94a3b8">
          {others.map(p => (
            <PathCard key={p.config_key} entry={p}
              expanded={expandedKey === p.config_key}
              onToggle={() => onToggleExpand(expandedKey === p.config_key ? null : p.config_key)}
            />
          ))}
        </Section>
      )}

      {allEmpty && (
        <div style={{ textAlign: "center", padding: 32, color: "#94a3b8", fontSize: 13 }}>
          No classified paths found. Ask an admin to classify paths in the ETL settings.
        </div>
      )}
    </div>
  );
}

// ── No classifications fallback ───────────────────────────────────
function NoClassificationsView({ data }: { data: InputsData }) {
  return (
    <div style={{ padding: 16, borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#92400e", marginBottom: 6 }}>
        No path classifications configured
      </div>
      <div style={{ fontSize: 12, color: "#78350f", lineHeight: 1.6 }}>
        {data.detail}
      </div>
      {(data.config_keys_available?.length ?? 0) > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#92400e", marginBottom: 4 }}>
            Config keys available to classify:
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {data.config_keys_available?.map(k => (
              <span key={k} style={{
                fontSize: 11, padding: "2px 7px", borderRadius: 99,
                background: "#fef3c7", color: "#92400e", fontFamily: "monospace",
              }}>{k}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────
function Section({ title, count, color, children }: {
  title: string; count: number; color: string; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: ".06em", color, marginBottom: 8,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        {title}
        <span style={{ fontSize: 10, background: color + "22", color, padding: "1px 6px", borderRadius: 99 }}>
          {count}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}

// ── PathCard ──────────────────────────────────────────────────────
function PathCard({ entry, expanded, onToggle }: {
  entry: PathEntry; expanded: boolean; onToggle: () => void;
}) {
  const hasPreview = !!(
    entry.dataframe_preview &&
    !entry.dataframe_preview.error &&
    !entry.dataframe_preview.skipped
  );
  const classColor =
    entry.classification === "input" ? "#15803d"
    : entry.classification === "output" ? "#2563eb"
    : "#94a3b8";

  return (
    <div style={{
      borderRadius: 8,
      border: `1px solid ${entry.accessible ? "#e2e8f0" : "#fca5a5"}`,
      background: entry.accessible ? "#fff" : "#fef2f2",
      overflow: "hidden",
    }}>
      {/* Header row */}
      <div
        style={{
          padding: "10px 12px", display: "flex", alignItems: "center", gap: 10,
          cursor: hasPreview ? "pointer" : "default",
        }}
        onClick={hasPreview ? onToggle : undefined}
      >
        {/* Dot indicator */}
        <div style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: entry.accessible ? "#16a34a" : "#dc2626",
        }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "monospace", color: "#0f172a" }}>
              {entry.config_key}
            </span>
            <span style={{
              fontSize: 10, padding: "1px 6px", borderRadius: 99,
              background: classColor + "22", color: classColor,
            }}>
              {entry.classification}
            </span>
            {entry.extension && (
              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "#f1f5f9", color: "#64748b" }}>
                {entry.extension}
              </span>
            )}
            {entry.path_type && (
              <span style={{
                fontSize: 10, padding: "1px 6px", borderRadius: 99,
                background: entry.path_type === "absolute" ? "#faf5ff" : "#f0f9ff",
                color: entry.path_type === "absolute" ? "#7c3aed" : "#0369a1",
              }}>
                {entry.path_type === "absolute" ? "local path" : "in zip"}
              </span>
            )}
          </div>
          <div style={{
            fontSize: 11, color: "#94a3b8", marginTop: 2, fontFamily: "monospace",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {entry.path || entry.raw_path || "—"}
          </div>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {entry.accessible && entry.size_display && (
            <div style={{ fontSize: 12, color: "#64748b" }}>{entry.size_display}</div>
          )}
          {entry.accessible && entry.is_dir && entry.files_in_dir != null && (
            <div style={{ fontSize: 11, color: "#94a3b8" }}>{entry.files_in_dir} file{entry.files_in_dir !== 1 ? "s" : ""}</div>
          )}
          {entry.accessible && entry.last_modified && (
            <div style={{ fontSize: 11, color: "#94a3b8" }}>
              {new Date(entry.last_modified).toLocaleDateString()}
            </div>
          )}
          {!entry.accessible && (
            <div style={{ fontSize: 11, color: "#dc2626" }}>Not found</div>
          )}
          {hasPreview && (
            <div style={{ fontSize: 11, color: "#2563eb", marginTop: 2 }}>
              {expanded ? "▲ hide" : "▼ preview"}
            </div>
          )}
        </div>
      </div>

      {/* Issue message */}
      {entry.issue && (
        <div style={{
          padding: "6px 12px", background: "#fef2f2",
          borderTop: "1px solid #fca5a5", fontSize: 11, color: "#dc2626",
        }}>
          {entry.issue}
        </div>
      )}

      {/* Dataframe preview */}
      {expanded && entry.dataframe_preview && (
        <DataframePreview preview={entry.dataframe_preview} />
      )}
    </div>
  );
}

// ── DataframePreview ──────────────────────────────────────────────
function DataframePreview({ preview }: {
  preview: NonNullable<PathEntry["dataframe_preview"]>;
}) {
  if (preview.error) {
    return (
      <div style={{
        padding: "10px 12px", background: "#fef2f2",
        borderTop: "1px solid #fca5a5", fontSize: 12, color: "#dc2626",
      }}>
        Could not read file: {preview.error}
      </div>
    );
  }
  if (preview.skipped) {
    return (
      <div style={{
        padding: "10px 12px", background: "#f8fafc",
        borderTop: "1px solid #e2e8f0", fontSize: 12, color: "#94a3b8",
      }}>
        {preview.reason}
      </div>
    );
  }

  const cols = preview.columns || [];
  const dtypes = preview.dtypes || {};
  // sample_rows: string[][]  — each row is already aligned to cols[]
  const rows = preview.sample_rows || [];

  return (
    <div style={{ borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
      {/* Stats */}
      <div style={{
        padding: "8px 12px", display: "flex", gap: 16, fontSize: 12,
        color: "#64748b", borderBottom: "1px solid #e2e8f0",
      }}>
        <span>{cols.length} column{cols.length !== 1 ? "s" : ""}</span>
        {preview.row_count != null && (
          <span>{preview.row_count.toLocaleString()} rows</span>
        )}
        {rows.length > 0 && <span style={{ color: "#94a3b8" }}>showing {rows.length} sample rows</span>}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", maxHeight: 260 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ background: "#f1f5f9", position: "sticky", top: 0 }}>
              <th style={thStyle}>Column</th>
              <th style={thStyle}>Type</th>
              {rows.map((_, i) => (
                <th key={i} style={{ ...thStyle, color: "#94a3b8", fontWeight: 500 }}>
                  row {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cols.map((col, ci) => (
              <tr key={col} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ ...tdStyle, fontFamily: "monospace", color: "#0f172a", whiteSpace: "nowrap" }}>
                  {col}
                </td>
                <td style={{ ...tdStyle, color: "#64748b", fontFamily: "monospace", fontSize: 10 }}>
                  {dtypes[col] || "—"}
                </td>
                {/* rows[ri][ci] — positional, safe because backend aligns to cols[] */}
                {rows.map((row, ri) => (
                  <td key={ri} style={{ ...tdStyle, color: "#94a3b8", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "5px 10px", textAlign: "left", fontWeight: 600,
  color: "#475569", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = {
  padding: "4px 10px",
};