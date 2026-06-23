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

export type OutputDelivery = "app" | "email" | "both";

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

  // Config for this run
  execution_config?: Record<string, any>;
  config_overrides?: Record<string, any>;

  // Delivery
  output_delivery?: OutputDelivery;
  notify_email?: string;
  report_sent?: boolean;
  report_sent_at?: string;
  hidden_by_user?: boolean;
};