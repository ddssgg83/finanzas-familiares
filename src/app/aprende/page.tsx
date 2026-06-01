// src/app/aprende/page.tsx
"use client";

import { useEffect, useState } from "react";
import type React from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getSupabaseConfigError, prettySupabaseAuthError } from "@/lib/authErrors";
import { AppHeader } from "@/components/AppHeader";
import { PageShell } from "@/components/ui/PageShell";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/useI18n";

export const dynamic = "force-dynamic";

type AuthMode = "login" | "signup";
type AiMode = "qa" | "kid" | "plan";

const ONBOARDING_STORAGE_KEY = "ff_seen_onboarding_v1";

export default function AprendePage() {
  const router = useRouter();
  const { dictionary, locale } = useI18n();
  const t = dictionary.learn;

  // ---------- AUTH ----------
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadUser() {
      setAuthLoading(true);
      setAuthError(null);

      try {
        // ✅ OFFLINE-SAFE
        const { data } = await supabase.auth.getSession();
        const sessionUser = data.session?.user ?? null;

        if (!ignore) setUser(sessionUser);
      } catch (err) {
        if (!ignore) {
          setUser(null);
          setAuthError(t.authError);
        }
      } finally {
        if (!ignore) setAuthLoading(false);
      }
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      ignore = true;
      subscription.unsubscribe();
    };
  }, [t.authError]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const configError = getSupabaseConfigError(locale);
    if (configError) {
      setAuthError(configError);
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (error) {
        setAuthError(prettySupabaseAuthError(error.message, locale));
        return;
      }
      setAuthEmail("");
      setAuthPassword("");

      // Si no ha visto el onboarding en ESTE navegador, lo mandamos
      if (typeof window !== "undefined") {
        const seen = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
        if (seen !== "true") {
          router.push("/onboarding");
          return;
        }
      }
      // Si ya lo vio, se queda en Aprende
    } catch (err: any) {
      console.error("Error during password sign-in", err);
      setAuthError(prettySupabaseAuthError(err?.message, locale));
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const configError = getSupabaseConfigError(locale);
    if (configError) {
      setAuthError(configError);
      return;
    }

    try {
      const { error } = await supabase.auth.signUp({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (error) {
        setAuthError(prettySupabaseAuthError(error.message, locale));
        return;
      }

      // Forzamos que tenga que ver el onboarding después de registrarse
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
      }

      setAuthPassword("");
      setAuthMode("login");

      router.push("/onboarding");
    } catch (err: any) {
      console.error("Error during password sign-up", err);
      setAuthError(prettySupabaseAuthError(err?.message, locale));
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
    } catch (err) {
      console.error("Error cerrando sesión", err);
    }
  };

  // =================== ESTADOS IA ===================
  const [aiInput, setAiInput] = useState("");
  const [aiMode, setAiMode] = useState<AiMode>("qa");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);

  const handleAskAI = async () => {
    if (!aiInput.trim()) return;

    setAiLoading(true);
    setAiResponse(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setAiResponse(t.needLoginAi);
        return;
      }

      const modeForApi = aiMode === "qa" ? "qa" : aiMode === "kid" ? "explain" : "plan";

      const res = await fetch("/api/aprende-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          mode: modeForApi,
          question: aiInput.trim(),
          userId: user?.id,
          userEmail: user?.email ?? "",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("Error API IA:", data);
        setAiResponse(data?.answer || t.aiError);
      } else {
        setAiResponse(data.answer || t.aiEmpty);
      }
    } catch (err) {
      console.error("Error llamando a /api/aprende-ai:", err);
      setAiResponse(t.aiConnection);
    } finally {
      setAiLoading(false);
    }
  };

  // =================== ESTADOS ESPECIALES ===================
  if (authLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-sm text-slate-600 dark:text-slate-300">
        {t.loadingSession}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-lg font-semibold">{t.title}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t.guestBody}
          </p>

          <h2 className="text-sm font-medium">
            {authMode === "login" ? t.loginTitle : t.signupTitle}
          </h2>

          <form
            onSubmit={authMode === "login" ? handleSignIn : handleSignUp}
            className="space-y-3 text-sm"
          >
            <div>
              <label className="mb-1 block text-xs text-gray-600 dark:text-gray-300">
                {t.email}
              </label>
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                placeholder={t.emailPlaceholder}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600 dark:text-gray-300">
                {t.password}
              </label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                placeholder={t.passwordPlaceholder}
              />
            </div>

            {authError && <p className="text-xs text-red-500">{authError}</p>}

            <button
              type="submit"
              className="w-full rounded-lg bg-sky-500 py-2 text-sm font-medium text-white transition hover:bg-sky-600"
            >
              {authMode === "login" ? t.enter : dictionary.common.signup}
            </button>
          </form>

          <div className="text-center text-xs text-gray-600 dark:text-gray-300">
            {authMode === "login" ? (
              <>
                {t.noAccount}{" "}
                <button
                  className="text-sky-600 underline"
                  onClick={() => {
                    setAuthMode("signup");
                    setAuthError(null);
                  }}
                >
                  {t.createNew}
                </button>
                <span className="mx-2 text-slate-300 dark:text-slate-700">·</span>
                <Link href="/auth/reset-password" className="text-sky-600 underline">
                  {t.forgotPassword}
                </Link>
              </>
            ) : (
              <>
                {t.alreadyAccount}{" "}
                <button
                  className="text-sky-600 underline"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError(null);
                  }}
                >
                  {dictionary.common.login}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =================== CONTENIDO PRINCIPAL ===================

  const quickGuides = t.quickGuides;
  const microLessons = t.microLessons;

  const modeLabel =
    aiMode === "qa"
      ? t.modes.qa
      : aiMode === "kid"
      ? t.modes.kid
      : t.modes.plan;

  return (
    <main className="flex min-h-screen flex-col pb-16 md:pb-4">
      <AppHeader
        title={t.title}
        subtitle={t.subtitle}
        activeTab="aprende"
        userName={(user.user_metadata as { full_name?: string } | undefined)?.full_name ?? null}
        userEmail={user.email ?? ""}
        userId={user.id}
        onSignOut={handleSignOut}
      />

      {/* ✅ PageShell solo envuelve contenido */}
      <PageShell maxWidth="5xl">
        {/* HERO + intro (sin botones dobles de gastos/dashboard) */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-[11px] font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-200">
                  <span className="text-xs">🎓</span>
                  <span>{t.academy}</span>
                </div>
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {t.heroTitle}
                </h2>
                <p className="max-w-2xl text-[11px] text-slate-500 dark:text-slate-400">
                  {t.heroBody}
                </p>
              </div>
              <div className="flex flex-col items-start gap-2 text-xs md:items-end">
                <Link
                  href="/onboarding"
                  className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-medium text-sky-700 hover:bg-sky-100 dark:border-sky-700 dark:bg-slate-900 dark:text-sky-300"
                >
                  {t.seeHowItWorks}
                </Link>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  {t.alreadyKnow}{" "}
                  <Link
                    href="/gastos"
                    className="font-semibold text-sky-600 underline dark:text-sky-400"
                  >
                    {t.yourMovements}
                  </Link>
                  .
                </span>
              </div>
            </div>
          </div>

          {/* Asistente financiero con IA */}
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {t.aiTitle}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t.aiBody}
              </p>
            </div>

            <div className="mt-2 space-y-2">
              <input
                type="text"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                placeholder={t.aiPlaceholder}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />

              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="inline-flex gap-2 rounded-full bg-slate-100 p-1 text-[11px] dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setAiMode("qa")}
                    className={`rounded-full px-3 py-1 font-semibold ${
                      aiMode === "qa"
                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50"
                        : "text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    {t.modes.qa}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiMode("kid")}
                    className={`rounded-full px-3 py-1 font-semibold ${
                      aiMode === "kid"
                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50"
                        : "text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    {t.modes.kid}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiMode("plan")}
                    className={`rounded-full px-3 py-1 font-semibold ${
                      aiMode === "plan"
                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50"
                        : "text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    {t.modes.plan}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleAskAI}
                  disabled={aiLoading || !aiInput.trim()}
                  className="inline-flex items-center justify-center rounded-full bg-sky-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-sky-300 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  {aiLoading ? t.thinking : t.askAi}
                </button>
              </div>

              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                {t.tipPrefix}{" "}
                <span className="font-medium">
                  “{t.tipExample}”
                </span>
                .
              </p>
            </div>

            {aiResponse && (
              <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-[13px] leading-relaxed text-slate-800 shadow-sm dark:border-sky-900/60 dark:bg-sky-900/20 dark:text-slate-100">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-sky-800 dark:text-sky-200">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/10 text-base">
                      🤖
                    </span>
                    <span>{t.aiResponseTitle}</span>
                  </div>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-900/60 dark:text-slate-200">
                    {modeLabel}
                  </span>
                </div>
                <div className="whitespace-pre-line text-[12px] leading-snug">{aiResponse}</div>
              </div>
            )}
          </div>

          {/* Guías rápidas */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {t.quickGuidesTitle}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t.quickGuidesBody}
            </p>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {quickGuides.map((guide) => (
                <article
                  key={guide.id}
                  className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-sky-700"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-sky-50 text-lg dark:bg-sky-900/40">
                        {guide.icon}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          {guide.level}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                          {t.quickRead} · {guide.time}
                        </span>
                      </div>
                    </div>
                    <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                      {guide.title}
                    </h3>
                    <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                      {guide.text}
                    </p>
                  </div>
                  <button className="mt-3 inline-flex w-fit items-center text-[11px] font-semibold text-sky-600 hover:underline dark:text-sky-400">
                    {t.readGuide}
                  </button>
                </article>
              ))}
            </div>
          </section>

          {/* Tutoriales en video */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {t.videoTitle}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t.videoBody}
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="aspect-video w-full overflow-hidden rounded-xl bg-slate-200 dark:bg-slate-800">
                  <iframe
                    className="h-full w-full"
                    src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                    title={t.videoExampleTitle}
                    allowFullScreen
                  />
                </div>
                <h3 className="mt-2 text-sm font-semibold dark:text-slate-100">
                  {t.videoExampleTitle}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t.videoExampleBody}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <p className="text-sm text-slate-400 dark:text-slate-500">{t.comingSoon}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t.comingSoonBody}
                </p>
              </div>
            </div>
          </section>

          {/* Microlecciones + tip semanal */}
          <section className="grid gap-4 md:grid-cols-[3fr,2fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                {t.microTitle}
              </h2>
              <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
                {t.microBody}
              </p>
              <ul className="space-y-1 text-[11px] text-slate-700 dark:text-slate-300">
                {microLessons.map((item, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="mt-[3px] h-1.5 w-1.5 rounded-full bg-sky-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-[11px] shadow-sm dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-50">
              <h3 className="text-xs font-semibold text-emerald-800 dark:text-emerald-100">
                {t.weeklyTipTitle}
              </h3>
              <p className="mt-2 leading-snug">
                {t.weeklyTipOne}
              </p>
              <p className="mt-2 leading-snug">
                {t.weeklyTipTwo}
              </p>
            </div>
          </section>
        </div>
      </PageShell>
    </main>
  );
}
