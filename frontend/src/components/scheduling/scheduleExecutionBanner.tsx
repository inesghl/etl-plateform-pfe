/**
 * ScheduledExecutionBanner.tsx
 * ─────────────────────────────
 * A compact banner shown inside ExecutionCard when the execution was
 * created by the scheduler (i.e. it's PENDING and has a schedule label).
 * Prompts the user to open the LaunchModal to review config and fire the run.
 */

import React from "react";
import { Execution } from "../../types/execution";

type Props = {
  execution: Execution;
  onLaunch: (exec: Execution) => void;
};

export function ScheduledExecutionBanner({ execution, onLaunch }: Props) {
  // Only show for PENDING executions that look like they came from the scheduler
  if (execution.status !== "PENDING") return null;
  const isScheduled = execution.execution_label?.includes("scheduled") ?? false;
  if (!isScheduled) return null;

  return (
    <div style={{
      marginTop: 8, padding: "9px 12px",
      borderRadius: 8,
      background: "#eff6ff",
      border: "1px solid #93c5fd",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{ fontSize: 16 }}>⏰</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#1e40af" }}>
          Scheduled run — review before launching
        </div>
        <div style={{ fontSize: 11, color: "#3b82f6", marginTop: 1 }}>
          Input files may have changed since the last run. Open the launch wizard to update config.
        </div>
      </div>
      <button
        onClick={() => onLaunch(execution)}
        style={{
          padding: "6px 14px", borderRadius: 8,
          background: "#2563eb", color: "#fff",
          border: "none", cursor: "pointer",
          fontSize: 12, fontWeight: 600, flexShrink: 0,
        }}
      >
        Review &amp; Launch →
      </button>
    </div>
  );
}