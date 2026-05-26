"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useI18n } from "@/lib/i18n/useI18n";

type StepId = "overview" | "patrimonio" | "familia";

type Step = {
  id: StepId;
  accent: string;
};

const STEPS: Step[] = [
  {
    id: "overview",
    accent: "from-sky-500/20 via-emerald-400/10 to-transparent",
  },
  {
    id: "patrimonio",
    accent: "from-violet-500/20 via-sky-400/10 to-transparent",
  },
  {
    id: "familia",
    accent: "from-amber-400/25 via-rose-400/10 to-transparent",
  },
];

const ONBOARDING_STORAGE_KEY = "ff_seen_onboarding_v1";
const ONBOARDING_NEXT_KEY = "rinday_onboarding_next";

// ✅ Pon esto en Vercel: NEXT_PUBLIC_SITE_URL=https://rinday.app
const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim() ||
  (typeof window !== "undefined" ? window.location.origin : "");

function markSeenOnboarding() {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    }
  } catch {}
}

function safeInternalNext(raw: string | null) {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;

  // Solo permitimos rutas internas para evitar open-redirect
  if (v.startsWith("/")) return v;

  // Si viene URL absoluta, solo permitir tu dominio
  try {
    const u = new URL(v);
    if (u.hostname === "rinday.app") return u.pathname + u.search + u.hash;
  } catch {}

  return null;
}

function prettyAuthError(msg?: string) {
  const m = (msg ?? "").toLowerCase();

  if (m.includes("rate") && m.includes("limit")) {
    return "RATE_LIMIT";
  }
  if (m.includes("invalid") && m.includes("email")) {
    return "INVALID_EMAIL";
  }
  return msg ?? "MAGIC_LINK_ERROR";
}

