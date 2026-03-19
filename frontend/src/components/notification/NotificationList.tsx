import React from "react";
import { Notification } from "../../types/notification";
import { NotificationCard } from "./NotificationCard";
import { Empty } from "../common/Empty";

type Props = {
  notifications: Notification[];
  onMarkRead?: (id: string) => Promise<void>;
};

export function NotificationList({ notifications, onMarkRead }: Props) {
  if (notifications.length === 0) {
    return <Empty icon="🔔" text="No notifications yet." />;
  }

  const sorted = [...notifications].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div>
      {sorted.map(n => (
        <NotificationCard key={n.id} notification={n} onMarkRead={onMarkRead} />
      ))}
    </div>
  );
}