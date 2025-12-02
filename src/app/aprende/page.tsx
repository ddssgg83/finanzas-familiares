"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useTheme } from "next-themes";
import { ThemeToggle } from "@/components/ThemeToggle";
import Link from "next/link";
import { MainNavTabs } from "@/components/MainNavTabs";

export const dynamic = "force-dynamic";

export default function AprendePage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const { theme, systemTheme } = useTheme();
  const [mountedTheme, setMountedTheme] = useState(false);
  useEffect(() => setMountedTheme(true), []);
  const currentTheme = theme === "system" ? systemTheme : theme;
  const isDark = mountedTheme && currentTheme === "dark";

  useEffect(() => {
    let ignore = false;

    async function loadUser() {
      setAuthLoading(true);
      try {
        const { data } = await supabase.auth.getUser();
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

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
    } catch (err) {
      console.error("Error cerrando sesión", err);
    }
  };

  if (authLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-sm text-slate-600 dark:text-slate-300">
        Cargando sesión...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">Aprende finanzas</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inicia sesión para ver tu contenido educativo.
              </p>
            </div>
            <ThemeToggle />
          </div>
          <p className="text-xs text-slate-500">
            Usa el mismo usuario que en tu app de finanzas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-4">
      {/* Header */}
      <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold sm:text-xl">
            Aprende finanzas en familia
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Conceptos básicos para mejorar tu ahorro, inversión y organización
            familiar.
          </p>

          {/* Navegación */}
          <MainNavTabs />
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <span className="hidden text-[11px] text-slate-500 sm:inline">
            {user.email}
          </span>
          <button
            onClick={handleSignOut}
            className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* Contenido educativo inicial */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* Bloque 1: Ahorro y control de gastos */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-1 text-sm font-semibold">
            1. Control de gastos y ahorro básico
          </h2>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            Antes de invertir, la base es saber cuánto entra y cuánto sale cada
            mes.
          </p>
          <ul className="mb-2 list-disc space-y-1 pl-4 text-xs">
            <li>Registra TODOS tus gastos (aunque sean pequeños).</li>
            <li>Clasifica por categorías: hogar, comida, auto, hijos, ocio.</li>
            <li>Define un presupuesto mensual para cada categoría.</li>
            <li>Destina al menos 10% de tus ingresos al ahorro.</li>
          </ul>
          <p className="mt-2 text-xs font-medium text-emerald-500 dark:text-emerald-300">
            Tip: Usa la vista de “Gastos e ingresos” para detectar fugas de
            dinero (suscripciones, comida fuera, etc.).
          </p>
        </div>

        {/* Bloque 2: Fondo de emergencia */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-1 text-sm font-semibold">
            2. Fondo de emergencia familiar
          </h2>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            Es tu “airbag financiero”: te protege de imprevistos sin endeudarte.
          </p>
          <ul className="mb-2 list-disc space-y-1 pl-4 text-xs">
            <li>Meta ideal: de 3 a 6 meses de gastos fijos.</li>
            <li>Debe estar en un instrumento LIQUIDO (puedas sacarlo rápido).</li>
            <li>No es para vacaciones ni compras; sólo emergencias reales.</li>
            <li>Puedes irlo construyendo poco a poco mes a mes.</li>
          </ul>
          <p className="mt-2 text-xs font-medium text-sky-500 dark:text-sky-300">
            Ejemplo: si tu familia gasta 30,000 mensuales, tu meta de fondo de
            emergencia sería entre 90,000 y 180,000.
          </p>
        </div>

        {/* Bloque 3: Deuda e inversión */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-1 text-sm font-semibold">
            3. Deudas, intereses e inversión
          </h2>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            La clave es entender la diferencia entre interés que pagas vs
            interés que cobras.
          </p>
          <ul className="mb-2 list-disc space-y-1 pl-4 text-xs">
            <li>
              Deudas de consumo (tarjetas) suelen tener tasas MUY altas; hay que
              bajarlas lo antes posible.
            </li>
            <li>
              No confundas “meses sin intereses” con “dinero gratis”: igual es
              dinero que ya comprometiste.
            </li>
            <li>
              Invertir no es apostar: es poner tu dinero a trabajar con riesgo
              controlado.
            </li>
            <li>
              Antes de productos raros, empieza por instrumentos sencillos y
              regulados (ej. CETES, fondos muy básicos).
            </li>
          </ul>
          <p className="mt-2 text-xs font-medium text-amber-500 dark:text-amber-300">
            Regla sana: primero baja deudas caras, luego construye fondo de
            emergencia y después incrementa tus inversiones.
          </p>
        </div>
      </section>

      {/* Sección futura IA */}
      <section className="mb-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-1 text-sm font-semibold">
          Próximamente: guía personalizada con IA 🤖
        </h2>
        <p className="mb-2 text-slate-600 dark:text-slate-300">
          La idea es que aquí puedas hacer preguntas como:
        </p>
        <ul className="mb-2 list-disc space-y-1 pl-4 text-slate-600 dark:text-slate-300">
          <li>“¿Cómo puedo bajar mis gastos de tarjetas este mes?”</li>
          <li>“¿Qué porcentaje debería ahorrar según mis ingresos?”</li>
          <li>“¿Qué es mejor para mí: adelantar deuda o invertir?”</li>
        </ul>
        <p className="text-slate-500 dark:text-slate-400">
          Y que la inteligencia artificial te responda usando tus propios datos
          de la app (sin exponer información sensible), con recomendaciones
          sencillas y accionables.
        </p>
      </section>
    </main>
  );
}
