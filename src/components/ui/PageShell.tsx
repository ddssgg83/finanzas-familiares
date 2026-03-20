// src/components/ui/PageShell.tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

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
    <div className={cn("shell-section mx-auto w-full px-4 pb-20 pt-6 md:px-6 md:pt-8", mw, className)}>
      <div className="space-y-6 md:space-y-8">{children}</div>
    </div>
  );
}
