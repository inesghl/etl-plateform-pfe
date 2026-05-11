import { apiFetch } from "./api";
import { Notification } from "../types/notification";

export async function fetchNotifications(): Promise<Notification[]> {
  const data = await apiFetch("/notifications/");
  return Array.isArray(data) ? data : data?.results ?? [];
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch(`/notifications/${id}/mark_read/`, { method: "PATCH" });
}

export async function markNotificationUnread(id: string): Promise<void> {
  await apiFetch(`/notifications/${id}/mark_unread/`, { method: "PATCH" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch("/notifications/mark_all_read/", { method: "POST" });
}

export async function deleteNotification(id: string): Promise<void> {
  await apiFetch(`/notifications/${id}/`, { method: "DELETE" });
}