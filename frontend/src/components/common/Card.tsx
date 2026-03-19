import React from "react";

type Props = {
    children: React.ReactNode,
    style?: React.CSSProperties,
    onClick?: (e: React.MouseEvent) => void
};

export function Card({children, style, onClick}: Props) {
    return (
        <div
            style={{
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: 18,
                boxShadow: "0 1px 8px rgba(15,23,42,0.05)",
                ...style,
            }}
        >
            {children}
        </div>
    );
}