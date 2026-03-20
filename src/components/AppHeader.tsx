// src/components/AppHeader.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Landmark, LogOut, RotateCw } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { getOfflineTxs, syncOfflineTxs } from "@/lib/offline";
import { SyncBadge } from "./SyncBadge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  activeTab?: "dashboard" | "gastos" | "patrimonio" | "aprende" | "familia";
  userEmail?: string | null;
  userId?: string | null;
  onSignOut?: () => void;
};

const NAV_ITEMS: {
  key: NonNullable<AppHeaderProps["activeTab"]>;
  label: string;
  href: string;
}[] = [
  { key: "dashboard", label: "Dashboard", href: "/" },
  { key: "gastos", label: "Movimientos", href: "/gastos" },
  { key: "patrimonio", label: "Patrimonio", href: "/patrimonio" },
  { key: "aprende", label: "Aprende", href: "/aprende" },
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

  useEffect(() => {
    refreshPending();
  }, [refreshPending]);

  useEffect(() => {
    if (!isOnline) return;

    let cancelled = false;

    const run = async () => {
      const count = await refreshPending();
      if (cancelled || count <= 0 || !userId) return;

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

  const onRetry = useCallback(async () => {
    if (!isOnline) return;

    const count = await refreshPending();
    if (count <= 0 || !userId) return;

    setSyncing(true);
    try {
      await syncOfflineTxs(userId);
      await refreshPending();
    } finally {
      setSyncing(false);
    }
  }, [isOnline, userId, refreshPending]);

  const statusLabel = useMemo(() => {
    if (!isOnline) return "Modo offline";
    if (syncing) return "Sincronizando";
    if (pending > 0) return "Acción pendiente";
    return "Todo al día";
  }, [isOnline, syncing, pending]);

  return (
    <header className="sticky top-0 z-40 border-b border-[hsl(var(--border)/0.66)] bg-[hsl(var(--background)/0.72)] backdrop-blur-2xl">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-4 md:px-6 md:py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[linear-gradient(145deg,#0f3f8f,#1d74d8)] text-white shadow-[0_24px_50px_-28px_rgba(14,116,217,0.9)]">
              <Landmark className="h-5 w-5" />
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="eyebrow">RINDAY</span>
                <Badge variant="secondary" className="uppercase tracking-[0.14em]">
                  Premium Base
                </Badge>
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-50">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {!isOfflineRoute && <SyncBadge pendingCount={pending} isOnline={isOnline} syncing={syncing} />}
            <Badge variant={pending > 0 ? "warning" : "success"}>{statusLabel}</Badge>

            {userEmail && (
              <div className="hidden min-w-[180px] rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--card)/0.78)] px-4 py-2 text-right shadow-[var(--shadow-soft)] sm:block">
                <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                  {userEmail}
                </div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  Sesion activa
                </div>
              </div>
            )}

            {!isOfflineRoute && (
              <button
                onClick={onRetry}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "sm:hidden")}
                title="Reintentar sincronización"
              >
                <RotateCw className="mr-2 h-3.5 w-3.5" />
                Reintentar
              </button>
            )}

            <ThemeToggle />

            {onSignOut && (
              <button onClick={onSignOut} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <LogOut className="mr-2 h-3.5 w-3.5" />
                Cerrar sesion
              </button>
            )}
          </div>
        </div>

        <nav className="overflow-x-auto">
          <div className="inline-flex min-w-full items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card)/0.8)] p-1 shadow-[var(--shadow-soft)]">
            {NAV_ITEMS.map((item) => {
              const isActive = currentTab === item.key;

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={cn(
                    "inline-flex flex-1 items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-200",
                    isActive
                      ? "bg-[hsl(var(--foreground))] text-white shadow-[0_16px_32px_-22px_rgba(15,23,42,0.86)] dark:bg-[hsl(var(--primary))] dark:text-[hsl(var(--primary-foreground))]"
                      : "text-slate-500 hover:bg-[hsl(var(--muted)/0.92)] hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </header>
  );
}
