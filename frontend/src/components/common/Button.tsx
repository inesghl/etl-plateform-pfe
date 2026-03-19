import React from "react";

type Props = {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "success" | "ghost";
  disabled?: boolean;
  small?: boolean;
  style?: React.CSSProperties;
  type?: "button" | "submit";
};

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  small,
  style,
  type = "button",
}: Props) {
  const variants = {
    primary: ["#0f172a", "#fff", "#0f172a"],
    secondary: ["#f1f5f9", "#0f172a", "#e2e8f0"],
    danger: ["#fee2e2", "#b91c1c", "#fca5a5"],
    success: ["#dcfce7", "#15803d", "#86efac"],
    ghost: ["transparent", "#64748b", "#e2e8f0"],
  };

  const [bg, color, border] = variants[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? "4px 11px" : "8px 16px",
        borderRadius: 8,
        border: `1px solid ${border}`,
        background: bg,
        color,
        fontWeight: 600,
        fontSize: small ? 12 : 13,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </button>
  );
}