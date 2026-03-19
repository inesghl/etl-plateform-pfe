import { useState, useCallback } from "react";
import { Execution } from "../types/execution";
import { fetchExecutions, createExecution, launchExecution } from "../api/execution";

export function useExecutions() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadExecutions = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchExecutions();
      setExecutions(data);
    } catch (e: any) {
      setError(e.message || "Failed to load executions");
    }
  }, []);

  async function create(etlId: string, label: string) {
    try {
      setLoading(true);
      setError(null);
      const exec = await createExecution(etlId, label);
      await loadExecutions();
      return exec;
    } catch (e: any) {
      setError(e.message || "Failed to create execution");
      throw e;
    } finally {
      setLoading(false);
    }
  }

  async function launch(id: string) {
    try {
      setLoading(true);
      setError(null);
      await launchExecution(id);
      await loadExecutions();
    } catch (e: any) {
      setError(e.message || "Failed to launch execution");
      throw e;
    } finally {
      setLoading(false);
    }
  }

  return { executions, loading, error, loadExecutions, create, launch };
}