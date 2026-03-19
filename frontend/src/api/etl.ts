import { apiFetch } from "./api";
import { Etl } from "../types/etl";

export async function fetchEtls(): Promise<Etl[]> {
  const data = await apiFetch("/etls/");
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

export async function fetchEtl(id: string): Promise<Etl> {
  return apiFetch(`/etls/${id}/`);
}

export async function uploadEtl(formData: FormData) {
  return apiFetch("/etls/", { method: "POST", body: formData });
}

export async function validateEtl(id: string) {
  return apiFetch(`/etls/${id}/validate/`, { method: "POST" });
}

export async function activateEtl(id: string) {
  return apiFetch(`/etls/${id}/activate/`, { method: "POST" });
}

export async function deleteEtl(id: string) {
  return apiFetch(`/etls/${id}/`, { method: "DELETE" });
}