"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

type StepId = "overview" | "patrimonio" | "familia";

type Step = {
  id: StepId;
  title: string;
  subtitle: string;
  badge: string;
  accent: string;
  points: string[];
};

const STEPS: Step[] = [
  {
    id: "overview",
    badge: "🚀 Bienvenido",
    title: "Controla tu lana sin complicarte la vida",
    subtitle:
      "Registra ingresos y gastos en segundos. La app hace las cuentas por ti y te dice si vas bien o ya se te está saliendo de control.",
    accent: "from-sky-500/20 via-emerald-400/10 to-transparent",
    points: [
      "Captura gastos al momento, incluso sin internet.",
      "Organiza todo por categorías y métodos de pago.",
      "Ve mes con mes en qué se está yendo tu dinero.",
    ],
  },
  {
    id: "patrimonio",
    badge: "📊 Patrimonio",
    title: "Ten claro cuánto realmente vales… en números",
    subtitle:
      "Activos, deudas y patrimonio neto en un solo lugar, sin excels raros ni fórmulas escondidas.",
    accent: "from-violet-500/20 via-sky-400/10 to-transparent",
    points: [
      "Registra casa, coche, ahorros, inversiones, etc.",
      "Da de alta tus deudas: tarjetas, créditos, hipoteca.",
      "Ve cómo cambia tu patrimonio mes a mes.",
    ],
  },
  {
    id: "familia",
    badge: "👨‍👩‍👧‍👦 Familia",
    title: "Cada quien gasta, tú ves el mapa completo",
    subtitle:
      "Conecta a tu familia: cada uno registra sus gastos y tú puedes ver el resumen familiar sin mezclar cuentas.",
    accent: "from-amber-400/25 via-rose-400/10 to-transparent",
    points: [
      "Invita a tu pareja, hijos u otros miembros.",
      "Ve quién hizo cada gasto y con qué tarjeta.",
      "Consulta el gasto total familiar por categoría o tarjeta.",
    ],
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
    return "Te topaste con el límite de correos (rate limit). Intenta en unos minutos o sube el límite en Supabase Auth → Rate Limits.";
  }
  if (m.includes("invalid") && m.includes("email")) {
    return "Ingresa un correo válido.";
  }
  return msg ?? "No se pudo enviar el link. Intenta de nuevo.";
}

export default function OnboardingClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const modeParam = (sp.get("mode") ?? "").toLowerCase(); // login | signup
  const emailParam = (sp.get("email") ?? "").trim();
  const nextParam = safeInternalNext(sp.get("next"));

  // ✅ Si viene modo invitación/auth, no mostramos el tour
  const isInviteFlow =
    modeParam === "login" || modeParam === "signup" || !!nextParam || !!emailParam;

  // ====== INVITE/AUTH STATE ======
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
        setAuthMsg("Ingresa un correo válido.");
        return;
      }

      // ✅ Redirect FIJO a tu dominio (evita localhost/preview)
      // ✅ FIX REAL: SIEMPRE pasar por /auth/callback
