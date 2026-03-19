import { apiFetch } from "./api";
import { Notification } from "../types/notification";

export async function fetchNotifications(): Promise<Notification[]> {
  const data = await apiFetch("/notifications/");
  return Array.isArray(data) ? data : data?.results ?? [];
}

export async function markNotificationRead(id: string) {
  return apiFetch(`/notifications/${id}/`, {
    method: "PATCH",
    body: JSON.stringify({ is_read: true }),
  });
}

export async function markAllNotificationsRead() {
  const notifications = await fetchNotifications();
  await Promise.all(
    notifications
      .filter((n) => !n.is_read)
      .map((n) => markNotificationRead(n.id))
  );
}

export async function deleteNotification(id: string) {
  return apiFetch(`/notifications/${id}/`, { method: "DELETE" });
}