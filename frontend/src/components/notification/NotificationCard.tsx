import React from "react";
import { Notification } from "../../types/notification";
import { Card } from "../common/Card";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";
import { NOTIFICATION_COLORS } from "../../utils/constants";

type Props = {
  notification: Notification;
  onMarkRead?: (id: string) => Promise<void>;
};

export function NotificationCard({ notification, onMarkRead }: Props) {
  return (
    <Card style={{ marginBottom: 8, opacity: notification.is_read ? 0.55 : 1, borderLeft: `3px solid ${NOTIFICATION_COLORS[notification.level]}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {!notification.is_read && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#3b82f6", marginRight: 6, verticalAlign: "middle" }} />}
            {notification.title}
          </div>
          <div style={{ fontSize: 13, color: "#475569", marginTop: 3 }}>{notification.message}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 5 }}>
            {new Date(notification.created_at).toLocaleString()}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Badge label={notification.level} color={NOTIFICATION_COLORS[notification.level]} />
          {!notification.is_read && onMarkRead && (
            <Button small variant="ghost" onClick={() => onMarkRead(notification.id)}>✓</Button>
          )}
        </div>
      </div>
    </Card>
  );
}