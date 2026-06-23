import { useState, useCallback, useEffect, useRef } from "react";
import { Notification } from "../types/notification";
import {
  fetchNotifications,
  markNotificationRead,
  markNotificationUnread,
  markAllNotificationsRead,
  deleteNotification,
} from "../api/notification";

const POLL_INTERVAL_MS = 15_000;

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  // Ids deleted locally but possibly still present in an in-flight poll's
  // response — without this, a poll that started just before a delete can
  // resolve afterwards and silently bring the deleted notification back.
  const recentlyDeleted = useRef<Map<string, number>>(new Map());

  const loadNotifications = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchNotifications();
      const now = Date.now();
      for (const [id, ts] of recentlyDeleted.current) {
        if (now - ts > 20_000) recentlyDeleted.current.delete(id);
      }
      setNotifications(data.filter((n: Notification) => !recentlyDeleted.current.has(n.id)));
    } catch (e: any) {
      console.warn("Notifications unavailable:", e.message);
      setNotifications([]);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const id = setInterval(loadNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadNotifications]);

  async function markRead(id: string) {
    try {
      await markNotificationRead(id);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
    } catch (e: any) {
      console.error("markRead failed:", e);
    }
  }

  async function markUnread(id: string) {
    try {
      await markNotificationUnread(id);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: false } : n)
      );
    } catch (e: any) {
      console.error("markUnread failed:", e);
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
    // Remove from the UI immediately — don't wait on the network round-trip.
    // Roll back if the delete actually fails on the server.
    const removed = notifications.find(n => n.id === id);
    recentlyDeleted.current.set(id, Date.now());
    setNotifications(prev => prev.filter(n => n.id !== id));
    try {
      await deleteNotification(id);
    } catch (e: any) {
      console.error("delete notification failed:", e);
      recentlyDeleted.current.delete(id);
      if (removed) setNotifications(prev => [...prev, removed].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    }
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return {
    notifications, loading, error, unreadCount,
    loadNotifications, markRead, markUnread, markAllRead, remove,
  };
}