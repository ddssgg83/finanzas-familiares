"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  pendingCount: number;
  isOnline: boolean;
  syncing: boolean;
  className?: string;
};

export function SyncBadge({ pendingCount, isOnline, syncing, className }: Props) {
  // ✅ evita hydration mismatch: SSR y primer paint del cliente quedan iguales
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const view = useMemo(() => {
    // 🟦 Estado neutro antes de montar (igual en SSR y CSR)
    if (!mounted) {
      return {
        label: "Sincronizado",
        title: "Sincronizado",
        dot: "bg-emerald-500",
        tone:
          "border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200",
      };
    }

    if (!isOnline) {
      return {
        label: "Sin conexión",
        title: "Sin conexión",
        dot: "bg-amber-500",
        tone:
          "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200",
      };
    }

    if (syncing) {
      return {
        label: "Sincronizando…",
        title: "Sincronizando…",
        dot: "bg-sky-500",
        tone:
          "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200",
      };
    }

    if (pendingCount > 0) {
      return {
        label: `${pendingCount} pendiente(s)`,
        title: `${pendingCount} pendiente(s)`,
        dot: "bg-amber-500",
        tone:
          "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200",
      };
    }

    return {
      label: "Sincronizado",
      title: "Sincronizado",
      dot: "bg-emerald-500",
      tone:
        "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200",
    };
  }, [mounted, isOnline, syncing, pendingCount]);

  return (
    <span
      aria-live="polite"
      title={view.title}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold",
        view.tone,
        className
      )}
      suppressHydrationWarning
    >
      <span className={cn("h-2 w-2 rounded-full", view.dot)} />
      {view.label}
    </span>
  );
}
