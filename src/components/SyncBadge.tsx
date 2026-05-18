"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  pendingCount: number;
  pendingDetails?: {
    gastos?: number;
    patrimonio?: number;
    familia?: number;
  };
  isOnline: boolean;
  syncing: boolean;
  className?: string;
};

export function SyncBadge({ pendingCount, pendingDetails, isOnline, syncing, className }: Props) {
  // ✅ evita hydration mismatch: SSR y primer paint del cliente quedan iguales
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const pendingTitle = useMemo(() => {
    const details = [
      pendingDetails?.gastos ? `Gastos: ${pendingDetails.gastos}` : null,
      pendingDetails?.patrimonio ? `Patrimonio: ${pendingDetails.patrimonio}` : null,
      pendingDetails?.familia ? `Familia: ${pendingDetails.familia}` : null,
    ].filter(Boolean);

    return details.length ? details.join(" · ") : "Sin cambios pendientes";
  }, [pendingDetails?.familia, pendingDetails?.gastos, pendingDetails?.patrimonio]);

  const view = useMemo(() => {
    if (!mounted) {
      return {
        label: "Todo al dia",
        title: "Todo al dia",
        dot: "bg-emerald-500",
        tone:
          "border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200",
      };
    }

    if (!isOnline) {
      return {
        label: pendingCount > 0 ? `${pendingCount} pendiente${pendingCount === 1 ? "" : "s"}` : "Sin conexion",
        title: pendingCount > 0 ? `Sin conexion · ${pendingTitle}` : "Sin conexion",
        dot: "bg-amber-500",
        tone:
          "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200",
      };
    }

    if (syncing) {
      return {
        label: "Sincronizando",
        title: "Sincronizando",
        dot: "bg-sky-500",
        tone:
          "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200",
      };
    }

    if (pendingCount > 0) {
      return {
        label: `${pendingCount} cambio${pendingCount === 1 ? "" : "s"} pendiente${pendingCount === 1 ? "" : "s"}`,
        title: pendingTitle,
        dot: "bg-amber-500",
        tone:
          "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200",
      };
    }

    return {
      label: "Todo al dia",
      title: "Todo al dia",
      dot: "bg-emerald-500",
      tone:
        "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200",
    };
  }, [mounted, isOnline, syncing, pendingCount, pendingTitle]);

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
