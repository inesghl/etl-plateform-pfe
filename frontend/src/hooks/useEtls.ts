import { useState, useCallback } from "react";
import { Etl } from "../types/etl";
import { fetchEtls, uploadEtl, validateEtl, activateEtl } from "../api/etl";

export function useEtls() {
  const [etls, setEtls] = useState<Etl[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEtls = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchEtls();
      setEtls(data);
    } catch (e: any) {
      setError(e.message || "Failed to load ETLs");
    }
  }, []);

  async function upload(formData: FormData) {
    try {
      setLoading(true);
      setError(null);
      await uploadEtl(formData);
      await loadEtls();
    } catch (e: any) {
      setError(e.message || "Upload failed");
      throw e;
    } finally {
      setLoading(false);
    }
  }

  async function validate(id: string) {
    try {
      setError(null);
      await validateEtl(id);
      await loadEtls();
    } catch (e: any) {
      setError(e.message || "Validation failed");
      throw e;
    }
  }

  async function activate(id: string) {
    try {
      setError(null);
      await activateEtl(id);
      await loadEtls();
    } catch (e: any) {
      setError(e.message || "Activation failed");
      throw e;
    }
  }

  return { etls, loading, error, loadEtls, upload, validate, activate };
}