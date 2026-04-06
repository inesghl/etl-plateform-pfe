// components/notification/NotificationCard.tsx
import React from "react";
import { Notification, NotificationType } from "../../types/notification";
import { deleteNotification } from "../../api/notification";

type Props = {
  notification: Notification;
  onMarkRead?: (id: string) => Promise<void>;
  onDeleted?: (id: string) => void;
};

const TYPE_STYLES: Record<NotificationType, { border: string; bg: string; dot: string; label: string }> = {
  success: { border: "#86efac", bg: "#f0fdf4", dot: "#16a34a", label: "✓" },
  error:   { border: "#fca5a5", bg: "#fef2f2", dot: "#dc2626", label: "✗" },
  warning: { border: "#fde68a", bg: "#fffbeb", dot: "#d97706", label: "⚠" },
  info:    { border: "#93c5fd", bg: "#eff6ff", dot: "#2563eb", label: "ℹ" },
};

export function NotificationCard({ notification, onMarkRead, onDeleted }: Props) {
  const [deleting, setDeleting] = React.useState(false);
  const s = TYPE_STYLES[notification.notification_type] ?? TYPE_STYLES.info;

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteNotification(notification.id);
      onDeleted?.(notification.id);
    } catch (e) {
      console.error(e);
      setDeleting(false);
    }
  }

  return (
    <div style={{
      marginBottom: 8, padding: "12px 14px", borderRadius: 8,
      border: `1px solid ${notification.is_read ? "#e2e8f0" : s.border}`,
      background: notification.is_read ? "#fff" : s.bg,
      display: "flex", gap: 12, alignItems: "flex-start",
      opacity: deleting ? 0.5 : 1, transition: "opacity .2s",
    }}>
      {/* Colour dot */}
      <div style={{
        width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
        background: notification.is_read ? "#cbd5e1" : s.dot,
        marginTop: 4,
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: notification.is_read ? 400 : 600,
          color: "#0f172a", marginBottom: 2,
        }}>
          {notification.title}
        </div>
        {notification.message && (
          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
            {notification.message}
          </div>
        )}
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
          {new Date(notification.created_at).toLocaleString()}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {!notification.is_read && onMarkRead && (
          <button
            onClick={() => onMarkRead(notification.id)}
            style={{
              fontSize: 11, padding: "3px 8px", borderRadius: 6,
              border: "1px solid #e2e8f0", background: "#fff",
              color: "#64748b", cursor: "pointer",
            }}
          >
            Mark read
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            fontSize: 11, padding: "3px 8px", borderRadius: 6,
            border: "1px solid #fca5a5", background: "#fff",
            color: "#dc2626", cursor: "pointer",
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}