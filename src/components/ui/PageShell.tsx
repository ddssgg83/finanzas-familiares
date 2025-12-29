// src/components/ui/PageShell.tsx
"use client";

import * as React from "react";

type Props = {
  children: React.ReactNode;
  className?: string;
  maxWidth?: "2xl" | "3xl" | "5xl" | "6xl";
};

export function PageShell({ children, className = "", maxWidth = "6xl" }: Props) {
  const mw =
    maxWidth === "2xl"
      ? "max-w-2xl"
      : maxWidth === "3xl"
      ? "max-w-3xl"
      : maxWidth === "5xl"
      ? "max-w-5xl"
      : "max-w-6xl";

  return (
    <div className={`mx-auto w-full ${mw} px-4 pb-16 pt-4 md:px-6 ${className}`}>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
