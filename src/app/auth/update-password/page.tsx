"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/useI18n";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function prettyUpdateError(message: string | undefined, copy: ReturnType<typeof useI18n>["dictionary"]["updatePassword"]["errors"]) {
  const msg = String(message ?? "").toLowerCase();

  if (msg.includes("password")) {
    return copy.password;
  }
  if (msg.includes("session") || msg.includes("jwt")) {
    return copy.session;
  }
  return message || copy.generic;
}

export default function UpdatePasswordPage() {
  const router = useRouter();
  const { dictionary } = useI18n();
  const t = dictionary.updatePassword;
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const loadSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;
        setHasSession(Boolean(data.session));
      } catch {
        if (!alive) return;
        setHasSession(false);
      } finally {
        if (alive) setCheckingSession(false);
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
      setCheckingSession(false);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (password.length < 6) {
      setError(t.errors.minLength);
      return;
    }
    if (password !== confirmPassword) {
      setError(t.errors.mismatch);
      return;
    }

    try {
      setBusy(true);
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      setMessage(t.success);
      window.setTimeout(() => router.replace("/gastos"), 900);
    } catch (err: any) {
      setError(prettyUpdateError(err?.message, t.errors));
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

        {checkingSession ? (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
            {t.checking}
          </div>
        ) : !hasSession ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-amber-900/70 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
              {t.noSession}
            </div>
            <Link
              href="/auth/reset-password"
              className="inline-flex w-full justify-center rounded-2xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-600"
            >
              {t.requestNewLink}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-200">
                {t.newPassword}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.newPasswordPlaceholder}
                autoComplete="new-password"
                disabled={busy}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-sky-300/30 disabled:opacity-70"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-200">
                {t.confirmPassword}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t.confirmPasswordPlaceholder}
                autoComplete="new-password"
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
              {busy ? t.updating : t.update}
            </button>
          </form>
        )}

        <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
          <Link href="/auth/reset-password" className="hover:text-slate-100">
            {t.requestAnotherLink}
          </Link>
          <Link href="/gastos" className="hover:text-slate-100">
            {t.goApp}
          </Link>
        </div>
      </section>
    </main>
  );
}
