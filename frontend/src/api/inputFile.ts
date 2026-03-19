import { apiFetch } from "./api";
import { InputFile } from "../types/inputFile";

export async function fetchInputFiles(executionId?: string): Promise<InputFile[]> {
  const url = executionId ? `/input-files/?execution=${executionId}` : "/input-files/";
  const data = await apiFetch(url);
  return Array.isArray(data) ? data : data?.results ?? [];
}

export async function uploadInputFile(
  executionId: string,
  fileKey: string,
  file: File
) {
  const formData = new FormData();
  formData.append("execution", executionId);
  formData.append("file_key", fileKey);
  formData.append("uploaded_file", file);
  return apiFetch("/input-files/", { method: "POST", body: formData });
}

export async function deleteInputFile(id: string) {
  return apiFetch(`/input-files/${id}/`, { method: "DELETE" });
}