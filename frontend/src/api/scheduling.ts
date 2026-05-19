// api/scheduling.ts
import { apiFetch } from "./api";

export type Frequency    = "daily" | "weekly" | "monthly" | "yearly";
export type NotifyTarget = "creator" | "group" | "specific";

export interface ETLSchedule {
  id: string;
  etl: string;
  etl_name: string;
  is_active: boolean;
  frequency: Frequency;
  time_of_day: string;            // "HH:MM:SS"
  day_of_week: number | null;     // 0=Mon … 6=Sun
  day_of_month: number | null;    // 1–31  (backend clamps to month length)
  month_of_year: number | null;   // 1–12  (yearly only)
  // notification
  notify_target: NotifyTarget;
  notify_specific_email: string;
  backup_email: string;
  effective_email: string;
  all_notify_emails: string[];
  // timestamps
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchedulePayload {
  etl: string;
  frequency: Frequency;
  time_of_day: string;            // "HH:MM"
  day_of_week?: number | null;
  day_of_month?: number | null;
  month_of_year?: number | null;  // yearly only
  // notification
  notify_target?: NotifyTarget;
  notify_specific_email?: string;
  backup_email?: string;
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
  return all.find(s => s.etl === etlId) ?? null;
}

export async function createSchedule(payload: SchedulePayload): Promise<ETLSchedule> {
  return apiFetch("/schedules/", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  });
}

export async function updateSchedule(
  id: string,
  payload: Partial<SchedulePayload>,
): Promise<ETLSchedule> {
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

/**
 * Immediately create a PENDING execution for this schedule.
 * Available to ALL users for ETLs they own (not admin-only).
 * The backend scopes access via get_queryset — users can only
 * trigger their own schedules.
 */
export async function fireScheduleNow(
  id: string,
): Promise<{ detail: string; execution_id: string }> {
  return apiFetch(`/schedules/${id}/fire_now/`, { method: "POST" });
}