import React from "react";
import { User } from "../../types/user";
import { Badge } from "./Bagde";
import { Button } from "./Button";

type Props = {
  currentUser: User;
  onLogout: () => void;
};

export function Header({ currentUser, onLogout }: Props) {
  return (
    <div
      style={{
        background: "#fff",
        borderBottom: "1px solid #e2e8f0",
        padding: "0 20px",
        position: "sticky",
        top: 0,
        zIndex: 50,
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          height: 54,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: "#0f172a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
            }}
          >
            ⚡
          </div>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>
            ETL Platform
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "#64748b" }}>
            <strong style={{ color: "#0f172a" }}>{currentUser.username}</strong>
            {" · "}
            <Badge
              label={currentUser.is_admin ? "admin" : "user"}
              color={currentUser.is_admin ? "#7c3aed" : "#2563eb"}
            />
          </span>
          <Button small variant="ghost" onClick={onLogout}>
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
}