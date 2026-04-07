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
  // formData already contains name, description, version, zip_file,
  // entry_point_path, config_file_path, requirements_path, python_version
  return apiFetch("/etls/", { method: "POST", body: formData });
}

export async function readEtlConfig(id: string): Promise<{
  config_file_path: string;
  parsed: Record<string, any>;
  raw: string;
}> {
  return apiFetch(`/etls/${id}/read_config/`);
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
export async function editEtl(id: string, data: any) {
  return apiFetch(`/etls/${id}/edit/`, {
    method: "PATCH",
    body: JSON.stringify(data),
    headers: {
      "Content-Type": "application/json",
    },
  });
}
export async function assignEtlGroups(id: string, groupIds: string[]) {
  return apiFetch(`/etls/${id}/assign_groups/`, {
    method: "POST",
    body: JSON.stringify({ group_ids: groupIds }),
    headers: {
      "Content-Type": "application/json",
    },
  });
}