import { apiFetch } from "./api";
import { User } from "../types/user";

export interface ProfileUpdatePayload {
  first_name?: string;
  last_name?: string;
  email?: string;
  current_password?: string;
  new_password?: string;
}

export interface AdminUserUpdatePayload {
  first_name?: string;
  last_name?: string;
  email?: string;
  username?: string;
  role?: "admin" | "user";
  is_active?: boolean;
}

export async function fetchUsers(): Promise<User[]> {
  const data = await apiFetch("/users/");
  return Array.isArray(data) ? data : (data.results ?? []);
}

export async function fetchUser(id: number): Promise<User> {
  return apiFetch(`/users/${id}/`);
}

export async function createUser(data: {
  username: string;
  email: string;
  password: string;
  role: "admin" | "user";
}): Promise<User> {
  return apiFetch("/users/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateUser(
  id: number,
  data: AdminUserUpdatePayload
): Promise<User> {
  return apiFetch(`/users/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteUser(id: number): Promise<void> {
  await apiFetch(`/users/${id}/`, { method: "DELETE" });
}

export async function toggleUserActive(id: number): Promise<User> {
  return apiFetch(`/users/${id}/toggle_active/`, { method: "POST" });
}

export async function setUserRole(
  id: number,
  role: "admin" | "user"
): Promise<User> {
  return apiFetch(`/users/${id}/set_role/`, {
    method: "POST",
    body: JSON.stringify({ role }),
  });
}

export async function adminSetPassword(
  id: number,
  password: string
): Promise<void> {
  await apiFetch(`/users/${id}/set_password/`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function updateMyProfile(
  data: ProfileUpdatePayload
): Promise<User> {
  return apiFetch("/users/me/update/", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}