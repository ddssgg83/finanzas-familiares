// src/components/AppHeader.tsx
"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  activeTab?: "dashboard" | "gastos" | "patrimonio" | "aprende" | "familia";
  userEmail?: string | null;
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
  // 👇 IMPORTANTE: Familia manda al home de familia, no directo al dashboard
  { key: "familia", label: "Familia", href: "/familia" },
];

function pathToTab(pathname: string): AppHeaderProps["activeTab"] {
  if (pathname.startsWith("/gastos")) return "gastos";
  if (pathname.startsWith("/patrimonio")) return "patrimonio";
  if (pathname.startsWith("/aprende")) return "aprende";
  if (pathname.startsWith("/familia")) return "familia";
  return "dashboard";
}

export function AppHeader({
  title,
  subtitle,
  activeTab,
  userEmail,
  onSignOut,
}: AppHeaderProps) {
  const pathname = usePathname() || "/";
  const derivedTab = pathToTab(pathname);
  const currentTab = activeTab ?? derivedTab;

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
