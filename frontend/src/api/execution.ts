import { apiFetch } from "./api";
import { Execution, OutputDelivery } from "../types/execution";




export type PrepareData = {
  execution_id: string;
  status: string;
  etl_name: string;
  entry_point: string;
  python_version: string;
  config_file_path: string;
  etl_config: Record<string, any>;
  execution_config: Record<string, any>;
  config_overrides: Record<string, any>;
  output_delivery: OutputDelivery;
  notify_email: string;
  // These two are required — always present in the /prepare response
  path_like_keys: Record<string, string>;          // { config_key: raw_value }
  path_classifications: Record<string, string>;    // { config_key: "input"|"output"|"skip" }
  config_diff?: Record<string, { from: any; to: any }>;
};

export type UpdateConfigPayload = {
  overrides: Record<string, any>;
  output_delivery: OutputDelivery;
  notify_email: string;
};

// ── API calls ────────────────────────────────────────────────────

/**
 * GET /executions/<id>/prepare/
 * Returns config + path detection data needed for the LaunchModal steps.
 */
export async function prepareExecution(executionId: string): Promise<PrepareData> {
  const data = await apiFetch(`/executions/${executionId}/prepare/`);
  // Guarantee these keys exist even if the backend returns them empty
  return {
    ...data,
    path_like_keys:       data.path_like_keys       ?? {},
    path_classifications: data.path_classifications ?? {},
    config_overrides:     data.config_overrides     ?? {},
  };
}

/**
 * PATCH /executions/<id>/update_config/
 * Merges overrides into execution_config and returns updated execution + path data.
 */
export async function updateExecutionConfig(
  executionId: string,
  payload: UpdateConfigPayload,
): Promise<any> {
  return apiFetch(`/executions/${executionId}/update_config/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}


export async function fetchExecutions(): Promise<Execution[]> {
  const data = await apiFetch("/executions/");
  return Array.isArray(data) ? data : data?.results ?? [];
}

export async function fetchExecution(id: string): Promise<Execution> {
  return apiFetch(`/executions/${id}/`);
}

export async function createExecution(etlId: string, label: string) {
  return apiFetch("/executions/", {
    method: "POST",
    body: JSON.stringify({ etl: etlId, execution_label: label }),
  });
}



export async function launchExecution(id: string) {
  return apiFetch(`/executions/${id}/launch/`, { method: "POST" });
}

export async function sendExecutionReport(id: string, email: string) {
  return apiFetch(`/executions/${id}/send_report/`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function cancelExecution(id: string) {
  return apiFetch(`/executions/${id}/cancel/`, { method: "POST" });
}