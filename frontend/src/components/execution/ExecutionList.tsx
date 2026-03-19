import React from "react";
import { Execution } from "../../types/execution";
import { ExecutionCard } from "./ExecutionCard";
import { Empty } from "../common/Empty";

type Props = {
  executions: Execution[];
  onViewLogs?: (exec: Execution) => void;
  onViewOutputs?: (exec: Execution) => void;
  onViewInputs?: (exec: Execution) => void;  // ✅ ADD THIS
};

export function ExecutionList({ executions, onViewLogs, onViewOutputs, onViewInputs }: Props) {
  if (executions.length === 0) {
    return <Empty icon="🚀" text="No executions yet." />;
  }

  const sorted = [...executions].sort(
    (a, b) => new Date(b.launched_at).getTime() - new Date(a.launched_at).getTime()
  );

  return (
    <div>

      {sorted.map((exec) => (
        <ExecutionCard
          key={exec.id}
          execution={exec}
          onViewLogs={onViewLogs}
          onViewOutputs={onViewOutputs}
          onViewInputs={onViewInputs}  // ✅ ADD THIS
        />

      ))}
    </div>


  );
}