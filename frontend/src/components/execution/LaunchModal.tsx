import React, { useState, useEffect } from "react";
import { Etl } from "../../types/etl";
import { Execution } from "../../types/execution";
import { Card } from "../common/Card";
import { Button } from "../common/Button";
import { InputFileManager } from "./InputFileManager";
import { apiFetch } from "../../api/api";

type Props = {
  etl: Etl;
  onClose: () => void;
  onDone: () => void;
  onCreateExecution: (etlId: string, label: string) => Promise<any>;
  onLaunch: (executionId: string) => Promise<void>;
};

export function LaunchModal({ etl, onClose, onDone, onCreateExecution, onLaunch }: Props) {
  const inputReqs = etl.config?.input_requirements ?? {};
  const hasInputs = Object.keys(inputReqs).length > 0;

  const [label, setLabel] = useState(`${etl.name} — ${new Date().toLocaleDateString()}`);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState<"label" | "inputs" | "progress">("label");
  const [execution, setExecution] = useState<Execution | null>(null);

  const inputCss: React.CSSProperties = {
    width: "100%",
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    color: "#0f172a",
    fontSize: 13,
    marginTop: 5,
    boxSizing: "border-box",
  };

  // ✅ Auto-refresh execution status while running
  useEffect(() => {
    if (!execution) return;

    if (["PENDING", "INSTALLING_DEPS", "RUNNING"].includes(execution.status)) {
      const interval = setInterval(async () => {
        try {
          const updated = await apiFetch(`/executions/${execution.id}/`);
          setExecution(updated);

          // Auto-close when done
          if (updated.status === "SUCCESS" || updated.status === "FAILED") {
            clearInterval(interval);
            setTimeout(() => {
              onDone();
              onClose();
            }, 3000); // Show final status for 3 seconds
          }
        } catch (e) {
          console.error("Failed to refresh execution:", e);
        }
      }, 2000); // Refresh every 2 seconds

      return () => clearInterval(interval);
    }
  }, [execution?.id, execution?.status, onDone, onClose]);

  async function handleNext() {
    try {
      setLoading(true);
      setErr(null);

      // Create execution
      const exec = await onCreateExecution(etl.id, label);
      setExecution(exec);

      // Always show input manager to let user see/replace default files
      setStep("inputs");
      setLoading(false);
    } catch (e: any) {
      setErr(e.message);
      setLoading(false);
    }
  }

  async function handleLaunch(exec: Execution) {
    try {
      setLoading(true);
      setErr(null);
      setStep("progress"); // ✅ Switch to progress view

      await onLaunch(exec.id);

      // Fetch updated execution to get initial status
      const updated = await apiFetch(`/executions/${exec.id}/`);
      setExecution(updated);
    } catch (e: any) {
      setErr(e.message);
      setStep("inputs"); // Go back to inputs on error
      setLoading(false);
    }
  }

  // ✅ PROGRESS VIEW - Show live execution progress
  if (step === "progress" && execution) {
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
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Execution Progress</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              {execution.execution_label || execution.etl_name}
            </div>
          </div>

          <ExecutionProgress execution={execution} />

          {/* Close button (only show when done) */}
          {(execution.status === "SUCCESS" || execution.status === "FAILED") && (
            <div style={{ marginTop: 20, textAlign: "center" }}>
              <Button onClick={() => { onDone(); onClose(); }}>
                Close & View Results
              </Button>
            </div>
          )}

          {err && (
            <div style={{
              marginTop: 16,
              padding: 10,
              borderRadius: 8,
              background: "#fee2e2",
              color: "#b91c1c",
              fontSize: 13
            }}>
              {err}
            </div>
          )}
        </Card>
      </div>
    );
  }

  // INPUT REVIEW STEP
  if (step === "inputs" && execution) {
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
        <Card style={{ width: "90%", maxWidth: 700, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
          {/* Header */}
          <div style={{
            padding: 20,
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Review & Upload Inputs</div>
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

          {/* Input Manager Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            <InputFileManager
              execution={execution}
              onClose={() => {}}
              onFilesChanged={() => {}}
              embedded={true}
            />
          </div>

          {/* Footer with Launch Button */}
          <div style={{
            padding: 20,
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            gap: 10
          }}>
            <Button variant="ghost" onClick={() => setStep("label")} disabled={loading}>
              ← Back
            </Button>
            <Button onClick={() => handleLaunch(execution)} disabled={loading}>
              {loading ? "Launching..." : "▶ Launch ETL"}
            </Button>
          </div>

          {err && (
            <div style={{
              margin: "0 20px 20px 20px",
              padding: 10,
              borderRadius: 8,
              background: "#fee2e2",
              color: "#b91c1c",
              fontSize: 13
            }}>
              {err}
            </div>
          )}
        </Card>
      </div>
    );
  }

  // LABEL INPUT STEP
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
      <Card style={{ width: "100%", maxWidth: 500 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Launch ETL</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              {etl.name} v{etl.version}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
              color: "#94a3b8",
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>
            Execution label
          </label>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            style={inputCss}
            placeholder="Give this execution a name..."
          />
        </div>

        <div style={{
          marginBottom: 14,
          padding: 12,
          borderRadius: 8,
          background: "#eff6ff",
          border: "1px solid #93c5fd"
        }}>
          <div style={{ fontSize: 13, color: "#1e40af", fontWeight: 600 }}>
            📁 You'll review input files in the next step
          </div>
          <div style={{ fontSize: 12, color: "#3b82f6", marginTop: 4 }}>
            {hasInputs
              ? `This ETL requires ${Object.keys(inputReqs).length} input file(s)`
              : "You can review default files and optionally upload your own"}
          </div>
        </div>

        {err && (
          <div style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 8,
            background: "#fee2e2",
            color: "#b91c1c",
            fontSize: 13
          }}>
            {err}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={loading || !label}
            onClick={handleNext}
          >
            {loading ? "Creating..." : "Next: Review Inputs →"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ✅ NEW COMPONENT: Show live execution progress
function ExecutionProgress({ execution }: { execution: Execution }) {
  const isRunning = ["PENDING", "INSTALLING_DEPS", "RUNNING"].includes(execution.status);
  const isSuccess = execution.status === "SUCCESS";
  const isFailed = execution.status === "FAILED";

  // Get latest progress lines
  const latestProgress = execution.stdout_log
    ?.split("\n")
    .filter(line => line.trim())
    .slice(-5) // Last 5 lines
    .join("\n") || "Starting...";

  return (
    <div>
      {/* Status Badge */}
      <div style={{
        padding: 16,
        borderRadius: 8,
        background: isSuccess ? "#f0fdf4" : isFailed ? "#fef2f2" : "#eff6ff",
        border: `2px solid ${isSuccess ? "#86efac" : isFailed ? "#fca5a5" : "#93c5fd"}`,
        marginBottom: 16
      }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: isSuccess ? "#15803d" : isFailed ? "#991b1b" : "#1e40af",
          marginBottom: 8
        }}>
          {isSuccess && "✓ Execution Completed Successfully"}
          {isFailed && "✗ Execution Failed"}
          {isRunning && "⏳ Execution in Progress..."}
        </div>

        <div style={{ fontSize: 12, color: "#64748b" }}>
          Status: <strong>{execution.status}</strong>
        </div>

        {execution.started_at && (
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            Started: {new Date(execution.started_at).toLocaleTimeString()}
          </div>
        )}

        {execution.completed_at && (
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            Completed: {new Date(execution.completed_at).toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Live Progress */}
      {isRunning && (
        <div style={{
          padding: 12,
          background: "#1e293b",
          borderRadius: 8,
          fontFamily: "monospace",
          fontSize: 11,
          color: "#e2e8f0",
          whiteSpace: "pre-wrap",
          maxHeight: 300,
          overflowY: "auto",
          lineHeight: 1.6
        }}>
          {latestProgress}
          <span style={{
            animation: "blink 1s infinite",
            marginLeft: 2
          }}>_</span>
        </div>
      )}

      {/* Error Message */}
      {isFailed && execution.error_message && (
        <div style={{
          padding: 12,
          background: "#fef2f2",
          border: "1px solid #fca5a5",
          borderRadius: 8,
          marginTop: 12
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#991b1b", marginBottom: 4 }}>
            Error:
          </div>
          <div style={{ fontSize: 11, color: "#dc2626", fontFamily: "monospace" }}>
            {execution.error_message}
          </div>
        </div>
      )}

      {/* Success Message */}
      {isSuccess && (
        <div style={{
          padding: 16,
          background: "#f0fdf4",
          border: "1px solid #86efac",
          borderRadius: 8,
          marginTop: 12,
          textAlign: "center"
        }}>
          <div style={{ fontSize: 14, color: "#15803d", fontWeight: 600 }}>
            🎉 ETL execution completed successfully!
          </div>
          <div style={{ fontSize: 12, color: "#16a34a", marginTop: 4 }}>
            You can now view the outputs.
          </div>
        </div>
      )}
    </div>
  );
}

// ✅ Add blink animation for cursor
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }
  `;
  if (!document.head.querySelector('style[data-blink-animation]')) {
    style.setAttribute('data-blink-animation', 'true');
    document.head.appendChild(style);
  }
}
