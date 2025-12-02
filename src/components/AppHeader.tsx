"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { MainNavTabs } from "@/components/MainNavTabs";

type TabId = "dashboard" | "gastos" | "patrimonio" | "aprende" | "familia";

type AppHeaderProps = {
  title: string;
  subtitle: string;
  activeTab: TabId;
  userEmail?: string | null;
  onSignOut?: () => void;
};

export function AppHeader({
  title,
  subtitle,
  activeTab,
  userEmail,
  onSignOut,
}: AppHeaderProps) {
  return (
    <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-lg font-semibold sm:text-xl">{title}</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {subtitle}
        </p>

        <MainNavTabs active={activeTab} className="mt-2" />
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        {userEmail && (
          <span className="hidden text-[11px] text-slate-500 sm:inline">
            {userEmail}
          </span>
        )}
        {onSignOut && (
          <button
            onClick={onSignOut}
            className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cerrar sesión
          </button>
        )}
      </div>
    </header>
  );
}
