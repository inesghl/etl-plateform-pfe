import { apiFetch } from "./api";
import { OutputFile } from "../types/outputFile";

export async function fetchOutputFiles(executionId: string): Promise<OutputFile[]> {
  const data = await apiFetch(`/output-files/?execution=${executionId}`);

  // Handle paginated or direct array response
  if (Array.isArray(data)) {
    return data;
  }

  if (data?.results) {
    return data.results;
  }

  return [];
}

export async function downloadOutputFile(fileId: string, filename: string): Promise<void> {
  const token = localStorage.getItem('access_token');

  const response = await fetch(`http://localhost:8000/api/output-files/${fileId}/download/`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Download failed');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}