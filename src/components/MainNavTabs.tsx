"use client";

import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

export type TabId = "dashboard" | "gastos" | "patrimonio" | "aprende" | "familia";

type Props = {
  active: TabId;
  className?: string;
} & ComponentPropsWithoutRef<"nav">;

const basePill =
  "rounded-full px-3 py-1 text-[11px] transition border";

const inactiveDefault =
  "border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";

const activeDefault =
  "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900";

const inactiveAprende =
  "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200";

const activeAprende =
  "border-amber-500 bg-amber-500 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-slate-900";

export function MainNavTabs({ active, className = "", ...rest }: Props) {
  return (
    <nav
      className={`flex flex-wrap gap-2 text-[11px] ${className}`}
      {...rest}
    >
      {/* Dashboard */}
      {active === "dashboard" ? (
        <span className={`${basePill} ${activeDefault}`}>Dashboard</span>
      ) : (
        <Link
          href="/"
          className={`${basePill} ${inactiveDefault}`}
        >
          Dashboard
        </Link>
      )}

      {/* Gastos */}
      {active === "gastos" ? (
        <span className={`${basePill} ${activeDefault}`}>
          Gastos e ingresos
        </span>
      ) : (
        <Link
          href="/gastos"
          className={`${basePill} ${inactiveDefault}`}
        >
          Gastos e ingresos
        </Link>
      )}

      {/* Patrimonio */}
      {active === "patrimonio" ? (
        <span className={`${basePill} ${activeDefault}`}>
          Patrimonio
        </span>
      ) : (
        <Link
          href="/patrimonio"
          className={`${basePill} ${inactiveDefault}`}
        >
          Patrimonio
        </Link>
      )}

      {/* Aprende */}
      {active === "aprende" ? (
        <span className={`${basePill} ${activeAprende}`}>
          Aprende finanzas
        </span>
      ) : (
        <Link
          href="/aprende"
          className={`${basePill} ${inactiveAprende}`}
        >
          Aprende finanzas
        </Link>
      )}

      {/* Familia */}
      {active === "familia" ? (
        <span className={`${basePill} ${activeDefault}`}>
          Familia
        </span>
      ) : (
        <Link
          href="/familia"
          className={`${basePill} ${inactiveDefault}`}
        >
          Familia
        </Link>
      )}
    </nav>
  );
}
