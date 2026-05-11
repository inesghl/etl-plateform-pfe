/**
 * ScheduledExecutionBanner.tsx  — full replacement
 *
 * Shows a "Review & Launch" banner on any PENDING scheduled execution
 * where the current user is the owner (launched_by).
 * Previously this was only meaningful for admins; now regular users who
 * were assigned a scheduled run also see it.
 */
import React from "react";
import { Execution } from "../../types/execution";

type Props = {
  execution: Execution;
  /** The currently logged-in user's id */
  currentUserId: string;
  onLaunch: (exec: Execution) => void;
};

export function ScheduledExecutionBanner({ execution, currentUserId, onLaunch }: Props) {
  if (execution.status !== "PENDING") return null;

  // Show for any execution that has "scheduled" in the label
  const isScheduled = execution.execution_label?.toLowerCase().includes("scheduled") ?? false;
  if (!isScheduled) return null;

  // Only show the launch CTA to the user who owns this pending run.
  // launched_by may be an id (number/string) or a nested object depending
  // on your serialiser — normalise to string for comparison.
  const launchedById =
    typeof execution.launched_by === "object"
      ? String((execution.launched_by as any)?.id ?? "")
      : String(execution.launched_by ?? "");

  const isOwner = launchedById === String(currentUserId);

  return (
    <div style={{
      marginTop: 8, padding: "9px 12px",
      borderRadius: 8,
      background: isOwner ? "#eff6ff" : "#f8fafc",
      border: `1px solid ${isOwner ? "#93c5fd" : "#e2e8f0"}`,
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{ fontSize: 16 }}>⏰</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: isOwner ? "#1e40af" : "#475569" }}>
          {isOwner ? "Scheduled run — review before launching" : "Scheduled run pending"}
        </div>
        <div style={{ fontSize: 11, color: isOwner ? "#3b82f6" : "#94a3b8", marginTop: 1 }}>
          {isOwner
            ? "Input files may have changed. Open the launch wizard to update config."
            : "Waiting for the assigned user to review and launch."}
        </div>
      </div>

      {isOwner && (
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