"use client";

import { ReactNode } from "react";

export function Collapsible({
  open,
  onToggle,
  title,
  subtitle,
  right,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 p-4 text-left"
      >
        <div className="space-y-1">
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {title}
          </div>
          {subtitle ? (
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {subtitle}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {right ? <div className="shrink-0">{right}</div> : null}
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {open ? "Ocultar" : "Ver"}
          </span>
        </div>
      </button>

      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </section>
  );
}
