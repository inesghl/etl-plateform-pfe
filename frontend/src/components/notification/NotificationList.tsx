import React from "react";
import { Notification } from "../../types/notification";
import { NotificationCard } from "./NotificationCard";
import { Empty } from "../common/Empty";

type Props = {
  notifications: Notification[];
  onMarkUnread?: (id: string) => Promise<void>;
  onDeleted?: (id: string) => void;
};

export function NotificationList({ notifications, onMarkUnread, onDeleted }: Props) {
  if (notifications.length === 0) {
    return <Empty icon="🔔" text="No notifications yet." />;
  }

  const sorted = [...notifications].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div>
      {sorted.map(n => (
        <NotificationCard
          key={n.id}
          notification={n}
          onMarkUnread={onMarkUnread}
          onDeleted={onDeleted}
        />
      ))}
    </div>
  );
}