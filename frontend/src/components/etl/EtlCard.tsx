import React, { useState } from "react";
import { Etl } from "../../types/etl";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";
import { Card } from "../common/Card";
import { deleteEtl } from "../../api/etl";

type Props = {
  etl: Etl;
  isAdmin: boolean;
  onValidate?: (id: string) => Promise<void>;
  onActivate?: (id: string) => Promise<void>;
  onLaunch?: (etl: Etl) => void;
};

export function EtlCard({ etl, isAdmin, onValidate, onActivate, onLaunch }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  async function handle(action: "validate" | "activate") {
    try {
      setBusy(action);
      setErr(null);
      if (action === "validate") await onValidate?.(etl.id);
      else await onActivate?.(etl.id);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  const inputReqs = etl.config?.input_requirements ?? {};
  const expectedOutputs = etl.config?.expected_outputs ?? [];
  const hasConfig = etl.config && Object.keys(etl.config).length > 0;

  return (
    <Card style={{ marginBottom: 10 }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", flexWrap: "wrap", gap: 8,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{etl.name}</div>

          {/* Metadata line */}
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2, display: "flex", flexWrap: "wrap", gap: 8 }}>
            <span>v{etl.version}</span>
            <span>·</span>
            <span>{new Date(etl.created_at).toLocaleDateString()}</span>
            {etl.entry_point_path && (
              <>
                <span>·</span>
                <span style={{ fontFamily: "monospace" }}>{etl.entry_point_path}</span>
              </>
            )}
            {etl.python_version && (
              <>
                <span>·</span>
                <span>Python {etl.python_version}</span>
              </>
            )}
          </div>

          {etl.description && (
            <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>{etl.description}</div>
          )}

          {/* Config toggle */}
          {hasConfig && (
            <button
              onClick={() => setShowConfig(s => !s)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 12, color: "#64748b", marginTop: 6, padding: 0,
              }}
            >
              {showConfig ? "▲ Hide config" : "▼ Show config"}
            </button>
          )}

          {showConfig && (
            <div style={{
              marginTop: 8, padding: 10, borderRadius: 8,
              background: "#f8fafc", border: "1px solid #e2e8f0",
            }}>
              {etl.config_file_path && (
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8, fontFamily: "monospace" }}>
                  {etl.config_file_path}
                </div>
              )}

              {Object.keys(inputReqs).length > 0 && (
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>
                  <strong>Inputs:</strong>{" "}
                  {Object.entries(inputReqs).map(([k, s]: [string, any]) =>
                    `${k}${s.required ? " *" : ""}`
                  ).join(", ")}
                </div>
              )}

              {expectedOutputs.length > 0 && (
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>
                  <strong>Expected outputs:</strong> {expectedOutputs.join(", ")}
                </div>
              )}

              {/* Other config keys */}
              {Object.entries(etl.config || {})
                .filter(([k]) => !["input_requirements", "expected_outputs", "entry_point"].includes(k))
                .slice(0, 6)
                .map(([k, v]) => (
                  <div key={k} style={{ fontSize: 12, color: "#475569", marginBottom: 2 }}>
                    <strong>{k}:</strong>{" "}
                    {typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </div>
                ))}
            </div>
          )}

          {/* Validation errors */}
          {etl.validation_errors && etl.validation_errors.length > 0 && (
            <div style={{
              marginTop: 6, fontSize: 11, color: "#ef4444",
              background: "#fee2e2", padding: "4px 8px",
              borderRadius: 6, display: "inline-block",
            }}>
              {etl.validation_errors.join(" · ")}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <Badge
            label={etl.is_validated ? "validated" : "not validated"}
            color={etl.is_validated ? "#16a34a" : "#94a3b8"}
          />
          <Badge
            label={etl.is_active ? "active" : "inactive"}
            color={etl.is_active ? "#2563eb" : "#94a3b8"}
          />

          {isAdmin && !etl.is_validated && (
            <Button small variant="secondary" disabled={!!busy} onClick={() => handle("validate")}>
              {busy === "validate" ? "…" : "✓ Validate"}
            </Button>
          )}

          {isAdmin && etl.is_validated && !etl.is_active && (
            <Button small variant="success" disabled={!!busy} onClick={() => handle("activate")}>
              {busy === "activate" ? "…" : "▶ Activate"}
            </Button>
          )}

          {isAdmin && (
            <Button
              small variant="danger"
              onClick={async () => {
                if (confirm(`Delete ${etl.name}? This cannot be undone.`)) {
                  try {
                    await deleteEtl(etl.id);
                    window.location.reload();
                  } catch (e: any) {
                    alert(`Delete failed: ${e.message}`);
                  }
                }
              }}
            >
              Delete
            </Button>
          )}

          {!isAdmin && etl.is_active && etl.is_validated && (
            <Button onClick={() => onLaunch?.(etl)}>▶ Launch</Button>
          )}
        </div>
      </div>

      {err && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#ef4444" }}>{err}</div>
      )}
    </Card>
  );
}