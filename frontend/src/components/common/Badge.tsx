import React from "react";

type Props = {
  label: string;
  color?: string;
};

export function Badge({ label, color = "#64748b" }: Props) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 9px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.05em",
        background: `${color}18`,
        color,
        border: `1px solid ${color}30`,
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}