// (Supabase necesita exchangeCodeForSession)
const base = SITE_URL || "https://rinday.app";
const nextSafe = next || "/familia";
const redirectTo = `${base}/auth/callback?next=${encodeURIComponent(nextSafe)}`;

      const shouldCreateUser = authMode === "signup";

      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser,
        },
      });

      if (error) throw error;

      setAuthSent(true);
      startCooldown(20);

      setAuthMsg(
        "Listo ✅ Te mandamos un correo con un link para entrar. Revisa spam/promociones. Ábrelo desde el mismo dispositivo."
      );
    } catch (e: any) {
      setAuthMsg(prettyAuthError(e?.message));
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
          <div className="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.65)] backdrop-blur-xl">
            <div className="text-[10px] uppercase tracking-[0.2em] text-sky-400">
              RINDAY
            </div>

            <h1 className="mt-2 text-xl font-semibold tracking-tight">
              {authMode === "signup" ? "Crear cuenta" : "Iniciar sesión"}
            </h1>

            <p className="mt-1 text-[12px] leading-relaxed text-slate-300">
              Para aceptar la invitación, entra con el correo invitado. Te mandaremos un link seguro por email.
            </p>

            <div className="mt-4 space-y-2">
              <label className="block text-[12px] font-semibold text-slate-200">
                Correo
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-slate-700/70 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-sky-300/30"
                placeholder="tu@correo.com"
                autoComplete="email"
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
                  ? "Enviando…"
                  : cooldown > 0
                  ? `Espera ${cooldown}s…`
                  : authMode === "signup"
                  ? "Crear cuenta y enviar link"
                  : "Enviar link de acceso"}
              </button>

              <button
                onClick={() => setAuthMode((m) => (m === "login" ? "signup" : "login"))}
                disabled={authBusy}
                className="rounded-full border border-slate-700/70 px-4 py-2 text-[12px] font-semibold text-slate-200 hover:bg-slate-900/60 disabled:opacity-60"
              >
                {authMode === "login" ? "Crear cuenta" : "Ya tengo cuenta"}
              </button>
            </div>

            {authSent ? (
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Link enviado
                </span>

                <button
                  onClick={sendMagicLink}
                  disabled={authBusy || cooldown > 0}
                  className="rounded-full border border-slate-800 px-3 py-1 hover:bg-slate-900/60 disabled:opacity-60"
                >
                  Reenviar
                </button>
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-between text-[11px] text-slate-400">
                <button
                  onClick={clearNextAndGoApp}
                  className="rounded-full border border-slate-800 px-3 py-1 hover:bg-slate-900/60"
                >
                  Ir a la app sin invitación
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
    <div className="relative flex min-h-screen items-center justify-center bg-slate-950 px-4 py-6 text-slate-50">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute -right-32 top-10 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <main className="relative z-10 w-full max-w-4xl">
        <div className="mb-4 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-sky-400">
              Finanzas Familiares
            </span>
            <span className="h-1 w-1 rounded-full bg-slate-600" />
            <span>
              Paso {currentStepIndex + 1} de {totalSteps}
            </span>
          </div>

          <button
            onClick={handleSkip}
            className="rounded-full border border-slate-700/70 px-3 py-1 text-[11px] font-medium text-slate-300 hover:border-slate-500 hover:text-slate-50"
          >
            Saltar e ir a la app
          </button>
        </div>

        <section className="overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/70 shadow-[0_18px_60px_rgba(0,0,0,0.65)] backdrop-blur-xl">
          <div className="grid gap-0 md:grid-cols-[1.2fr,1fr]">
            <div className="relative border-b border-slate-900/60 p-5 md:border-b-0 md:border-r">
              <div
                className={cn(
                  "pointer-events-none absolute inset-0 transition-opacity duration-500",
                  currentStep.id === "overview" &&
                    "bg-gradient-to-br from-sky-500/10 via-slate-900/0 to-slate-900/0",
                  currentStep.id === "patrimonio" &&
                    "bg-gradient-to-br from-violet-500/10 via-slate-900/0 to-slate-900/0",
                  currentStep.id === "familia" &&
                    "bg-gradient-to-br from-amber-400/10 via-slate-900/0 to-slate-900/0"
                )}
              />

              <div className="relative space-y-4">
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-900/80 px-3 py-1 text-[11px] font-medium text-slate-300 ring-1 ring-slate-700/80">
                  <span className="text-base">{currentStep.badge}</span>
                  <span className="h-1 w-1 rounded-full bg-slate-500" />
                  <span>Cómo funciona</span>
                </span>

                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-50 md:text-3xl">
                    {currentStep.title}
                  </h1>
                  <p className="max-w-xl text-[13px] leading-relaxed text-slate-300">
                    {currentStep.subtitle}
                  </p>
                </div>

                <ul className="mt-3 space-y-2 text-[12px] text-slate-200">
                  {currentStep.points.map((point, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-sky-500/20 text-[10px] text-sky-300">
                        {idx + 1}
                      </span>
                      <span className="leading-snug">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="relative mt-6 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Progreso</span>
                  <span>
                    {currentStepIndex + 1} / {totalSteps}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-800/80">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-400 via-emerald-400 to-amber-300 transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="relative flex items-stretch justify-center bg-slate-950/90 p-5">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-900/0 via-slate-900/60 to-slate-950/90" />

              <div className="relative flex w-full max-w-xs flex-col items-center justify-center">
                <div className="relative w-full max-w-[260px] rounded-[32px] border border-slate-700/70 bg-slate-950/80 p-3 shadow-[0_20px_40px_rgba(0,0,0,0.85)]">
                  <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-slate-700/80" />

                  <div className="space-y-2 rounded-2xl bg-slate-900/80 p-3">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-medium">Finanzas Familiares</span>
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[9px] text-sky-300">
                        Vista rápida
                      </span>
                    </div>

                    <div
                      className={cn(
                        "relative overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900/90 p-3 text-[11px]",
                        "shadow-[0_12px_30px_rgba(8,47,73,0.75)]"
                      )}
                    >
                      <div
                        className={cn(
                          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80",
                          currentStep.accent
                        )}
                      />
                      <div className="relative space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-200">
                            {currentStep.id === "overview" && "Gastos e ingresos"}
                            {currentStep.id === "patrimonio" && "Patrimonio neto"}
                            {currentStep.id === "familia" && "Gasto familiar"}
                          </span>
                          <span className="text-[9px] text-slate-100/80">Demo</span>
                        </div>

                        {currentStep.id === "overview" && (
                          <>
                            <p className="text-lg font-semibold text-sky-50">$ 24,870</p>
                            <p className="text-[10px] text-sky-100/80">Disponible este mes</p>
                            <div className="mt-2 grid grid-cols-3 gap-1.5 text-[9px] text-slate-100/90">
                              <div className="rounded-lg bg-slate-900/70 px-2 py-1">
                                <p className="text-[9px] text-slate-300">Ingresos</p>
                                <p className="font-semibold">$ 65,000</p>
                              </div>
                              <div className="rounded-lg bg-slate-900/70 px-2 py-1">
                                <p className="text-[9px] text-slate-300">Gastos</p>
                                <p className="font-semibold">$ 40,130</p>
                              </div>
                              <div className="rounded-lg bg-slate-900/70 px-2 py-1">
                                <p className="text-[9px] text-slate-300">Movimientos</p>
                                <p className="font-semibold">132</p>
                              </div>
                            </div>
                          </>
                        )}

                        {currentStep.id === "patrimonio" && (
                          <>
                            <p className="text-lg font-semibold text-emerald-50">$ 1,250,000</p>
                            <p className="text-[10px] text-emerald-100/90">Patrimonio neto</p>
                            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[9px] text-slate-100/90">
                              <div className="rounded-lg bg-slate-900/70 px-2 py-1">
                                <p className="text-[9px] text-slate-300">Activos</p>
                                <p className="font-semibold">$ 1,800,000</p>
                              </div>
                              <div className="rounded-lg bg-slate-900/70 px-2 py-1">
                                <p className="text-[9px] text-slate-300">Deudas</p>
                                <p className="font-semibold">$ 550,000</p>
                              </div>
                            </div>
                            <p className="mt-1 text-[9px] text-emerald-200/90">
                              + $ 35,000 vs. mes anterior
                            </p>
                          </>
                        )}

                        {currentStep.id === "familia" && (
                          <>
                            <p className="text-lg font-semibold text-amber-50">$ 18,430</p>
                            <p className="text-[10px] text-amber-100/90">
                              Gasto familiar este mes
                            </p>
                          </>
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-between text-[9px] text-slate-400">
                        <span>Así se ve dentro de la app</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-2 py-0.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          <span>Listo para usar</span>
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 text-[9px]">
                      <span className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-slate-900/80 px-2 py-1 text-slate-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                        Gastos
                      </span>
                      <span className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-slate-900/80 px-2 py-1 text-slate-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Patrimonio
                      </span>
                      <span className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-slate-900/80 px-2 py-1 text-slate-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                        Familia
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-slate-900/70 bg-slate-950/80 px-5 py-3 text-[11px] text-slate-200">
                <button
                  onClick={handlePrev}
                  disabled={currentStepIndex === 0}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[11px] transition-all",
                    currentStepIndex === 0
                      ? "cursor-not-allowed text-slate-500"
                      : "text-slate-200 hover:bg-slate-900/80"
                  )}
                >
                  Anterior
                </button>

                <div className="flex items-center gap-1.5">
                  {STEPS.map((step, idx) => (
                    <button
                      key={step.id}
                      onClick={() => setCurrentStepIndex(idx)}
                      className={cn(
                        "h-1.5 rounded-full transition-all",
                        idx === currentStepIndex
                          ? "w-6 bg-sky-400"
                          : "w-1.5 bg-slate-600 hover:bg-slate-400"
                      )}
                      aria-label={`Ir al paso ${idx + 1}`}
                    />
                  ))}
                </div>

                <button
                  onClick={handleNext}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-[11px] font-semibold text-slate-900 transition-all",
                    isLastStep ? "bg-emerald-400 hover:bg-emerald-300" : "bg-sky-400 hover:bg-sky-300"
                  )}
                >
                  {isLastStep ? "Entrar a mi app" : "Siguiente"}
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