export default function OnboardingClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const { dictionary } = useI18n();

  const modeParam = (sp.get("mode") ?? "").toLowerCase(); // login | signup
  const emailParam = (sp.get("email") ?? "").trim();
  const nextParam = safeInternalNext(sp.get("next"));

  // ✅ Si viene modo auth, no mostramos el tour
  const isInviteFlow =
    modeParam === "login" || modeParam === "signup" || !!nextParam || !!emailParam;

  // ====== AUTH STATE ======
  const [authMode, setAuthMode] = useState<"login" | "signup">(
    modeParam === "signup" ? "signup" : "login"
  );
  const [email, setEmail] = useState(emailParam);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const [authSent, setAuthSent] = useState(false);

  // cooldown para reenviar (evita spam / rate-limit)
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<number | null>(null);

  const next = useMemo(() => {
    if (nextParam) return nextParam;

    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(ONBOARDING_NEXT_KEY);
        return safeInternalNext(saved);
      } catch {}
    }
    return null;
  }, [nextParam]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (nextParam) {
      try {
        window.localStorage.setItem(ONBOARDING_NEXT_KEY, nextParam);
      } catch {}
    }
  }, [nextParam]);

  // Si ya hay sesión y venimos con next → redirigir directo
  useEffect(() => {
    if (!isInviteFlow) return;

    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const u = data.session?.user ?? null;

      if (!alive) return;
      if (u) {
        const target = next || "/familia";
        router.replace(target);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isInviteFlow, next, router]);

  useEffect(() => {
    // cleanup cooldown interval
    return () => {
      if (cooldownRef.current) window.clearInterval(cooldownRef.current);
    };
  }, []);

  const startCooldown = (seconds: number) => {
    setCooldown(seconds);
    if (cooldownRef.current) window.clearInterval(cooldownRef.current);
    cooldownRef.current = window.setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          if (cooldownRef.current) window.clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const sendMagicLink = async () => {
    setAuthBusy(true);
    setAuthMsg(null);
    setAuthSent(false);

    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes("@")) {
        setAuthMsg(dictionary.onboarding.invalidEmail);
        return;
      }

      // ✅ Redirect FIJO a tu dominio (evita localhost/preview)
      // ✅ FIX REAL: SIEMPRE pasar por /auth/callback
      // (Supabase necesita exchangeCodeForSession)
      const base = SITE_URL || "https://rinday.app";
      const nextSafe = next || "/familia";
      const redirectTo = `${base}/auth/callback?next=${encodeURIComponent(nextSafe)}`;

      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: authMode === "signup",
        },
      });

      if (error) throw error;

      setAuthSent(true);
      startCooldown(20);

      setAuthMsg(
        dictionary.onboarding.magicLinkSent
      );
    } catch (e: any) {
      const code = prettyAuthError(e?.message);
      setAuthMsg(
        code === "RATE_LIMIT"
          ? dictionary.onboarding.rateLimit
          : code === "INVALID_EMAIL"
          ? dictionary.onboarding.invalidEmail
          : code === "MAGIC_LINK_ERROR"
          ? dictionary.onboarding.magicLinkError
          : code
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const clearNextAndGoApp = () => {
    try {
      window.localStorage.removeItem(ONBOARDING_NEXT_KEY);
    } catch {}
    router.replace("/gastos");
  };

  // ====== TOUR STATE ======
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const totalSteps = STEPS.length;
  const currentStep = STEPS[currentStepIndex];
  const currentStepCopy = dictionary.onboarding.slides[currentStepIndex];
  const isLastStep = currentStepIndex === totalSteps - 1;

  const progressPercent = useMemo(
    () => ((currentStepIndex + 1) / totalSteps) * 100,
    [currentStepIndex, totalSteps]
  );

  const finishOnboarding = () => {
    markSeenOnboarding();
    const target = next || "/gastos";
    router.replace(target);
  };

  const handleNext = () => {
    if (isLastStep) finishOnboarding();
    else setCurrentStepIndex((prev) => Math.min(prev + 1, totalSteps - 1));
  };

  const handlePrev = () => setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  const handleSkip = () => finishOnboarding();

  useEffect(() => {
    if (isInviteFlow) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      if (key === "escape") {
        e.preventDefault();
        finishOnboarding();
        return;
      }
      if (key === "enter") {
        e.preventDefault();
        handleNext();
        return;
      }
      if (key === "arrowleft") {
        e.preventDefault();
        handlePrev();
        return;
      }
      if (key === "arrowright") {
        e.preventDefault();
        handleNext();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStepIndex, isLastStep, isInviteFlow]);

  // =========================
  // ✅ RENDER: INVITE/AUTH FLOW
  // =========================
  if (isInviteFlow) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-50">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="absolute -right-32 top-10 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl" />
          <div className="absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl" />
        </div>

        <main className="relative z-10 w-full max-w-md">
          <div className="mb-3 flex justify-end">
            <LanguageToggle compact className="border-slate-800 bg-slate-950/70 [&_button]:text-slate-300" />
          </div>

          <div className="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.65)] backdrop-blur-xl">
            <div className="text-[10px] uppercase tracking-[0.2em] text-sky-400">
              RINDAY
            </div>

            <h1 className="mt-2 text-xl font-semibold tracking-tight">
              {authMode === "signup" ? dictionary.common.signup : dictionary.common.login}
            </h1>

            <p className="mt-1 text-[12px] leading-relaxed text-slate-300">
              {dictionary.onboarding.authSubtitle}
            </p>

            <div className="mt-4 space-y-2">
              <label className="block text-[12px] font-semibold text-slate-200">
                {dictionary.onboarding.email}
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-slate-700/70 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-sky-300/30"
                placeholder={dictionary.onboarding.emailPlaceholder}
                autoComplete="email"
                disabled={authBusy}
              />
            </div>

            {authMsg ? (
              <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-[12px] text-slate-200">
                {authMsg}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={sendMagicLink}
                disabled={authBusy || cooldown > 0}
                className="flex-1 rounded-full bg-sky-400 px-4 py-2 text-[12px] font-semibold text-slate-900 hover:bg-sky-300 disabled:opacity-60"
              >
                {authBusy
                  ? dictionary.common.loading
                  : cooldown > 0
                  ? `${dictionary.onboarding.wait} ${cooldown}s…`
                  : authMode === "signup"
                  ? dictionary.onboarding.createAndSend
                  : dictionary.onboarding.sendAccessLink}
              </button>

              <button
                onClick={() => setAuthMode((m) => (m === "login" ? "signup" : "login"))}
                disabled={authBusy}
                className="rounded-full border border-slate-700/70 px-4 py-2 text-[12px] font-semibold text-slate-200 hover:bg-slate-900/60 disabled:opacity-60"
              >
                {authMode === "login" ? dictionary.common.signup : dictionary.onboarding.alreadyHaveAccount}
              </button>
            </div>

            {authSent ? (
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {dictionary.onboarding.linkSent}
                </span>

                <button
                  onClick={sendMagicLink}
                  disabled={authBusy || cooldown > 0}
                  className="rounded-full border border-slate-800 px-3 py-1 hover:bg-slate-900/60 disabled:opacity-60"
                >
                  {dictionary.onboarding.resend}
                </button>
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-between text-[11px] text-slate-400">
                <button
                  onClick={clearNextAndGoApp}
                  className="rounded-full border border-slate-800 px-3 py-1 hover:bg-slate-900/60"
                >
                  {dictionary.onboarding.goWithoutInvite}
                </button>
                <span className="text-[10px] opacity-80">{SITE_URL ? "" : ""}</span>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // =========================
  // ✅ RENDER: TU TOUR ORIGINAL
  // =========================
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-6 text-slate-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(14,116,217,0.18),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.2),rgba(2,6,23,0.96))]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:36px_36px] opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" />

      <main className="soft-enter relative z-10 w-full max-w-5xl">
        <div className="mb-4 flex items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-300">
              RINDAY
            </span>
            <span className="h-1 w-1 rounded-full bg-slate-600" />
            <span className="truncate">{dictionary.onboarding.betaLine}</span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <LanguageToggle compact className="border-slate-700/70 bg-slate-950/70 [&_button]:text-slate-300" />
            <button
              onClick={handleSkip}
              className="tap-feedback rounded-full border border-slate-700/70 px-3 py-1.5 text-[11px] font-medium text-slate-300 transition-all hover:border-slate-500 hover:bg-slate-900/70 hover:text-slate-50"
            >
              {dictionary.onboarding.enterNow}
            </button>
          </div>
        </div>

        <section className="overflow-hidden rounded-[34px] border border-white/10 bg-slate-950/72 shadow-[0_28px_90px_-38px_rgba(0,0,0,0.95)] backdrop-blur-2xl">
          <div className="grid gap-0 lg:grid-cols-[1.05fr,0.95fr]">
            <div className="relative border-b border-white/10 p-5 md:p-7 lg:border-b-0 lg:border-r">
              <div
                className={cn(
                  "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-90 transition-opacity duration-500",
                  currentStep.accent
                )}
              />

              <div className="relative flex min-h-[25rem] flex-col justify-between gap-7">
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200">
                      {currentStepCopy.badge}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-300">
                      {dictionary.onboarding.step} {currentStepIndex + 1} {dictionary.onboarding.of} {totalSteps}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      {dictionary.onboarding.calmApp}
                    </p>
                    <h1 className="max-w-2xl text-balance text-3xl font-semibold tracking-[-0.05em] text-white md:text-5xl">
                      {currentStepCopy.title}
                    </h1>
                    <p className="max-w-xl text-sm leading-6 text-slate-300 md:text-base md:leading-7">
                      {currentStepCopy.subtitle}
                    </p>
                  </div>

                  <ul className="grid gap-2.5 text-sm text-slate-200">
                    {currentStepCopy.points.map((point, idx) => (
                      <li
                        key={idx}
                        className="interactive-surface rounded-[22px] border border-white/10 bg-white/[0.045] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                      >
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-400/12 text-[11px] font-semibold text-sky-200 ring-1 ring-sky-300/20">
                            {idx + 1}
                          </span>
                          <span className="leading-6">{point}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{dictionary.onboarding.preparing}</span>
                    <span>{Math.round(progressPercent)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-300 via-emerald-300 to-amber-200 transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="relative flex flex-col justify-between gap-5 bg-slate-950/88 p-5 md:p-7">
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(14,116,217,0.08),transparent_46%,rgba(16,185,129,0.06))]" />

              <div className="relative mx-auto flex w-full max-w-sm flex-1 items-center justify-center">
                <div className="interactive-card relative w-full max-w-[292px] rounded-[38px] border border-slate-700/80 bg-slate-950 p-3 shadow-[0_28px_70px_-30px_rgba(8,47,73,0.95)]">
                  <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-slate-700/90" />

                  <div className="overflow-hidden rounded-[30px] border border-white/10 bg-slate-900/90">
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300">
                          RINDAY
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-400">{dictionary.onboarding.privateView}</p>
                      </div>
                      <span className="rounded-full bg-emerald-400/12 px-2.5 py-1 text-[9px] font-semibold text-emerald-200 ring-1 ring-emerald-300/20">
                        {dictionary.onboarding.calm}
                      </span>
                    </div>

                    <div className="space-y-3 p-4">
                      <div
                        className={cn(
                          "relative overflow-hidden rounded-[26px] border border-white/10 bg-slate-950 p-4 shadow-[0_16px_44px_-28px_rgba(14,116,217,0.9)]",
                          "soft-enter"
                        )}
                        key={currentStep.id}
                      >
                        <div
                          className={cn(
                            "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80",
                            currentStep.accent
                          )}
                        />
                        <div className="relative space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                              {currentStep.id === "overview" && dictionary.onboarding.preview.monthSummary}
                              {currentStep.id === "patrimonio" && dictionary.nav.netWorth}
                              {currentStep.id === "familia" && dictionary.nav.family}
                            </span>
                            <span className="text-[9px] text-slate-400">{dictionary.onboarding.today}</span>
                          </div>

                          {currentStep.id === "overview" && (
                            <>
                              <div>
                                <p className="text-2xl font-semibold tracking-[-0.05em] text-sky-50">$24,870</p>
                                <p className="text-[10px] text-sky-100/75">{dictionary.onboarding.preview.availableBalance}</p>
                              </div>
                              <div className="grid grid-cols-3 gap-1.5 text-[9px] text-slate-100/90">
                                <div className="rounded-2xl bg-white/[0.07] px-2 py-2">
                                  <p className="text-slate-400">{dictionary.onboarding.preview.incomes}</p>
                                  <p className="mt-0.5 font-semibold">$65k</p>
                                </div>
                                <div className="rounded-2xl bg-white/[0.07] px-2 py-2">
                                  <p className="text-slate-400">{dictionary.onboarding.preview.expenses}</p>
                                  <p className="mt-0.5 font-semibold">$40k</p>
                                </div>
                                <div className="rounded-2xl bg-white/[0.07] px-2 py-2">
                                  <p className="text-slate-400">{dictionary.onboarding.preview.signals}</p>
                                  <p className="mt-0.5 font-semibold">3</p>
                                </div>
                              </div>
                            </>
                          )}

                          {currentStep.id === "patrimonio" && (
                            <>
                              <div>
                                <p className="text-2xl font-semibold tracking-[-0.05em] text-emerald-50">$1.25M</p>
                                <p className="text-[10px] text-emerald-100/80">{dictionary.onboarding.preview.netWorthEstimated}</p>
                              </div>
                              <div className="space-y-2 text-[10px] text-slate-200">
                                <div className="flex items-center justify-between rounded-2xl bg-white/[0.07] px-3 py-2">
                                  <span>{dictionary.onboarding.preview.assets}</span>
                                  <span className="font-semibold">$1.8M</span>
                                </div>
                                <div className="flex items-center justify-between rounded-2xl bg-white/[0.07] px-3 py-2">
                                  <span>{dictionary.onboarding.preview.debts}</span>
                                  <span className="font-semibold">$550k</span>
                                </div>
                              </div>
                            </>
                          )}

                          {currentStep.id === "familia" && (
                            <>
                              <div>
                                <p className="text-2xl font-semibold tracking-[-0.05em] text-amber-50">$18,430</p>
                                <p className="text-[10px] text-amber-100/80">{dictionary.onboarding.preview.visibleFamilySpend}</p>
                              </div>
                              <div className="space-y-2 text-[10px] text-slate-200">
                                <div className="rounded-2xl bg-white/[0.07] px-3 py-2">
                                  {dictionary.onboarding.preview.homeGoal}
                                </div>
                                <div className="rounded-2xl bg-white/[0.07] px-3 py-2">
                                  {dictionary.onboarding.preview.sharedDecisions}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-[9px] text-slate-300">
                        <span className="rounded-full bg-white/[0.07] px-2 py-1.5 text-center">{dictionary.nav.movementsShort}</span>
                        <span className="rounded-full bg-white/[0.07] px-2 py-1.5 text-center">{dictionary.nav.netWorth}</span>
                        <span className="rounded-full bg-white/[0.07] px-2 py-1.5 text-center">{dictionary.nav.family}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative rounded-[28px] border border-white/10 bg-white/[0.045] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={handlePrev}
                    disabled={currentStepIndex === 0}
                    className={cn(
                      "tap-feedback rounded-full px-3 py-2 text-[11px] font-semibold transition-all",
                      currentStepIndex === 0
                        ? "cursor-not-allowed text-slate-600"
                        : "text-slate-200 hover:bg-white/[0.08]"
                    )}
                  >
                    {dictionary.onboarding.back}
                  </button>

                  <div className="flex items-center gap-1.5">
                    {STEPS.map((step, idx) => (
                      <button
                        key={step.id}
                        onClick={() => setCurrentStepIndex(idx)}
                        className={cn(
                          "tap-feedback h-2 rounded-full transition-all",
                          idx === currentStepIndex
                            ? "w-7 bg-sky-300 shadow-[0_0_22px_rgba(125,211,252,0.45)]"
                            : "w-2 bg-slate-700 hover:bg-slate-500"
                        )}
                        aria-label={`${dictionary.onboarding.step} ${idx + 1}`}
                      />
                    ))}
                  </div>

                  <button
                    onClick={handleNext}
                    className={cn(
                      "tap-feedback rounded-full px-4 py-2 text-[11px] font-semibold text-slate-950 shadow-[0_16px_36px_-24px_rgba(125,211,252,0.95)] transition-all hover:-translate-y-0.5",
                      isLastStep ? "bg-emerald-300 hover:bg-emerald-200" : "bg-sky-300 hover:bg-sky-200"
                    )}
                  >
                    {isLastStep ? dictionary.onboarding.start : dictionary.onboarding.next}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
