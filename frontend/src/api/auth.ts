import { apiFetch, setToken } from "./api";
import { User } from "../types/user";

export async function login(username: string, password: string) {
  const data = await apiFetch("/auth/login/", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setToken(data.access);
  return data;
}

export async function fetchCurrentUser(): Promise<User> {
  return apiFetch("/users/me/");
}

export async function register(
  username: string,
  email: string,
  password: string,
  role: "admin" | "user" = "user"
) {
  return apiFetch("/users/register/", {
    method: "POST",
    body: JSON.stringify({ username, email, password, role }),
  });
}