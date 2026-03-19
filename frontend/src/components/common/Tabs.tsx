import React from "react";

type Tab = {
  id: string;
  label: string;
  badge?: number;
};

type Props = {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
};

export function Tabs({ tabs, active, onChange }: Props) {
  return (
    <div style={{ display: "flex", gap: 2, borderBottom: "1px solid #e2e8f0", marginBottom: 22 }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            padding: "9px 16px",
            fontSize: 13,
            fontWeight: 600,
            border: "none",
            background: "transparent",
            color: active === t.id ? "#0f172a" : "#94a3b8",
            cursor: "pointer",
            borderBottom: active === t.id ? "2px solid #0f172a" : "2px solid transparent",
            marginBottom: -1,
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {t.label}
          {!!t.badge && t.badge > 0 && (
            <span
              style={{
                background: "#ef4444",
                color: "#fff",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                padding: "1px 6px",
              }}
            >
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}