import React from "react";
import { Etl } from "../types/etl";

type Props = { etls: Etl[]; isAdmin: boolean };

export function EtlList({ etls, isAdmin }: Props) {
  if (etls.length === 0)
    return (
      <p style={{ fontSize: 14, color: "#64748b" }}>
        No ETLs yet. {isAdmin ? " Upload your first one above." : " Contact an admin to publish ETLs."}
      </p>
    );

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {etls.map((etl) => (
        <div
          key={etl.id}
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            background: "#ffffff"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500 }}>{etl.name}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>v{etl.version}</div>
            </div>
            <div style={{ display: "flex", gap: 6, fontSize: 11 }}>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid #cbd5e1",
                  background: etl.is_validated ? "rgba(34,197,94,0.12)" : "rgba(148,163,184,0.08)"
                }}
              >
                {etl.is_validated ? "validated" : "not validated"}
              </span>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid #cbd5e1",
                  background: etl.is_active ? "rgba(34,197,94,0.12)" : "rgba(148,163,184,0.06)"
                }}
              >
                {etl.is_active ? "active" : "inactive"}
              </span>
            </div>
          </div>
          {etl.description && <p style={{ fontSize: 13, color: "#475569" }}>{etl.description}</p>}
        </div>
      ))}
    </div>
  );
}
