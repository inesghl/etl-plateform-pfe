export type User = {
  id: number;
  username: string;
  role: "admin" | "user";
  is_admin: boolean;
};
