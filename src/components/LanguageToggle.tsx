"use client";

import { useI18n } from "@/lib/i18n/useI18n";
import { cn } from "@/lib/utils";

type LanguageToggleProps = {
  compact?: boolean;
  className?: string;
};

export function LanguageToggle({ compact = false, className }: LanguageToggleProps) {
  const { locale, setLocale, dictionary } = useI18n();
  const isSpanish = locale === "es-MX";

  return (
    <div
      className={cn(
        "inline-flex rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card)/0.82)] p-1 shadow-[var(--shadow-soft)]",
        className
      )}
      aria-label={dictionary.common.language}
    >
      <button
        type="button"
        onClick={() => setLocale("es-MX")}
        aria-label="Español"
        aria-pressed={isSpanish}
        className={cn(
          "tap-feedback rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
          compact && "px-2.5",
          isSpanish
            ? "bg-[hsl(var(--foreground))] text-white dark:bg-[hsl(var(--primary))] dark:text-[hsl(var(--primary-foreground))]"
            : "text-slate-500 hover:bg-[hsl(var(--muted)/0.78)] dark:text-slate-400"
        )}
      >
        <span aria-hidden="true">🇲🇽</span> ES
      </button>
      <button
        type="button"
        onClick={() => setLocale("en-US")}
        aria-label="English"
        aria-pressed={!isSpanish}
        className={cn(
          "tap-feedback rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
          compact && "px-2.5",
          !isSpanish
            ? "bg-[hsl(var(--foreground))] text-white dark:bg-[hsl(var(--primary))] dark:text-[hsl(var(--primary-foreground))]"
            : "text-slate-500 hover:bg-[hsl(var(--muted)/0.78)] dark:text-slate-400"
        )}
      >
        <span aria-hidden="true">🇺🇸</span> EN
      </button>
    </div>
  );
}

