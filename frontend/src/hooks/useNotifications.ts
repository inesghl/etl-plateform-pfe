// hooks/useNotifications.ts
import { useState, useCallback, useEffect } from "react";
import { Notification } from "../types/notification";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from "../api/notification";

const POLL_INTERVAL_MS = 15_000; // refresh every 15 s to catch new notifications

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchNotifications();
      setNotifications(data);
    } catch (e: any) {
      console.warn("Notifications unavailable:", e.message);
      setNotifications([]);
    }
  }, []);

  // Auto-poll so in-app notifications appear without a manual refresh
  useEffect(() => {
    loadNotifications();
    const id = setInterval(loadNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadNotifications]);

  async function markRead(id: string) {
    try {
      await markNotificationRead(id);
      // Optimistic update — no need to refetch
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
    } catch (e: any) {
      console.error("markRead failed:", e);
    }
  }

  async function markAllRead() {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (e: any) {
      console.error("markAllRead failed:", e);
    }
  }

  async function remove(id: string) {
    try {
      await deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (e: any) {
      console.error("delete notification failed:", e);
    }
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return {
    notifications, loading, error, unreadCount,
    loadNotifications, markRead, markAllRead, remove,
  };
}