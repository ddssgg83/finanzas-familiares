"use client";

import { ReactNode } from "react";

export function SectionCard({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={[
        "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm",
        "dark:border-slate-800 dark:bg-slate-900",
        className,
      ].join(" ")}
    >
      {(title || subtitle || right) && (
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            {title ? (
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {title}
              </h2>
            ) : null}
            {subtitle ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            ) : null}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      )}

      {children}
    </section>
  );
}
