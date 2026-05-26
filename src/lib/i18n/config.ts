export const LOCALE_STORAGE_KEY = "rinday-locale";

export const LOCALES = ["es-MX", "en-US"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "es-MX";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function localeFromNavigator(language?: string | null): Locale {
  const clean = String(language ?? "").toLowerCase();
  if (clean.startsWith("en")) return "en-US";
  return DEFAULT_LOCALE;
}

