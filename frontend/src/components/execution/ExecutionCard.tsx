import React, { useEffect, useState } from "react";
import { Execution } from "../../types/execution";
import { Card } from "../common/Card";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";
import { STATUS_COLORS } from "../../utils/constants";
import { apiFetch } from "../../api/api";
import { sendExecutionReport } from "../../api/execution";
import { ScheduledExecutionBanner } from "../scheduling/scheduleExecutionBanner";

type Props = {
  execution: Execution;
  onViewLogs?: (exec: Execution) => void;
  onViewOutputs?: (exec: Execution) => void;
  onViewInputs?: (exec: Execution) => void;
  onReviewScheduled?: (exec: Execution) => void;
  onDelete?: (exec: Execution) => void;
};

export function ExecutionCard({
  execution: initialExecution,
  onViewLogs,
  onViewOutputs,
  onViewInputs,
  onReviewScheduled,
  onDelete,
}: Props) {
  const [execution, setExecution] = useState(initialExecution);
  const [showOverrides, setShowOverrides] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailInput, setEmailInput] = useState(execution.notify_email || "");
  const [reportMsg, setReportMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Auto-refresh while running
  useEffect(() => {
    if (!["PENDING", "INSTALLING_DEPS", "RUNNING"].includes(execution.status)) return;

    const interval = setInterval(async () => {
      try {
        const updated = await apiFetch(`/executions/${execution.id}/`);
        setExecution(updated);
      } catch (e) {
        console.error("Refresh failed:", e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [execution.id, execution.status]);

  const overrides = execution.config_overrides || {};
  const overrideCount = Object.keys(overrides).length;

  async function handleSendReport() {
    if (!emailInput.trim()) return;
    try {
      setSendingReport(true);
      await sendExecutionReport(execution.id, emailInput.trim());
      setReportMsg(`Report sent to ${emailInput.trim()}`);
      setShowEmailInput(false);
      setExecution(prev => ({ ...prev, report_sent: true }));
    } catch (e: any) {
      setReportMsg(`Failed: ${e.message}`);
    } finally {
      setSendingReport(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this execution? This cannot be undone.")) return;
    try {
      setDeleting(true);
      await apiFetch(`/executions/${execution.id}/`, { method: "DELETE" });
      onDelete?.(execution);
    } catch (e: any) {
      console.error("Delete failed:", e.message);
      setDeleting(false);
    }
  }

  return (
    <Card style={{ marginBottom: 10 }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", flexWrap: "wrap", gap: 8,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {execution.execution_label || execution.etl_name}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
            {execution.etl_name} · {execution.launched_by_username ?? "scheduler"} ·{" "}
            {new Date(execution.launched_at).toLocaleString()}
            {execution.completed_at &&
              ` → ${new Date(execution.completed_at).toLocaleTimeString()}`}
          </div>

          {/* Config overrides summary */}
          {overrideCount > 0 && (
            <div style={{ marginTop: 6 }}>
              <button
                onClick={() => setShowOverrides(s => !s)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 11, color: "#64748b", padding: 0,
                }}
              >
                {showOverrides ? "▲" : "▼"} {overrideCount} config change{overrideCount !== 1 ? "s" : ""} for this run
              </button>

              {showOverrides && (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                  {Object.entries(overrides).map(([k, v]) => (
                    <div key={k} style={{
                      fontSize: 11, fontFamily: "monospace",
                      color: "#475569", padding: "3px 8px",
                      background: "#eff6ff", borderRadius: 4,
                      display: "inline-block",
                    }}>
                      {k}: <strong>{String(v)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Report sent badge */}
          {execution.report_sent && (
            <div style={{ fontSize: 11, color: "#16a34a", marginTop: 4 }}>
              Report sent {execution.report_sent_at
                ? new Date(execution.report_sent_at).toLocaleString()
                : ""}
            </div>
          )}

          {/* Live progress line */}
          {execution.status === "RUNNING" && (
            <div style={{
              marginTop: 6, fontSize: 11, color: "#3b82f6",
              fontFamily: "monospace", background: "#f1f5f9",
              padding: "5px 8px", borderRadius: 6,
            }}>
              {execution.stdout_log
                ?.split("\n")
                .filter(l => l.startsWith("["))
                .slice(-1)[0] || "Processing…"}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <Badge label={execution.status} color={STATUS_COLORS[execution.status]} />

          {onViewInputs && (
            <Button small variant="ghost" onClick={() => onViewInputs(execution)}>
              Inputs
            </Button>
          )}

          {onViewLogs && (
            <Button small variant="ghost" onClick={() => onViewLogs(execution)}>
              Logs
            </Button>
          )}

          {execution.status === "SUCCESS" && onViewOutputs && (
            <Button small variant="success" onClick={() => onViewOutputs(execution)}>
              Outputs
            </Button>
          )}

          {["SUCCESS", "FAILED"].includes(execution.status) && (
            <Button small variant="ghost" onClick={() => setShowEmailInput(s => !s)}>
              {execution.report_sent ? "Resend report" : "Send report"}
            </Button>
          )}

          {onDelete && (
            <Button small variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? "…" : "Delete"}
            </Button>
          )}
        </div>
      </div>

      {/* Email input for report */}
      {showEmailInput && (
        <div style={{
          marginTop: 10, padding: 12, borderRadius: 8,
          background: "#f8fafc", border: "1px solid #e2e8f0",
          display: "flex", gap: 8, alignItems: "center",
        }}>
          <input
            type="email"
            value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            placeholder="recipient@company.com"
            style={{
              flex: 1, padding: "6px 10px", borderRadius: 6,
              border: "1px solid #e2e8f0", background: "#fff",
              fontSize: 12, color: "#0f172a",
            }}
          />
          <Button small onClick={handleSendReport} disabled={sendingReport || !emailInput.trim()}>
            {sendingReport ? "Sending…" : "Send"}
          </Button>
          <Button small variant="ghost" onClick={() => setShowEmailInput(false)}>
            Cancel
          </Button>
        </div>
      )}

      {reportMsg && (
        <div style={{
          marginTop: 6, fontSize: 11,
          color: reportMsg.startsWith("Failed") ? "#ef4444" : "#16a34a",
        }}>
          {reportMsg}
        </div>
      )}

      {/* Scheduled execution banner */}
      <ScheduledExecutionBanner
        execution={execution}
        onLaunch={(exec) => onReviewScheduled?.(exec)}
      />
    </Card>
  );
}