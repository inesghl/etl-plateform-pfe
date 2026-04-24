// components/execution/ExecutionList.tsx
import React from "react";
import { Execution } from "../../types/execution";
import { ExecutionCard } from "./ExecutionCard";
import { Empty } from "../common/Empty";

type Props = {
  executions: Execution[];
  onViewLogs?: (exec: Execution) => void;
  onViewOutputs?: (exec: Execution) => void;
  onViewInputs?: (exec: Execution) => void;
  onReviewScheduled?: (exec: Execution) => void;  // ← added
};

export function ExecutionList({
  executions,
  onViewLogs,
  onViewOutputs,
  onViewInputs,
  onReviewScheduled,
}: Props) {
  if (executions.length === 0) {
    return <Empty icon="▶" text="No executions yet." />;
  }

  return (
    <div>
      {executions.map(exec => (
        <ExecutionCard
          key={exec.id}
          execution={exec}
          onViewLogs={onViewLogs}
          onViewOutputs={onViewOutputs}
          onViewInputs={onViewInputs}
          onReviewScheduled={onReviewScheduled}
        />
      ))}
    </div>
  );
}