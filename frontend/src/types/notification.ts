export type NotificationLevel = "info" | "warning" | "error" | "success";

export type Notification = {
  id: string;
  level: NotificationLevel;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  user?: number;
  etl?: string;
  execution?: string;
};