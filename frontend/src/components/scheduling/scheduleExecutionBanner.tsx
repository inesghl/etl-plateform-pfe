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
  isAdmin?: boolean;
  currentUsername?: string;
};

export function ScheduledExecutionBanner({ execution, onLaunch, isAdmin = false, currentUsername }: Props) {
  if (execution.status !== "PENDING") return null;

  const isScheduledBySystem = !execution.launched_by_username
    || execution.execution_label?.includes("scheduled");
  const isManualTrigger = execution.execution_label?.includes("manual trigger");

  // Show for both scheduler-created and fire_now-created executions
  if (!isScheduledBySystem && !isManualTrigger) return null;

  // A scheduler-fired run belongs to no one in particular — any admin (or
  // group member) can review it. A manual "fire now" run belongs to the
  // specific user who triggered it — an admin viewing someone else's
  // manual trigger can still cancel it, but reviewing/launching is their job.
  const canReviewLaunch = !isAdmin || isScheduledBySystem || execution.launched_by_username === currentUsername;

  const title = !canReviewLaunch
    ? (isScheduledBySystem ? "Scheduled run — awaiting the owning user" : "Manually triggered run — awaiting the owning user")
    : isScheduledBySystem
    ? "Scheduled run — review before launching"
    : "Manually triggered run — review before launching";
  const subtitle = !canReviewLaunch
    ? "Only the assigned user can review and launch this — you can still cancel it below."
    : isScheduledBySystem
    ? "Input files may have changed since the last run."
    : "Created on demand. Review config before launching.";

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

          <div style={{ fontSize: 12, fontWeight: 600, color: "#1e40af" }}>{title}</div>
      <div style={{ fontSize: 11, color: "#3b82f6", marginTop: 1 }}>{subtitle}</div>


      </div>
      {canReviewLaunch && (
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
      )}
    </div>
  );
}