import React from "react";

type Props = {
  icon: string;
  text: string;
};

export function Empty({ icon, text }: Props) {
  return (
    <div style={{ textAlign: "center", padding: "28px 0", color: "#94a3b8" }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 13 }}>{text}</div>
    </div>
  );
}