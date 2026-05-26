"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Landmark, UsersRound, WalletCards } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Inicio", icon: Home, match: (path: string) => path === "/" },
  { href: "/gastos", label: "Movs", icon: WalletCards, match: (path: string) => path.startsWith("/gastos") },
  {
    href: "/patrimonio",
    label: "Patrimonio",
    icon: Landmark,
    protected: true,
    match: (path: string) => path.startsWith("/patrimonio"),
  },
  {
    href: "/familia",
    label: "Familia",
    icon: UsersRound,
    protected: true,
    match: (path: string) => path.startsWith("/familia"),
  },
];

type MobileBottomNavProps = {
  isAuthenticated?: boolean;
};

function authHref(next: string) {
  return `/onboarding?mode=login&next=${encodeURIComponent(next)}`;
}

export function MobileBottomNav({ isAuthenticated = false }: MobileBottomNavProps) {
  const pathname = usePathname() || "/";

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[hsl(var(--border)/0.72)] bg-[hsl(var(--background)/0.82)] px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-[0_-18px_50px_-34px_rgba(15,23,42,0.55)] backdrop-blur-2xl md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1 rounded-[24px] border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--card)/0.72)] p-1 shadow-[inset_0_1px_0_hsl(var(--card)/0.8)]">
        {NAV_ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          const href = item.protected && !isAuthenticated ? authHref(item.href) : item.href;

          return (
            <Link
              key={item.href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "tap-feedback relative flex min-h-12 flex-col items-center justify-center gap-1 overflow-hidden rounded-[20px] px-2 py-2 text-[10px] font-semibold transition-all duration-200 motion-reduce:transition-none active:scale-[0.98]",
                active
                  ? "bg-[hsl(var(--foreground))] text-white shadow-[0_14px_30px_-22px_rgba(15,23,42,0.82)] before:absolute before:inset-x-4 before:top-1 before:h-px before:bg-white/35 dark:bg-[hsl(var(--primary))] dark:text-[hsl(var(--primary-foreground))]"
                  : "text-slate-500 hover:bg-[hsl(var(--muted)/0.66)] active:bg-[hsl(var(--muted)/0.9)] dark:text-slate-400"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
