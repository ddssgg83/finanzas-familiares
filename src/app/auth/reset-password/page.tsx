"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim() ||
  (typeof window !== "undefined" ? window.location.origin : "");

function getResetRedirectUrl() {
  const base = SITE_URL || "https://rinday.app";
  const next = "/auth/update-password";
  return `${base}/auth/callback?next=${encodeURIComponent(next)}`;
}

function prettyResetError(message?: string) {
  const msg = String(message ?? "").toLowerCase();

  if (msg.includes("rate") && msg.includes("limit")) {
    return "Se alcanzó el límite de correos. Intenta de nuevo en unos minutos.";
  }
  if (msg.includes("invalid") && msg.includes("email")) {
    return "Ingresa un correo válido.";
  }
  return message || "No pudimos enviar el correo de recuperación. Intenta de nuevo.";
}

export default function ResetPasswordPage() {
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
      setError("Ingresa un correo válido.");
      return;
    }

    try {
      setBusy(true);
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: getResetRedirectUrl(),
      });

      if (resetError) throw resetError;

      setMessage(
        "Te enviamos un correo para restablecer tu contraseña. Abre el enlace desde este dispositivo."
      );
    } catch (err: any) {
      setError(prettyResetError(err?.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-50">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950/80 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.55)]">
        <div className="text-[10px] uppercase tracking-[0.2em] text-sky-400">RINDAY</div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Recuperar contraseña</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Escribe el correo de tu cuenta y te enviaremos un enlace seguro para crear una
          nueva contraseña.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-200">Correo</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
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
            {busy ? "Enviando..." : "Enviar enlace"}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
          <Link href="/onboarding?mode=login" className="hover:text-slate-100">
            Volver a iniciar sesión
          </Link>
          <Link href="/gastos" className="hover:text-slate-100">
            Ir a la app
          </Link>
        </div>
      </section>
    </main>
  );
}
