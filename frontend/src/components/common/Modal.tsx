import React from "react";
import { Card } from "./Card";

type Props = {
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: number;
};

export function Modal({ children, onClose, maxWidth = 500 }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <Card
        style={{
          width: "100%",
          maxWidth,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {children}
      </Card>
    </div>
  );
}