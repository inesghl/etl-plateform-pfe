import { apiFetch } from "./api";
import { Execution } from "../types/execution";

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

export async function cancelExecution(id: string) {
  return apiFetch(`/executions/${id}/cancel/`, { method: "POST" });
}