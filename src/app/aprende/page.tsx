"use client";

import { useEffect, useState } from "react";
import type React from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";
import Link from "next/link";

export const dynamic = "force-dynamic";

type AuthMode = "login" | "signup";

export default function AprendePage() {
  // ---------- AUTH ----------
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  // ---------- IA: chat rápido ----------
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);

  // ---------- IA: análisis de gastos reales ----------
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisResponse, setAnalysisResponse] = useState<string | null>(null);

  // ---------- AUTH EFFECT ----------
  useEffect(() => {
    let ignore = false;

    async function loadUser() {
      setAuthLoading(true);
      setAuthError(null);
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error && (error as any).name !== "AuthSessionMissingError") {
          console.error("Error obteniendo usuario actual", error);
          if (!ignore) {
            setAuthError("Hubo un problema al cargar tu sesión.");
          }
        }
        if (!ignore) {
          setUser(data?.user ?? null);
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
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (error) {
        setAuthError(error.message);
        return;
      }
      setAuthEmail("");
      setAuthPassword("");
    } catch (err) {
      console.error(err);
      setAuthError("No se pudo iniciar sesión.");
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signUp({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (error) {
        setAuthError(error.message);
        return;
      }
      alert("Cuenta creada. Revisa tu correo si tienes verificación activada.");
      setAuthMode("login");
      setAuthPassword("");
    } catch (err) {
      console.error(err);
      setAuthError("No se pudo crear la cuenta.");
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

  // ---------- IA: handler genérico para QA / explicar / plan ----------
  const handleAskAI = async (
    mode: "qa" | "explain" | "plan" = "qa"
  ) => {
    if (!aiInput.trim()) return;

    setAiLoading(true);
    setAiResponse(null);

    try {
      const res = await fetch("/api/aprende-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          question: aiInput,
          userId: user?.id,
        }),
      });

      const data = await res.json();
      setAiResponse(data.answer);
    } catch (err) {
      console.error(err);
      setAiResponse("Error al obtener respuesta. Intenta de nuevo.");
    } finally {
      setAiLoading(false);
    }
  };

  // ---------- IA: analizar gastos reales del mes ----------
  const handleAnalyzeExpenses = async () => {
    if (!user) return;

    setAnalysisLoading(true);
    setAnalysisResponse(null);

    try {
      const now = new Date();
      const year = now.getFullYear();
      const monthIndex = now.getMonth(); // 0 = enero
      const monthNumber = monthIndex + 1;
      const monthLabel = `${year}-${String(monthNumber).padStart(2, "0")}`;

      const from = `${monthLabel}-01`;
      const lastDay = new Date(year, monthNumber, 0).getDate();
      const to = `${monthLabel}-${String(lastDay).padStart(2, "0")}`;

      const { data, error } = await supabase
        .from("transactions")
        .select("date,type,category,amount")
        .eq("user_id", user.id)
        .gte("date", from)
        .lte("date", to);

      if (error) {
        console.error("Error cargando transacciones para IA:", error);
        throw error;
      }

      const txs = (data ?? []) as {
        date: string;
        type: "ingreso" | "gasto";
        category: string | null;
        amount: number;
      }[];

      if (txs.length === 0) {
        setAnalysisResponse(
          "No encontré movimientos este mes para analizar. Registra algunos gastos/ingresos primero."
        );
        setAnalysisLoading(false);
        return;
      }

      let totalIncome = 0;
      let totalExpense = 0;
      const byCategory: Record<
        string,
        { income: number; expense: number }
      > = {};

      txs.forEach((t) => {
        const amount = Number(t.amount) || 0;
        const cat = t.category || "Sin categoría";

        if (!byCategory[cat]) {
          byCategory[cat] = { income: 0, expense: 0 };
        }

        if (t.type === "ingreso") {
          totalIncome += amount;
          byCategory[cat].income += amount;
        } else {
          totalExpense += amount;
          byCategory[cat].expense += amount;
        }
      });

      const lines: string[] = [];
      lines.push(`Ingresos totales: ${totalIncome.toFixed(2)}`);
      lines.push(`Gastos totales: ${totalExpense.toFixed(2)}`);
      lines.push(
        `Ahorro (ingresos - gastos): ${(totalIncome - totalExpense).toFixed(2)}`
      );
      lines.push("");
      lines.push("Por categoría:");
      Object.entries(byCategory).forEach(([cat, vals]) => {
        lines.push(
          `- ${cat}: ingresos ${vals.income.toFixed(
            2
          )}, gastos ${vals.expense.toFixed(2)}`
        );
      });

      const summary = lines.join("\n");

      const res = await fetch("/api/aprende-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "analyze-expenses",
          summary,
          monthLabel,
          userId: user.id,
        }),
      });

      const dataIA = await res.json();
      setAnalysisResponse(dataIA.answer);
    } catch (err) {
      console.error("Error analizando gastos con IA:", err);
      setAnalysisResponse(
        "No se pudo analizar tus gastos. Intenta de nuevo más tarde."
      );
    } finally {
      setAnalysisLoading(false);
    }
  };

  // =================== ESTADOS ESPECIALES ===================
  if (authLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-sm text-slate-600 dark:text-slate-300">
        Cargando sesión...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-lg font-semibold">Aprende finanzas</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Inicia sesión para ver las guías y tips personalizados para tu
            familia.
          </p>

          <h2 className="text-sm font-medium">
            {authMode === "login" ? "Inicia sesión" : "Crea tu cuenta"}
          </h2>

          <form
            onSubmit={authMode === "login" ? handleSignIn : handleSignUp}
            className="space-y-3 text-sm"
          >
            <div>
              <label className="mb-1 block text-xs text-gray-600 dark:text-gray-300">
                Correo electrónico
              </label>
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                placeholder="tucorreo@ejemplo.com"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600 dark:text-gray-300">
                Contraseña
              </label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            {authError && (
              <p className="text-xs text-red-500">{authError}</p>
            )}

            <button
              type="submit"
              className="w-full rounded-lg bg-sky-500 py-2 text-sm font-medium text-white transition hover:bg-sky-600"
            >
              {authMode === "login" ? "Entrar" : "Crear cuenta"}
            </button>
          </form>

          <div className="text-center text-xs text-gray-600 dark:text-gray-300">
            {authMode === "login" ? (
              <>
                ¿No tienes cuenta?{" "}
                <button
                  className="text-sky-600 underline"
                  onClick={() => {
                    setAuthMode("signup");
                    setAuthError(null);
                  }}
                >
                  Crear una nueva
                </button>
              </>
            ) : (
              <>
                ¿Ya tienes cuenta?{" "}
                <button
                  className="text-sky-600 underline"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError(null);
                  }}
                >
                  Inicia sesión
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =================== CONTENIDO PRINCIPAL ===================
  const quickGuides = [
    {
      id: "presupuesto",
      badge: "📊",
      title: "Presupuesto mensual sin dolor de cabeza",
      time: "3 min",
      text: "Aprende a separar ingresos fijos, variables y gastos esenciales para no vivir al día.",
      linkLabel: "Ver guía de presupuesto",
    },
    {
      id: "deudas",
      badge: "💳",
      title: "Cómo atacar tus deudas",
      time: "4 min",
      text: "Estrategia bola de nieve vs. avalancha y cómo elegir la adecuada para tu familia.",
      linkLabel: "Ver guía de deudas",
    },
    {
      id: "ahorro",
      badge: "🏦",
      title: "Arma tu fondo de emergencia",
      time: "2 min",
      text: "Por qué un colchón de 3–6 meses cambia por completo tu tranquilidad financiera.",
      linkLabel: "Ver guía de ahorro",
    },
    {
      id: "tarjetas",
      badge: "🧠",
      title: "Usa las tarjetas a tu favor",
      time: "3 min",
      text: "Tips para que los puntos y MSI no se conviertan en problemas.",
      linkLabel: "Ver guía de tarjetas",
    },
  ];

  const microLessons = [
    "Diferencia entre gasto fijo, variable y prescindible.",
    "Cómo decidir si un gasto va en tu tarjeta o en efectivo.",
    "Qué hacer cuando un mes viene muy cargado (escuela, seguros, etc.).",
    "Reglas simples para enseñar finanzas a tus hijos.",
  ];

  const videoTutorials = [
    {
      id: "inicio",
      title: "Primeros pasos en la app",
      length: "4 min",
      desc: "Cómo registrarte, crear tu familia y entender el dashboard principal.",
      status: "Próximamente",
    },
    {
      id: "gastos",
      title: "Cómo capturar gastos sin volverte loco",
      length: "5 min",
      desc: "Ejemplos reales de registro de gastos diarios, quincenales y mensuales.",
      status: "Próximamente",
    },
    {
      id: "tarjetas-compartidas",
      title: "Tarjetas compartidas y gastos de familia",
      length: "6 min",
      desc: "Cómo conectar los gastos de tus hijos, pareja o casa con tus tarjetas.",
      status: "Próximamente",
    },
  ];

  return (
    <main className="flex flex-1 flex-col gap-4">
      <AppHeader
        title="Aprende finanzas"
        subtitle="Mini guías, IA y tips aplicados a tu vida real, no teoría complicada."
        activeTab="aprende"
        userEmail={user.email ?? ""}
        onSignOut={handleSignOut}
      />

      {/* HERO + intro */}
      <section className="space-y-4 px-4 pb-2 md:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Domina tus finanzas en bloques pequeños
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Aquí encuentras guías cortas, un asistente con IA y ejemplos
                prácticos para que tu familia tome mejores decisiones con el dinero.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Link
                href="/gastos"
                className="rounded-full bg-sky-500 px-3 py-1 font-medium text-white hover:bg-sky-600"
              >
                Capturar gastos / ingresos
              </Link>
              <Link
                href="/familia/dashboard"
                className="rounded-full border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              >
                Ver dashboard familiar
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Asistente con IA */}
      <section className="px-4 md:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            Asistente financiero con IA
          </h2>
          <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
            Pregunta sobre presupuesto, deudas, ahorro o tarjetas. Luego puedes
            pedir que te lo explique como si tuvieras 10 años o que te arme un
            plan de acción.
          </p>

          <div className="flex flex-col gap-2 text-sm">
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-800"
              placeholder='Ej. "¿Cómo organizo mi presupuesto si me pagan quincenal?"'
            />

            <div className="flex flex-wrap gap-2 text-[11px]">
              <button
                onClick={() => handleAskAI("qa")}
                disabled={aiLoading}
                className="rounded-lg bg-sky-500 px-3 py-1 font-medium text-white hover:bg-sky-600 disabled:opacity-60"
              >
                {aiLoading ? "Pensando..." : "Respuesta normal"}
              </button>
              <button
                onClick={() => handleAskAI("explain")}
                disabled={aiLoading}
                className="rounded-lg border border-sky-500 px-3 py-1 font-medium text-sky-600 hover:bg-sky-50 disabled:opacity-60 dark:border-sky-400 dark:text-sky-300 dark:hover:bg-slate-900"
              >
                Explicar como si tuviera 10 años
              </button>
              <button
                onClick={() => handleAskAI("plan")}
                disabled={aiLoading}
                className="rounded-lg border border-emerald-500 px-3 py-1 font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-400 dark:text-emerald-300 dark:hover:bg-slate-900"
              >
                Crear plan de acción
              </button>
            </div>

            {aiResponse && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-snug dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                {aiResponse}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Guías rápidas */}
      <section className="space-y-3 px-4 md:px-6">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Guías rápidas
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {quickGuides.map((guide) => (
            <article
              key={guide.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <span className="text-base">{guide.badge}</span>
                  <span>Lectura rápida · {guide.time}</span>
                </div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {guide.title}
                </h3>
                <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                  {guide.text}
                </p>
              </div>
              <button className="mt-3 inline-flex w-fit items-center text-[11px] font-semibold text-sky-600 hover:underline dark:text-sky-400">
                {guide.linkLabel}
              </button>
            </article>
          ))}
        </div>
      </section>

      {/* Análisis de gastos + microlecciones */}
      <section className="space-y-3 px-4 pb-4 md:px-6">
        <div className="grid gap-4 md:grid-cols-[3fr,2fr]">
          {/* Microlecciones */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              Microlecciones para platicar en familia
            </h2>
            <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
              Úsalas como tema de conversación en la comida, con tu pareja o con
              tus hijos. Son ideas cortas que, repetidas, cambian decisiones.
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

          {/* Análisis de gastos reales con IA */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-[11px] shadow-sm dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-50">
            <h3 className="text-xs font-semibold text-emerald-800 dark:text-emerald-100">
              Analizar mis gastos de este mes
            </h3>
            <p className="mt-2 leading-snug">
              La IA revisa tus movimientos del mes actual (lo que tienes en
              <strong> Gastos</strong>) y te da:
            </p>
            <ul className="mt-1 list-disc pl-4">
              <li>Observaciones clave.</li>
              <li>En qué categorías estás gastando más.</li>
              <li>3 acciones concretas para mejorar.</li>
            </ul>
            <button
              onClick={handleAnalyzeExpenses}
              disabled={analysisLoading}
              className="mt-3 rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {analysisLoading ? "Analizando..." : "Analizar mis gastos"}
            </button>

            {analysisResponse && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-2 text-[11px] leading-snug dark:border-emerald-600 dark:bg-emerald-900/60">
                {analysisResponse}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Videos / tutoriales */}
      <section className="space-y-3 px-4 pb-6 md:px-6">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Videos y tutoriales
        </h2>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Aquí podrás ver videos cortos de cómo usar la app: configurar tu
          familia, registrar gastos, entender el patrimonio, etc.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {videoTutorials.map((vid) => (
            <article
              key={vid.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                  <span>{vid.length}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {vid.status}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {vid.title}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {vid.desc}
                </p>
              </div>
              <button className="mt-3 inline-flex w-fit items-center text-[11px] font-semibold text-sky-600 opacity-60 dark:text-sky-400">
                Ver video (muy pronto)
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
