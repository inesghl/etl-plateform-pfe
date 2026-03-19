import React from "react";

type Props = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password" | "email";
  placeholder?: string;
  required?: boolean;
  style?: React.CSSProperties;
};

export function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  style,
}: Props) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block" }}>
          {label}
          {required && <span style={{ color: "#ef4444" }}> *</span>}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{
          width: "100%",
          padding: "7px 10px",
          borderRadius: 8,
          border: "1px solid #e2e8f0",
          background: "#f8fafc",
          color: "#0f172a",
          fontSize: 13,
          marginTop: label ? 5 : 0,
          boxSizing: "border-box",
          ...style,
        }}
      />
    </div>
  );
}