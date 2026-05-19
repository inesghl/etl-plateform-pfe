import React, { useState } from "react";
import { Execution } from "../../types/execution";
import { ExecutionCard } from "./ExecutionCard";
import { Empty } from "../common/Empty";

type Props = {
  executions: Execution[];
  onViewLogs?: (exec: Execution) => void;
  onViewOutputs?: (exec: Execution) => void;
  onViewInputs?: (exec: Execution) => void;
  onReviewScheduled?: (exec: Execution) => void;
};

export function ExecutionList({
  executions: initialExecutions,
  onViewLogs,
  onViewOutputs,
  onViewInputs,
  onReviewScheduled,
}: Props) {
  const [executions, setExecutions] = useState(initialExecutions);

  // Keep in sync if the parent passes a new list (e.g. after refresh)
  React.useEffect(() => {
    setExecutions(initialExecutions);
  }, [initialExecutions]);

  function handleDelete(deleted: Execution) {
    setExecutions(prev => prev.filter(e => e.id !== deleted.id));
  }

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
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}