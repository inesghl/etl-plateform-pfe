// src/api/stats.ts
import { apiFetch } from "./api";

export type StatsRange = "7d" | "30d" | "all";

export interface StatsKPIs {
  total_executions: number;
  success_rate: number;
  avg_duration_seconds: number;
  output_files_count: number;
  output_files_size_mb: number;
}

export interface StatusDist {
  status: string;
  count: number;
}

export interface TimelineRow {
  date: string;
  success: number;
  failed: number;
  total: number;
}

export interface TopETL {
  etl__id: string;
  etl__name: string;
  etl__version: string;
  runs: number;
  successes: number;
  success_rate: number;
}

export interface TopUser {
  launched_by__id: string;
  launched_by__email: string;
  launched_by__first_name: string;
  launched_by__last_name: string;
  runs: number;
  success_rate: number;
}

export interface FileTypeStat {
  file_type: string;
  count: number;
  size_mb: number;
}

export interface ETLHealth {
  total: number;
  active: number;
  validated: number;
  with_groups: number;
  active_schedules: number;
}

export interface RecentFailure {
  id: string;
  etl__name: string;
  launched_by__email: string;
  launched_at: string;
  error_snippet: string;
}

export interface DashboardStatsData {
  range: StatsRange;
  kpis: StatsKPIs;
  status_distribution: StatusDist[];
  timeline: TimelineRow[];
  top_etls: TopETL[];
  top_users: TopUser[];
  file_types: FileTypeStat[];
  etl_health: ETLHealth;
  recent_failures: RecentFailure[];
}

export async function fetchDashboardStats(range: StatsRange): Promise<DashboardStatsData> {
  return apiFetch(`/dashboard/?range=${range}`);
}