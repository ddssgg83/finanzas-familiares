"use client";

import { useEffect, useState } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

type Props = {
  className?: string;
  onRetry?: () => void;
};

export function OfflineBanner({ className = "", onRetry }: Props) {
  const isOnline = useOnlineStatus();
  const [justCameBack, setJustCameBack] = useState(false);

  useEffect(() => {
    if (isOnline) {
      setJustCameBack(true);
      const t = setTimeout(() => setJustCameBack(false), 2500);
      return () => clearTimeout(t);
    }
  }, [isOnline]);

  if (isOnline && !justCameBack) return null;

  return (
    <div
      className={[
        "rounded-2xl border px-4 py-3 shadow-sm backdrop-blur",
        isOnline
          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100"
          : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100",
        className,
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">
            {isOnline ? "Conexión restaurada" : "Estás sin conexión"}
          </div>
          <div className="mt-0.5 text-[12px] opacity-80">
            {isOnline
              ? "Sincronizando en cuanto sea posible…"
              : "Puedes seguir usando la app. Guardamos localmente y sincronizamos al volver el internet."}
          </div>
        </div>

        {!isOnline && (
          <button
            type="button"
            onClick={() => {
              onRetry?.();
              // fuerza un “reintento” natural
              window.location.reload();
            }}
            className="shrink-0 rounded-full bg-slate-900 px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 dark:bg-white dark:text-slate-900"
          >
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}
