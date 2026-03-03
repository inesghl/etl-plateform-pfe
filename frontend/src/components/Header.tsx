import React from "react";

type Props = { onLogout: () => void };

export function Header({ onLogout }: Props) {
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        maxWidth: 960,
        margin: "0 auto 24px"
      }}
    >
      <div>
        <h1 style={{ fontSize: 24 }}>ETL Execution Platform</h1>
        <p style={{ fontSize: 14, color: "#64748b" }}>
          Admin: upload and manage ETLs. User: run ETLs and view outputs.
        </p>
      </div>
      <button
        onClick={onLogout}
        style={{
          padding: "6px 10px",
          borderRadius: 999,
          border: "1px solid #cbd5e1",
          background: "#ffffff",
          color: "#0f172a",
          fontSize: 13,
          cursor: "pointer"
        }}
      >
        Logout
      </button>
    </header>
  );
}
