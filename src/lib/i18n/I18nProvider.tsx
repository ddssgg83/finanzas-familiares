"use client";

import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, type Locale, isLocale, localeFromNavigator } from "./config";
import { en } from "./dictionaries/en";
import { es } from "./dictionaries/es";

const dictionaries = {
  "es-MX": es,
  "en-US": en,
} as const;

export type Dictionary = typeof es;

type I18nContextValue = {
  locale: Locale;
  dictionary: Dictionary;
  setLocale: (locale: Locale) => void;
};

export const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;

  try {
    const fromUrl = new URLSearchParams(window.location.search).get("locale");
    if (isLocale(fromUrl)) return fromUrl;
  } catch {}

  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {}

  return localeFromNavigator(window.navigator.language);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLocaleState(getInitialLocale());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {}
    document.documentElement.lang = locale === "en-US" ? "en" : "es";
  }, [locale, mounted]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      dictionary: dictionaries[locale],
      setLocale: setLocaleState,
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
