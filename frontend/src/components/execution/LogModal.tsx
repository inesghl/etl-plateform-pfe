import React from "react";
import { Execution } from "../../types/execution";
import { Card } from "../common/Card";
import { Badge } from "../common/Badge";
import { Empty } from "../common/Empty";
import { STATUS_COLORS } from "../../utils/constants";

type Props = {
  execution: Execution;
  onClose: () => void;
};

export function LogModal({ execution, onClose }: Props) {
  const logStyle: React.CSSProperties = {
    background: "#0f172a",
    color: "#e2e8f0",
    borderRadius: 8,
    padding: 12,
    fontSize: 12,
    fontFamily: "monospace",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    maxHeight: 220,
    overflowY: "auto",
    border: "1px solid #1e293b",
    marginTop: 6,
  };

  // ✅ Determine execution outcome
  const isSuccess = execution.status === "SUCCESS";
  const isFailed = execution.status === "FAILED";

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
      <Card style={{
        width: "100%",
        maxWidth: 680,
        maxHeight: "88vh",
        display: "flex",
        flexDirection: "column"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {execution.execution_label || execution.etl_name}
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              {execution.launched_by_username} · {new Date(execution.launched_at).toLocaleString()}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Badge label={execution.status} color={STATUS_COLORS[execution.status]} />
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
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {/* STDOUT - Setup logs */}
          {execution.stdout_log && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>
                STDOUT
              </div>
              <pre style={logStyle}>{execution.stdout_log}</pre>
            </>
          )}

          {/* STDERR - Context-aware label */}
          {execution.stderr_log && (
            <>
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                color: isSuccess ? "#16a34a" : "#ef4444",
                marginTop: 12
              }}>
                {/* ✅ SUCCESS: Friendly label */}
                {/* ❌ FAILED: Technical label */}
                {isSuccess ? "📝 ETL LOGS" : "STDERR"}
              </div>
              <pre style={{
                ...logStyle,
                borderColor: isSuccess ? "#16a34a" : "#fca5a5",
                background: isSuccess ? "#0f172a" : "#1c0a0a"
              }}>
                {execution.stderr_log}
              </pre>
            </>
          )}

          {/* ERROR - Only show when failed */}
          {isFailed && execution.error_message && (
            <>
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#ef4444",
                marginTop: 12
              }}>
                ERROR
              </div>
              <pre style={{
                ...logStyle,
                borderColor: "#fca5a5",
                background: "#1c0a0a"
              }}>
                {execution.error_message}
              </pre>
            </>
          )}

          {/* Empty state */}
          {!execution.stdout_log && !execution.stderr_log && !execution.error_message && (
            <Empty icon="📭" text="No logs yet." />
          )}
        </div>
      </Card>
    </div>
  );
}