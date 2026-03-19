import { useState, useCallback } from "react";
import { Notification } from "../types/notification";
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from "../api/notification";

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchNotifications();
      setNotifications(data);
    } catch (e: any) {
      // Silently fail if notifications endpoint doesn't exist
      console.warn("Notifications not available:", e.message);
      setNotifications([]);
    }
  }, []);

  async function markRead(id: string) {
    try {
      setError(null);
      await markNotificationRead(id);
      await loadNotifications();
    } catch (e: any) {
      console.error("Failed to mark notification as read:", e);
    }
  }

  async function markAllRead() {
    try {
      setError(null);
      await markAllNotificationsRead();
      await loadNotifications();
    } catch (e: any) {
      console.error("Failed to mark all as read:", e);
    }
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return { notifications, loading, error, unreadCount, loadNotifications, markRead, markAllRead };
}