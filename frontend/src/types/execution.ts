export type ExecutionStatus =
  | "PENDING"
  | "VALIDATING"
  | "VALIDATED"
  | "VALIDATION_FAILED"
  | "INSTALLING_DEPS"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED";

export type Execution = {
  id: string;
  etl: string;
  etl_name?: string;
  execution_label: string;
  launched_by: number;
  launched_by_username?: string;
  status: ExecutionStatus;
  work_dir?: string;
  launched_at: string;
  started_at?: string;
  completed_at?: string;
  return_code?: number;
  stdout_log?: string;
  stderr_log?: string;
  error_message?: string;
  duration_seconds?: number;
};