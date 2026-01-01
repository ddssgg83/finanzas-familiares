// src/components/AppHeader.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { getOfflineTxs, syncOfflineTxs } from "@/lib/offline";

// Si ya tienes estos componentes, perfecto.
// Si aún no, puedes comentar estas 2 líneas y usar solo el texto/badge simple.
import { SyncBadge } from "./SyncBadge";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  activeTab?: "dashboard" | "gastos" | "patrimonio" | "aprende" | "familia";
  userEmail?: string | null;
  userId?: string | null; // ✅ necesario para offline scope + sync
  onSignOut?: () => void;
};

const NAV_ITEMS: {
  key: NonNullable<AppHeaderProps["activeTab"]>;
  label: string;
  href: string;
}[] = [
  { key: "dashboard", label: "Dashboard", href: "/" },
  { key: "gastos", label: "Gastos e ingresos", href: "/gastos" },
  { key: "patrimonio", label: "Patrimonio", href: "/patrimonio" },
  { key: "aprende", label: "Aprende finanzas", href: "/aprende" },
  { key: "familia", label: "Familia", href: "/familia" },
];

function pathToTab(pathname: string): AppHeaderProps["activeTab"] {
  if (pathname.startsWith("/gastos")) return "gastos";
  if (pathname.startsWith("/patrimonio")) return "patrimonio";
  if (pathname.startsWith("/aprende")) return "aprende";
  if (pathname.startsWith("/familia")) return "familia";
  return "dashboard";
}

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return isOnline;
}

export function AppHeader({
  title,
  subtitle,
  activeTab,
  userEmail,
  userId,
  onSignOut,
}: AppHeaderProps) {
  const pathname = usePathname() || "/";
  const derivedTab = pathToTab(pathname);
  const currentTab = activeTab ?? derivedTab;

  const isOnline = useOnlineStatus();
  const isOfflineRoute = pathname.startsWith("/offline");

  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // ✅ FIX: getOfflineTxs ahora requiere userId (scope)
  const refreshPending = useCallback(async () => {
    try {
      if (!userId) {
        setPending(0);
        return 0;
      }
      const txs = await getOfflineTxs(userId);
      const count = txs?.length ?? 0;
      setPending(count);
      return count;
    } catch {
      setPending(0);
      return 0;
    }
  }, [userId]);

  // Cargar pendientes al montar / cuando cambie userId
  useEffect(() => {
    refreshPending();
  }, [refreshPending]);

  // Cuando vuelve internet: refresca conteo y si hay pendientes, sincroniza
  useEffect(() => {
    if (!isOnline) return;

    let cancelled = false;

    const run = async () => {
      // Siempre refresca conteo al volver online
      const count = await refreshPending();
      if (cancelled) return;

      // Si no hay pendientes, listo
      if (count <= 0) return;

      // Si no tenemos userId, no podemos sincronizar
      if (!userId) return;

      setSyncing(true);
      try {
        await syncOfflineTxs(userId);
        await refreshPending();
      } finally {
        if (!cancelled) setSyncing(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [isOnline, userId, refreshPending]);

  // Pequeño “retry” (si el usuario presiona)
  const onRetry = useCallback(async () => {
    if (!isOnline) return;

    const count = await refreshPending();
    if (count <= 0) return;
    if (!userId) return;

    setSyncing(true);
    try {
      await syncOfflineTxs(userId);
      await refreshPending();
    } finally {
      setSyncing(false);
    }
  }, [isOnline, userId, refreshPending]);

  // Texto de estado (fallback si no quieres SyncBadge)
  const statusText = useMemo(() => {
    if (!isOnline) return "Sin conexión";
    if (syncing) return "Sincronizando…";
    if (pending > 0) return `Pendientes: ${pending}`;
    return "Sincronizado";
  }, [isOnline, syncing, pending]);

  return (
    <header className="border-b border-slate-200 bg-slate-50/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6 lg:px-8">
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            {title}
          </span>
          {subtitle && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {subtitle}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* ✅ Badge en header (solo si NO estás en /offline) */}
          {!isOfflineRoute && (
            <div className="hidden sm:block">
              <SyncBadge pendingCount={pending} isOnline={isOnline} syncing={syncing} />
              {/* Fallback sin SyncBadge:
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                {statusText}
              </span>
              */}
            </div>
          )}

          {userEmail && (
            <div className="hidden text-right text-xs text-slate-500 dark:text-slate-400 sm:block">
              <div className="font-medium text-slate-800 dark:text-slate-100">
                {userEmail}
              </div>
              <div className="text-[11px]">Sesión activa</div>
            </div>
          )}

          <ThemeToggle />
        </div>
      </div>

      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 pb-3 md:px-6 lg:px-8">
        <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          {NAV_ITEMS.map((item) => {
            const isActive = currentTab === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`rounded-full px-3 py-1.5 transition ${
                  isActive
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-50"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* ✅ Badge en mobile + botón retry (solo si NO estás en /offline) */}
        {!isOfflineRoute && (
          <div className="flex items-center gap-2 sm:hidden">
            <SyncBadge pendingCount={pending} isOnline={isOnline} syncing={syncing} />
            <button
              onClick={onRetry}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              title="Reintentar sincronización"
            >
              Reintentar
            </button>
          </div>
        )}

        {onSignOut && (
          <button
            onClick={onSignOut}
            className="hidden rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:inline-flex"
          >
            Cerrar sesión
          </button>
        )}
      </nav>
    </header>
  );
}
