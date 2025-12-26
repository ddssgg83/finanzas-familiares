// src/components/ui/PageShell.tsx
"use client";

import * as React from "react";

type Props = {
  children: React.ReactNode;
  className?: string;
};

export function PageShell({ children, className = "" }: Props) {
  return (
    <div className={`mx-auto w-full max-w-6xl px-4 pb-16 pt-4 md:px-6 ${className}`}>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
