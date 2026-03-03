import React, { useState } from "react";

type Props = {
  onLogin: (username: string, password: string) => Promise<void>;
  error?: string | null;
};

export function LoginForm({ onLogin, error }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(username, password);
    setUsername("");
    setPassword("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        width: "100%",
        maxWidth: 380,
        padding: 24,
        borderRadius: 12,
        background: "#ffffff",
        boxShadow: "0 20px 40px rgba(15,23,42,0.12)",
        border: "1px solid #e2e8f0"
      }}
    >
      <h1 style={{ marginBottom: 8, fontSize: 24 }}>ETL Platform</h1>
      <p style={{ marginBottom: 24, fontSize: 14, color: "#64748b" }}>
        Sign in to manage and run ETLs.
      </p>
      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: 8,
            borderRadius: 8,
            background: "#fee2e2",
            color: "#b91c1c",
            fontSize: 13
          }}
        >
          {error}
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
          Username
        </label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            background: "#f8fafc",
            color: "#0f172a"
          }}
          required
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            background: "#f8fafc",
            color: "#0f172a"
          }}
          required
        />
      </div>
      <button
        type="submit"
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 8,
          border: "none",
          background: "#0f172a",
          color: "white",
          fontWeight: 600,
          cursor: "pointer"
        }}
      >
        Sign in
      </button>
    </form>
  );
}
