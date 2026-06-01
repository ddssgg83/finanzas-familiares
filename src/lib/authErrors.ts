import { en } from "@/lib/i18n/dictionaries/en";
import { es } from "@/lib/i18n/dictionaries/es";
import type { Locale } from "@/lib/i18n/config";

function looksLikeUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function getAuthCopy(locale?: Locale | string | null) {
  return String(locale ?? "").toLowerCase().startsWith("en") ? en.authErrors : es.authErrors;
}

export function prettySupabaseAuthError(message?: string, locale?: Locale | string | null) {
  const copy = getAuthCopy(locale);
  const raw = String(message ?? "").trim();
  const msg = raw.toLowerCase();

  if (!raw) {
    return copy.generic;
  }

  if (msg.includes("invalid login credentials")) {
    return copy.invalidCredentials;
  }

  if (msg.includes("email not confirmed")) {
    return copy.emailNotConfirmed;
  }

  if (msg.includes("user already registered")) {
    return copy.alreadyRegistered;
  }

  if (msg.includes("password")) {
    return copy.password;
  }

  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("load failed")) {
    return copy.network;
  }

  if (msg.includes("offline")) {
    return copy.offline;
  }

  if (msg.includes("fetch")) {
    return copy.fetch;
  }

  return raw;
}

export function getSupabaseConfigError(locale?: Locale | string | null) {
  const copy = getAuthCopy(locale);
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

  if (!url || !anonKey) {
    return copy.missingConfig;
  }

  if (!looksLikeUrl(url)) {
    return copy.invalidConfig;
  }

  return null;
}
