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
      text: "Tips para que los puntos y meses sin intereses no se conviertan en problemas.",
      linkLabel: "Ver guía de tarjetas",
    },
  ];

  const microLessons = [
    "Diferencia entre gasto fijo, variable y prescindible.",
    "Cómo decidir si un gasto va en tu tarjeta o en efectivo.",
    "Qué hacer cuando un mes viene muy cargado (escuela, seguros, etc.).",
    "Reglas simples para enseñar finanzas a tus hijos.",
  ];

  return (
    <main className="flex flex-1 flex-col gap-4">
      <AppHeader
        title="Aprende finanzas"
        subtitle="Mini guías y tips aplicados a tu vida real, no teoría complicada."
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
                Aquí vas a encontrar guías cortas y accionables para que tú y tu
                familia tomen mejores decisiones con el dinero, sin hacer un
                curso eterno.
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

      {/* Microlecciones */}
      <section className="space-y-3 px-4 pb-4 md:px-6">
        <div className="grid gap-4 md:grid-cols-[3fr,2fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              Microlecciones para platicar en familia
            </h2>
            <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
              Úsalas como tema de conversación en la comida, con tu pareja o
              incluso con tus hijos. Son ideas cortas que, repetidas, cambian la
              manera en que toman decisiones.
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
              Tip práctico de esta semana
            </h3>
            <p className="mt-2 leading-snug">
              Elige una sola categoría para mejorar este mes (por ejemplo,
              “comidas fuera de casa”). No intentes cambiar todo a la vez. Solo
              mide cuánto gastas ahí y ponle un tope sencillo.
            </p>
            <p className="mt-2 leading-snug">
              Si usas la app para registrar esos gastos, a fin de mes podrás ver
              en tu dashboard si realmente bajaste el monto.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
