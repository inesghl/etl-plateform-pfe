const API_BASE_URL = "http://localhost:8000/api";

export function getToken() {
  return localStorage.getItem("access_token");
}

export function setToken(token: string) {
  localStorage.setItem("access_token", token);
}

export async function fetchCurrentUser() {
  const token = getToken();
  if (!token) {
    throw new Error("No token");
  }

  const response = await fetch(`${API_BASE_URL}/users/me/`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error("Failed to load user");
  }

  return response.json();
}

export async function login(username: string, password: string) {
  const response = await fetch(`${API_BASE_URL}/auth/login/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    throw new Error("Invalid credentials");
  }

  const data = await response.json();
  setToken(data.access);
}

export async function fetchEtls() {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/etls/`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    throw new Error("Failed to load ETLs");
  }
  return response.json();
}

export async function uploadEtl(formData: FormData) {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/etls/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to upload ETL");
  }

  return response.json();
}

