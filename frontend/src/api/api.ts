const API_BASE = "http://localhost:8000/api";

export function getToken() {
  return localStorage.getItem("access_token");
}

export function setToken(token: string) {
  localStorage.setItem("access_token", token);
}

export function removeToken() {
  localStorage.removeItem("access_token");
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const isFormData = options.body instanceof FormData;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(!isFormData ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    // Read body ONCE as text, then parse if possible
    const raw = await res.text();
    let errorMessage = `HTTP ${res.status}`;
    try {
      const errorData = JSON.parse(raw);
      if (errorData.detail) {
        errorMessage = errorData.detail;
      } else if (errorData.error) {
        errorMessage = errorData.error;
      } else if (errorData.errors) {
        errorMessage = Array.isArray(errorData.errors)
          ? errorData.errors.join(", ")
          : JSON.stringify(errorData.errors);
      } else {
        // Flatten all field errors: { field: ["msg"] } → "msg"
        const messages = Object.values(errorData).flat();
        if (messages.length > 0) {
          errorMessage = messages.join(" ");
        }
      }
    } catch {
      if (raw && raw.length < 300) errorMessage = raw;
    }
    throw new Error(errorMessage);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export { API_BASE };