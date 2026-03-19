import React from "react";
import { LoginForm } from "../components/LoginForm";

type Props = { onLogin: (username: string, password: string) => Promise<void>; error?: string | null };

export function LoginPage({ onLogin, error }: Props) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8fafc",
        color: "#0f172a"
      }}
    >
      <LoginForm onLogin={onLogin} error={error} />
    </div>
  );
}