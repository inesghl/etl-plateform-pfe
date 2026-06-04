import React, { useState } from "react";
import { Execution } from "../../types/execution";
import { ExecutionCard } from "./ExecutionCard";
import { Empty } from "../common/Empty";

type Props = {
  executions: Execution[];
  initialSearch?: string;
  onViewLogs?: (exec: Execution) => void;
  onViewOutputs?: (exec: Execution) => void;
  onViewInputs?: (exec: Execution) => void;
  onReviewScheduled?: (exec: Execution) => void;
};

export function ExecutionList({
  executions: initialExecutions,
  initialSearch = "",
  onViewLogs,
  onViewOutputs,
  onViewInputs,
  onReviewScheduled,
}: Props) {
  const [executions, setExecutions] = useState(initialExecutions);
  const [search, setSearch] = useState(initialSearch);

  React.useEffect(() => { setExecutions(initialExecutions); }, [initialExecutions]);
  React.useEffect(() => { if (initialSearch) setSearch(initialSearch); }, [initialSearch]);

  function handleDelete(deleted: Execution) {
    setExecutions(prev => prev.filter(e => e.id !== deleted.id));
  }

  const q = search.trim().toLowerCase();
  const visible = q
    ? executions.filter(e =>
        (e.etl_name ?? "").toLowerCase().includes(q) ||
        (e.execution_label ?? "").toLowerCase().includes(q) ||
        (e.launched_by_username ?? "").toLowerCase().includes(q) ||
        e.status.toLowerCase().includes(q)
      )
    : executions;

  return (
    <div>
      {/* Search / filter bar */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by ETL name, label, user, or status…"
          style={{
            flex: 1, padding: "8px 12px", borderRadius: 8,
            border: "1px solid #e2e8f0", background: "#f8fafc",
            fontSize: 13, color: "#0f172a", outline: "none",
          }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            style={{
              padding: "6px 10px", borderRadius: 8, fontSize: 12,
              border: "1px solid #e2e8f0", background: "transparent",
              color: "#94a3b8", cursor: "pointer",
            }}
          >
            ✕ Clear
          </button>
        )}
        <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>
          {visible.length} / {executions.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <Empty icon="▶" text={q ? `No executions matching "${q}".` : "No executions yet."} />
      ) : (
        visible.map(exec => (
          <ExecutionCard
            key={exec.id}
            execution={exec}
            onViewLogs={onViewLogs}
            onViewOutputs={onViewOutputs}
            onViewInputs={onViewInputs}
            onReviewScheduled={onReviewScheduled}
            onDelete={handleDelete}
          />
        ))
      )}
    </div>
  );
}