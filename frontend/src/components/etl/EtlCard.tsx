import React, { useState } from "react";
import { Etl } from "../../types/etl";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";
import { Card } from "../common/Card";
import {deleteEtl} from "../../api/etl";

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

  return (
    <Card style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{etl.name}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
            v{etl.version} · {new Date(etl.created_at).toLocaleDateString()}
            {etl.config?.entry_point && ` · entry: ${etl.config.entry_point}`}
          </div>
          {etl.description && <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>{etl.description}</div>}

          {/* Config summary */}
          {etl.config && Object.keys(etl.config).length > 0 && (
            <button onClick={() => setShowConfig(s => !s)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#64748b", marginTop: 6, padding: 0 }}>
              {showConfig ? "▲ Hide config" : "▼ Show config"}
            </button>
          )}
          {showConfig && (
            <div style={{ marginTop: 8 }}>
              {Object.keys(inputReqs).length > 0 && (
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>
                  <strong>Inputs:</strong> {Object.entries(inputReqs).map(([k, s]) => `${k}${s.required ? "*" : ""}`).join(", ")}
                </div>
              )}
              {expectedOutputs.length > 0 && (
                <div style={{ fontSize: 12, color: "#475569" }}>
                  <strong>Expected outputs:</strong> {expectedOutputs.join(", ")}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <Badge label={etl.is_validated ? "validated" : "not validated"} color={etl.is_validated ? "#16a34a" : "#94a3b8"} />
          <Badge label={etl.is_active ? "active" : "inactive"} color={etl.is_active ? "#2563eb" : "#94a3b8"} />

          {/* Admin actions */}
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
    small
    variant="danger"
    onClick={async () => {
      if (confirm(`Delete ${etl.name}? This cannot be undone.`)) {
        try {
          await deleteEtl(etl.id);
          window.location.reload(); // Reload to refresh list
        } catch (e: any) {
          alert(`Delete failed: ${e.message}`);
        }
      }
    }}
  >
    🗑 Delete
  </Button>
)}

          {/* User launch button */}
          {!isAdmin && etl.is_active && etl.is_validated && (
            <Button onClick={() => onLaunch?.(etl)}>▶ Launch</Button>
          )}
        </div>
      </div>
      {err && <div style={{ marginTop: 8, fontSize: 12, color: "#ef4444" }}>{err}</div>}
    </Card>
  );
}