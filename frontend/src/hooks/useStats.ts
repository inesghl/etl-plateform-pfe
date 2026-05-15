// src/hooks/useStats.ts
import { useState, useCallback } from "react";
import { fetchDashboardStats, DashboardStatsData, StatsRange } from "../api/stats";

export function useStats() {

  const [data, setData] = useState<DashboardStatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<StatsRange>("30d");

  const loadStats = useCallback(async (r?: StatsRange) => {
    const target = r ?? range;
    try {
      setLoading(true);
      setError(null);
      const result = await fetchDashboardStats(target);
      setData(result);
    } catch (e: any) {
      setError(e.message || "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, [range]);

  function changeRange(r: StatsRange) {
    setRange(r);
    loadStats(r);
  }

  return { data, loading, error, range, loadStats, changeRange };
}