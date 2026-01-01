"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useSyncCenter } from "@/lib/syncCenter";

export function SyncBar() {
  // ✅ 1) Hooks SIEMPRE primero, sin returns antes
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ✅ 2) Usa el API real del hook (state, summary, syncNow)
  const { state, summary, syncNow } = useSyncCenter();

  const pendingTotal = summary.pendingTotal;

  const tone = useMemo(() => {
    if (!state.isOnline) return "offline";
    if (state.isSyncing) return "syncing";
    if (pendingTotal > 0) return "pending";
    return "ok";
  }, [state.isOnline, state.isSyncing, pendingTotal]);

  const label = useMemo(() => {
    if (!state.isOnline) return "Sin conexión";
    if (state.isSyncing) return "Sincronizando…";
    if (pendingTotal > 0) return `${pendingTotal} pendiente(s)`;
    return "En línea";
  }, [state.isOnline, state.isSyncing, pendingTotal]);

  // ✅ 3) Evita hydration mismatch: no renderizamos hasta mounted
  if (!mounted) return null;

  return (
    <div
      className={cn(
        "sticky top-0 z-50 border-b backdrop-blur",
        "px-3 py-2 text-[11px] md:px-6",
        tone === "offline" &&
          "border-rose-200 bg-rose-50/80 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200",
        tone === "syncing" &&
          "border-sky-200 bg-sky-50/80 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200",
        tone === "pending" &&
          "border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200",
        tone === "ok" &&
          "border-slate-200 bg-white/70 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200"
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              tone === "offline" && "bg-rose-500",
              tone === "syncing" && "bg-sky-500",
              tone === "pending" && "bg-amber-500",
              tone === "ok" && "bg-emerald-500"
            )}
          />
          <span className="font-semibold">{label}</span>

          {state.lastError && (
            <span className="hidden text-[10px] opacity-80 md:inline">
              · {state.lastError}
            </span>
          )}

          {state.lastSyncAt && tone === "ok" && (
            <span className="hidden text-[10px] opacity-80 md:inline">
              · último sync:{" "}
              {new Date(state.lastSyncAt).toLocaleTimeString("es-MX", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {summary.canSync && (
            <button
              onClick={syncNow}
              disabled={state.isSyncing}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-semibold shadow-sm transition",
                "border border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800",
                state.isSyncing && "cursor-not-allowed opacity-60"
              )}
            >
              {state.isSyncing ? "Sincronizando…" : "Sincronizar ahora"}
            </button>
          )}

          {!state.isOnline && (
            <a
              href="/offline"
              className="rounded-full px-3 py-1 text-[11px] font-semibold underline underline-offset-2"
            >
              Ayuda offline
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
