"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useI18n } from "@/lib/i18n/useI18n";

export const dynamic = "force-dynamic";

const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim() ||
  (typeof window !== "undefined" ? window.location.origin : "");

function getResetRedirectUrl(locale: string) {
  const base = SITE_URL || "https://rinday.app";
  const next = "/auth/update-password";
  return `${base}/auth/callback?next=${encodeURIComponent(next)}&locale=${encodeURIComponent(locale)}`;
}

function prettyResetError(message: string | undefined, copy: ReturnType<typeof useI18n>["dictionary"]["resetPassword"]["errors"]) {
  const msg = String(message ?? "").toLowerCase();

  if (msg.includes("rate") && msg.includes("limit")) {
    return copy.rateLimit;
  }
  if (msg.includes("invalid") && msg.includes("email")) {
    return copy.invalidEmail;
  }
  return message || copy.generic;
}

export default function ResetPasswordPage() {
  const { dictionary, locale } = useI18n();
  const t = dictionary.resetPassword;
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError(t.errors.invalidEmail);
      return;
    }

    try {
      setBusy(true);
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: getResetRedirectUrl(locale),
      });

      if (resetError) throw resetError;

      setMessage(t.success);
    } catch (err: any) {
      setError(prettyResetError(err?.message, t.errors));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-50">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950/80 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.55)]">
        <div className="text-[10px] uppercase tracking-[0.2em] text-sky-400">RINDAY</div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          {t.body}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-200">{t.email}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.emailPlaceholder}
              autoComplete="email"
              disabled={busy}
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-sky-300/30 disabled:opacity-70"
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-900/70 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-2xl border border-emerald-900/70 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-2xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {busy ? t.sending : t.send}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
          <Link href="/onboarding?mode=login" className="hover:text-slate-100">
            {t.backLogin}
          </Link>
          <Link href="/gastos" className="hover:text-slate-100">
            {t.goApp}
          </Link>
        </div>
      </section>
    </main>
  );
}
