// api/groups.ts
import { apiFetch } from "./api";
import { UserGroup } from "../types/group";

export async function fetchGroups(): Promise<UserGroup[]> {
  const data = await apiFetch("/groups/");
  return Array.isArray(data) ? data : data?.results ?? [];
}

export async function createGroup(payload: {
  name: string;
  description?: string;
  member_ids?: number[];
}): Promise<UserGroup> {
  return apiFetch("/groups/", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateGroup(
  id: string,
  payload: { name?: string; description?: string; member_ids?: number[] },
): Promise<UserGroup> {
  return apiFetch(`/groups/${id}/`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deleteGroup(id: string): Promise<void> {
  await apiFetch(`/groups/${id}/`, { method: "DELETE" });
}

export async function addGroupMembers(id: string, user_ids: number[]): Promise<UserGroup> {
  return apiFetch(`/groups/${id}/add_members/`, {
    method: "POST",
    body: JSON.stringify({ user_ids }),
  });
}

export async function removeGroupMembers(id: string, user_ids: number[]): Promise<UserGroup> {
  return apiFetch(`/groups/${id}/remove_members/`, {
    method: "POST",
    body: JSON.stringify({ user_ids }),
  });
}

