"use client";

import { ReactNode } from "react";

export function PageShell({
  children,
  maxWidth = "max-w-6xl",
}: {
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <main className="flex flex-1 flex-col">
      <div className={`mx-auto w-full ${maxWidth} px-4 pb-10 pt-4 md:px-6 md:pt-6`}>
        <div className="flex flex-col gap-4">{children}</div>
      </div>
    </main>
  );
}
