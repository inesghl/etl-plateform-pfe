// types/notification.ts
export type NotificationType = "success" | "error" | "info" | "warning";

export type Notification = {
  id: string;
  title: string;
  message: string;
  notification_type: NotificationType;
  is_read: boolean;
  created_at: string;
  execution_id?: string | null;
};