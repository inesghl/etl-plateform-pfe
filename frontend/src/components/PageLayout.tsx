import React from "react";

type Props = {
  children: React.ReactNode;
};

export function PageLayout({ children }: Props) {
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "26px 16px" }}>
      {children}
    </div>
  );
}