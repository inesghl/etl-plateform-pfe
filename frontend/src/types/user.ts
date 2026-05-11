// src/types/user.ts
export interface User {
  id: number;
  username: string;
  email: string;
  role: "admin" | "user";
  is_admin: boolean;
  first_name: string;
  last_name: string;
  is_active: boolean;
  date_joined: string;
  last_login: string | null;
}