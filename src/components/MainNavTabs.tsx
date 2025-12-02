"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MainNavTabs() {
  const pathname = usePathname() || "/";

  // Detectar pestaña activa según la ruta
  let active: "dashboard" | "gastos" | "patrimonio" | "familia" | "aprende" =
    "dashboard";

  if (pathname === "/") active = "dashboard";
  else if (pathname.startsWith("/gastos")) active = "gastos";
  else if (pathname.startsWith("/patrimonio")) active = "patrimonio";
  else if (pathname.startsWith("/familia")) active = "familia";
  else if (pathname.startsWith("/aprende")) active = "aprende";

  const baseLink =
    "rounded-full border border-slate-200 px-3 py-1 text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";

  const aprendeInactive =
    "rounded-full border border-amber-300 bg-amber-50 px-3 py-1 font-medium text-amber-700 transition hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200";

  const defaultActive =
    "rounded-full bg-slate-900 px-3 py-1 font-medium text-white dark:bg-slate-100 dark:text-slate-900";

  const familiaActive =
    "rounded-full bg-purple-600 px-3 py-1 font-medium text-white dark:bg-purple-400 dark:text-slate-900";

  const aprendeActive =
    "rounded-full bg-amber-500 px-3 py-1 font-medium text-white dark:bg-amber-400 dark:text-slate-900";

  return (
    <nav className="mt-2 flex flex-wrap gap-2 text-[11px]">
      {/* Dashboard */}
      {active === "dashboard" ? (
        <span className={defaultActive}>Dashboard</span>
      ) : (
        <Link href="/" className={baseLink}>
          Dashboard
        </Link>
      )}

      {/* Gastos */}
      {active === "gastos" ? (
        <span className={defaultActive}>Gastos e ingresos</span>
      ) : (
        <Link href="/gastos" className={baseLink}>
          Gastos e ingresos
        </Link>
      )}

      {/* Patrimonio */}
      {active === "patrimonio" ? (
        <span className={defaultActive}>Patrimonio</span>
      ) : (
        <Link href="/patrimonio" className={baseLink}>
          Patrimonio
        </Link>
      )}

      {/* Familia */}
      {active === "familia" ? (
        <span className={familiaActive}>Familia</span>
      ) : (
        <Link href="/familia" className={baseLink}>
          Familia
        </Link>
      )}

      {/* Aprende finanzas */}
      {active === "aprende" ? (
        <span className={aprendeActive}>Aprende finanzas</span>
      ) : (
        <Link href="/aprende" className={aprendeInactive}>
          Aprende finanzas
        </Link>
      )}
    </nav>
  );
}
