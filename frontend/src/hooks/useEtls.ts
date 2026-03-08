import { useState } from "react";
import { fetchEtls, uploadEtl, validateEtl, activateEtl } from "../api/api";
import { Etl } from "../types/etl";

export function useEtls() {
  const [etls, setEtls] = useState<Etl[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadEtls() {
    try {
      setError(null);
      const data = await fetchEtls();
      setEtls(data);
    } catch (err) {
      console.error(err);
      setError("Could not load ETLs.");
    }
  }

  async function upload(formData: FormData) {
    try {
      setLoading(true);
      setError(null);
      await uploadEtl(formData);
      await loadEtls();
    } catch (err) {
      console.error(err);
      setError("Upload failed. Check file and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function validate(id: string) {
    try {
      setError(null);
      await validateEtl(id);
      await loadEtls();
    } catch (err: any) {
      setError(err.message ?? "Validation failed.");
    }
  }

  async function activate(id: string) {
    try {
      setError(null);
      await activateEtl(id);
      await loadEtls();
    } catch (err: any) {
      setError(err.message ?? "Activation failed.");
    }
  }

  return { etls, loadEtls, upload, validate, activate, loading, error };
}