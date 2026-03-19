import React, {useEffect, useState} from "react";
import { Execution } from "../../types/execution";
import { Card } from "../common/Card";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";
import { STATUS_COLORS } from "../../utils/constants";
import { apiFetch } from "../../api/api";
type Props = {
  execution: Execution;
  onViewLogs?: (exec: Execution) => void;
  onViewOutputs?: (exec: Execution) => void;
  onViewInputs?: (exec: Execution) => void;  // ✅ ADD THIS
};

export function ExecutionCard({ execution: initialExecution, onViewLogs, onViewOutputs, onViewInputs }: Props) {
 const [execution, setExecution] = useState(initialExecution);

  useEffect(() => {
    // Auto-refresh while running
    if (["PENDING", "INSTALLING_DEPS", "RUNNING"].includes(execution.status)) {
      const interval = setInterval(async () => {
        try {
          const updated = await apiFetch(`/executions/${execution.id}/`);
          setExecution(updated);
        } catch (e) {
          console.error("Failed to refresh execution:", e);
        }
      }, 2000); // Refresh every 2 seconds

      return () => clearInterval(interval);
    }
  }, [execution.id, execution.status]);
  return (
    <Card style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {execution.execution_label || execution.etl_name}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
            {execution.etl_name} · {execution.launched_by_username} · {new Date(execution.launched_at).toLocaleString()}
            {execution.completed_at && ` → ${new Date(execution.completed_at).toLocaleTimeString()}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <Badge label={execution.status} color={STATUS_COLORS[execution.status]} />

          {/* ✅ ADD THIS BUTTON */}
          {onViewInputs && (
  <Button
    small
    variant="ghost"
    onClick={() => {
      console.log('📁 Inputs button clicked for execution:', execution.id);
      onViewInputs(execution);
    }}
  >
    📁 Inputs
  </Button>
)}

          {onViewLogs && (
            <Button small variant="ghost" onClick={() => onViewLogs(execution)}>
              📋 Logs
            </Button>
          )}

          {execution.status === "SUCCESS" && onViewOutputs && (
            <Button small variant="success" onClick={() => onViewOutputs(execution)}>
              ⬇ Outputs
            </Button>
          )}
        </div>
      </div>
     {/* 🔵 LIVE ETL PROGRESS */}
  {execution.status === "RUNNING" && (
    <div style={{
      marginTop: 8,
      fontSize: 11,
      color: "#3b82f6",
      fontFamily: "monospace",
      background: "#f1f5f9",
      padding: "6px 8px",
      borderRadius: 6
    }}>
      {
        execution.stdout_log
          ?.split("\n")
          .filter(line => line.startsWith("["))
          .slice(-1)[0] || "Processing..."
      }
    </div>
  )}

</Card>
  );
}