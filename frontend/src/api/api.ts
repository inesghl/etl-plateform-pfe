const API_BASE_URL = "http://localhost:8000/api";

export function getToken() {
  return localStorage.getItem("access_token");
}

export function setToken(token: string) {
  localStorage.setItem("access_token", token);
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(!isFormData ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function fetchCurrentUser() {
  return apiFetch("/users/me/");
}

export async function login(username: string, password: string) {
  const data = await apiFetch("/auth/login/", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setToken(data.access);
}

export async function fetchEtls() {
  const data = await apiFetch("/etls/");
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
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