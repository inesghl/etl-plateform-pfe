// api/scheduling.ts
import { apiFetch } from "./api";

export type Frequency = "daily" | "weekly" | "monthly";

export interface ETLSchedule {
  id: string;
  etl: string;
  etl_name: string;
  is_active: boolean;
  frequency: Frequency;
  time_of_day: string;         // "HH:MM:SS"
  day_of_week: number | null;  // 0=Mon…6=Sun
  day_of_month: number | null; // 1-28
  notify_email: string;
  effective_email: string;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchedulePayload {
  etl: string;
  frequency: Frequency;
  time_of_day: string;         // "HH:MM"
  day_of_week?: number | null;
  day_of_month?: number | null;
  notify_email?: string;
  is_active?: boolean;
}

export async function fetchSchedules(): Promise<ETLSchedule[]> {
  const data = await apiFetch("/schedules/");
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

export async function fetchScheduleForEtl(etlId: string): Promise<ETLSchedule | null> {
  const all = await fetchSchedules();
  return all.find((s) => s.etl === etlId) ?? null;
}

export async function createSchedule(payload: SchedulePayload): Promise<ETLSchedule> {
  return apiFetch("/schedules/", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  });
}

export async function updateSchedule(id: string, payload: Partial<SchedulePayload>): Promise<ETLSchedule> {
  return apiFetch(`/schedules/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  });
}

export async function deleteSchedule(id: string): Promise<void> {
  return apiFetch(`/schedules/${id}/`, { method: "DELETE" });
}

export async function toggleSchedule(id: string): Promise<ETLSchedule> {
  return apiFetch(`/schedules/${id}/toggle/`, { method: "POST" });
}