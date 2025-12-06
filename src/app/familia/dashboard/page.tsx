"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { useTheme } from "next-themes";

export const dynamic = "force-dynamic";

type TxType = "ingreso" | "gasto";

type Tx = {
  id: string;
  date: string;
  type: TxType;
  category: string;
  amount: number;
  method: string;
  notes?: string | null;
  owner_user_id?: string | null;
  spender_user_id?: string | null;
  spender_label?: string | null;
};

type FamilyContext = {
  familyId: string;
  familyName: string;
  ownerUserId: string;
  activeMembers: number;
};

type AuthMode = "login" | "signup";

function getCurrentMonthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatMoney(num: number) {
  return num.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  });
}

function formatDateDisplay(ymd: string) {
  const s = (ymd ?? "").slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

export default function FamilyDashboardPage() {
  // ---------- AUTH ----------
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  // ---------- FAMILY CONTEXT ----------
  const [familyCtx, setFamilyCtx] = useState<FamilyContext | null>(null);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [familyError, setFamilyError] = useState<string | null>(null);

  // ---------- DATA ----------
  const [month, setMonth] = useState<string>(() => getCurrentMonthKey());
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  // ---------- THEME ----------
  const { theme, systemTheme } = useTheme();
  const [mountedTheme, setMountedTheme] = useState(false);
  useEffect(() => setMountedTheme(true), []);
  const currentTheme = theme === "system" ? systemTheme : theme;
  const isDark = mountedTheme && currentTheme === "dark";

  // =========================================================
  //  1. AUTH
  // =========================================================
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

  const handleSignIn = async (e: FormEvent) => {
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

  const handleSignUp = async (e: FormEvent) => {
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
      setFamilyCtx(null);
      setTransactions([]);
    } catch (err) {
      console.error("Error cerrando sesión", err);
    }
  };

  // =========================================================
  //  2. Cargar contexto de familia del usuario
  // =========================================================
  useEffect(() => {
    const currentUser = user;
    if (!currentUser) {
      setFamilyCtx(null);
      setFamilyError(null);
      setFamilyLoading(false);
      return;
    }

    const userId = currentUser.id;
    const email = (currentUser.email ?? "").toLowerCase();
    let cancelled = false;

    const loadFamily = async () => {
      setFamilyLoading(true);
      setFamilyError(null);
      try {
        const { data: memberRows, error: memberError } = await supabase
          .from("family_members")
          .select("id,family_id,status,user_id,invited_email")
          .or(`user_id.eq.${userId},invited_email.eq.${email}`)
          .eq("status", "active")
          .limit(1);

        if (memberError) throw memberError;

        if (!memberRows || memberRows.length === 0) {
          if (!cancelled) {
            setFamilyCtx(null);
          }
          return;
        }

        const member = memberRows[0];

        const { data: fam, error: famError } = await supabase
          .from("families")
          .select("id,name,user_id")
          .eq("id", member.family_id)
          .single();

        if (famError) throw famError;

        const { data: activeMembers, error: membersError } = await supabase
          .from("family_members")
          .select("id,status")
          .eq("family_id", fam.id)
          .eq("status", "active");

        if (membersError) throw membersError;

        if (!cancelled) {
          const activeCount = activeMembers?.length ?? 0;

          setFamilyCtx({
            familyId: fam.id,
            familyName: fam.name,
            ownerUserId: fam.user_id,
            activeMembers: activeCount,
          });
        }
      } catch (err) {
        console.error("Error cargando familia para dashboard:", err);
        if (!cancelled) {
          setFamilyError(
            "No se pudo cargar la información de tu familia. Revisa la sección Familia."
          );
          setFamilyCtx(null);
        }
      } finally {
        if (!cancelled) setFamilyLoading(false);
      }
    };

    loadFamily();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const isOwner =
    !!familyCtx && !!user && familyCtx.ownerUserId === user.id;

  // =========================================================
  //  3. Cargar transacciones familiares del mes
  // =========================================================
  useEffect(() => {
    if (!user || !familyCtx) {
      setTransactions([]);
      return;
    }

    const ownerId = familyCtx.ownerUserId;

    async function loadTx() {
      setLoadingTx(true);
      setTxError(null);

      try {
        const [year, monthNumber] = month.split("-");
        const from = `${month}-01`;
        const to = `${month}-${new Date(
          Number(year),
          Number(monthNumber),
          0
        )
          .getDate()
          .toString()
          .padStart(2, "0")}`;

        const { data, error } = await supabase
          .from("transactions")
          .select(
            "id,date,type,category,amount,method,notes,owner_user_id,spender_user_id,spender_label"
          )
          .eq("owner_user_id", ownerId)
          .gte("date", from)
          .lte("date", to)
          .order("date", { ascending: true });

        if (error) throw error;

        setTransactions(
          (data ?? []).map((t: any) => ({
            id: t.id,
            date: t.date,
            type: t.type,
            category: t.category,
            amount: Number(t.amount),
            method: t.method,
            notes: t.notes ?? null,
            owner_user_id: t.owner_user_id ?? null,
            spender_user_id: t.spender_user_id ?? null,
            spender_label: t.spender_label ?? null,
          }))
        );
      } catch (err) {
        console.error("Error cargando movimientos familiares:", err);
        setTxError("No se pudieron cargar los movimientos familiares.");
      } finally {
        setLoadingTx(false);
      }
    }

    loadTx();
  }, [user, familyCtx, month]);

  // =========================================================
  //  4. Cálculos agregados
  // =========================================================
  const { ingresosFamilia, gastosFamilia } = useMemo(() => {
    let ingresos = 0;
    let gastos = 0;
    for (const t of transactions) {
      if (t.type === "ingreso") ingresos += t.amount;
      else gastos += t.amount;
    }
    return { ingresosFamilia: ingresos, gastosFamilia: gastos };
  }, [transactions]);

  const flujoFamiliar = ingresosFamilia - gastosFamilia;

  const gastosPorCategoria = useMemo(() => {
    const map = new Map<string, number>();

    for (const t of transactions) {
      if (t.type !== "gasto") continue;
      const key = t.category || "SIN_CATEGORIA";
      map.set(key, (map.get(key) ?? 0) + t.amount);
    }

    const entries = Array.from(map.entries()).map(([category, total]) => ({
      category,
      total,
    }));

    entries.sort((a, b) => b.total - a.total);
    const totalGastos = entries.reduce((sum, e) => sum + e.total, 0);

    return entries.map((e) => ({
      ...e,
      percent: totalGastos ? (e.total * 100) / totalGastos : 0,
    }));
  }, [transactions]);

  const gastosPorPersona = useMemo(() => {
    const map = new Map<string, number>();

    for (const t of transactions) {
      if (t.type !== "gasto") continue;

      const label = t.spender_label || "Sin etiqueta";
      map.set(label, (map.get(label) ?? 0) + t.amount);
    }

    const arr = Array.from(map.entries()).map(([label, total]) => ({
      label,
      total,
    }));

    const total = arr.reduce((s, x) => s + x.total, 0);

    return arr
      .map((x) => ({
        ...x,
        percent: total ? (x.total * 100) / total : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [transactions]);

  const chartDataCategorias = useMemo(
    () =>
      gastosPorCategoria.map((g) => ({
        category: g.category,
        total: g.total,
      })),
    [gastosPorCategoria]
  );

  const chartDataLinea = useMemo(() => {
    const map = new Map<
      string,
      { date: string; ingresos: number; gastos: number }
    >();

    for (const t of transactions) {
      const key = (t.date ?? "").slice(0, 10);
      if (!map.has(key)) {
        map.set(key, { date: key, ingresos: 0, gastos: 0 });
      }
      const item = map.get(key)!;
      if (t.type === "ingreso") item.ingresos += t.amount;
      else item.gastos += t.amount;
    }

    const arr = Array.from(map.values()).sort((a, b) =>
      a.date < b.date ? -1 : 1
    );

    return arr.map((d) => ({
      ...d,
      dateLabel: formatDateDisplay(d.date),
    }));
  }, [transactions]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-");
    const date = new Date(Number(y), Number(m) - 1, 1);
    const raw = date.toLocaleDateString("es-MX", {
      year: "numeric",
      month: "long",
    });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [month]);

  const recentActivity = useMemo(() => {
    const sorted = [...transactions].sort((a, b) =>
      a.date < b.date ? 1 : -1
    );
    return sorted.slice(0, 8);
  }, [transactions]);

  const smartSummary = useMemo(() => {
    const lines: string[] = [];

    if (!familyCtx) {
      lines.push(
        "Todavía no tienes configurado un grupo familiar. Ve a la sección Familia para crear uno."
      );
      return lines;
    }

    if (!transactions.length) {
      lines.push(
        "Este mes aún no hay movimientos familiares. Cuando tú o tu familia registren ingresos y gastos verás el resumen aquí."
      );
      return lines;
    }

    if (ingresosFamilia === 0 && gastosFamilia > 0) {
      lines.push(
        "Este mes sólo se han registrado gastos familiares sin ingresos. Revisa si falta capturar sueldos o aportaciones."
      );
    }

    if (ingresosFamilia > 0) {
      const ratio = (gastosFamilia / ingresosFamilia) * 100;
      lines.push(
        `La familia ha gastado aproximadamente el ${ratio.toFixed(
          1
        )}% de los ingresos registrados en el mes.`
      );

      if (ratio > 95) {
        lines.push(
          "Están prácticamente gastando todo lo que ingresa. Quizá vale la pena frenar un poco los gastos en lo que resta del mes."
        );
      } else if (ratio > 75) {
        lines.push(
          "El nivel de gasto familiar es alto, pero aún tienen cierto margen. Revisar las principales categorías puede ayudar."
        );
      } else if (ratio < 50) {
        lines.push(
          "Van muy bien. Están gastando menos de la mitad de lo que entra a la familia este mes."
        );
      }
    }

    if (gastosPorCategoria.length > 0) {
      const top1 = gastosPorCategoria[0];
      lines.push(
        `La categoría con más gasto familiar este mes es "${top1.category}" con ${formatMoney(
          top1.total
        )} (${top1.percent.toFixed(1)}% del total de gastos).`
      );
      if (gastosPorCategoria.length > 1) {
        const top2 = gastosPorCategoria[1];
        lines.push(
          `La segunda categoría con más peso es "${top2.category}" con ${formatMoney(
            top2.total
          )}.`
        );
      }
    }

    if (gastosPorPersona.length > 0) {
      const top = gastosPorPersona[0];
      lines.push(
        `Quien más ha generado gastos familiares este mes es "${top.label}" con ${formatMoney(
          top.total
        )} (${top.percent.toFixed(1)}% del gasto familiar).`
      );
    }

    return lines;
  }, [
    familyCtx,
    transactions,
    ingresosFamilia,
    gastosFamilia,
    gastosPorCategoria,
    gastosPorPersona,
  ]);

  // =========================================================
  //  RENDER: estados especiales
  // =========================================================
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
          <h1 className="text-lg font-semibold">Finanzas familiares</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Inicia sesión para ver el dashboard familiar y conectar tus gastos
            con tu familia.
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

  // =========================================================
  //  RENDER: DASHBOARD FAMILIAR
  // =========================================================
  return (
    <main className="flex flex-1 flex-col gap-4">
      <AppHeader
        title="Dashboard familiar"
        subtitle="Resumen 360° de ingresos y gastos de tu familia."
        activeTab="familia"
        userEmail={user.email}
        onSignOut={handleSignOut}
      />

      <section className="space-y-4">
        {/* Barra superior */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <div className="text-xs text-slate-500 dark:text-slate-300">
                Mes que estás analizando
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                  aria-label={`Mes: ${monthLabel}`}
                />
              </div>

              {familyCtx && (
                <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <div>
                    Familia:{" "}
                    <span className="font-semibold">
                      {familyCtx.familyName}
                    </span>{" "}
                    {isOwner ? "(jefe de familia)" : "(miembro)"}
                  </div>
                  <div>
                    Miembros activos:{" "}
                    <span className="font-semibold">
                      {familyCtx.activeMembers}
                    </span>
                  </div>
                </div>
              )}
              {familyError && (
                <p className="text-[11px] text-rose-500">{familyError}</p>
              )}
            </div>

            {/* Navegación rápida */}
            <div className="flex flex-wrap gap-2 text-xs">
              <Link
                href="/gastos"
                className="rounded-full bg-sky-500 px-3 py-1 font-medium text-white hover:bg-sky-600"
              >
                Capturar gastos / ingresos
              </Link>
              <Link
                href="/patrimonio"
                className="rounded-full bg-emerald-500 px-3 py-1 font-medium text-white hover:bg-emerald-600"
              >
                Ver / editar patrimonio
              </Link>
              <Link
                href="/familia"
                className="rounded-full bg-slate-900 px-3 py-1 font-medium text-white hover:bg-black dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
              >
                Configuración de familia
              </Link>
            </div>
          </div>
        </div>

        {/* Tarjetas principales (alineadas y del mismo alto) */}
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* Ingresos */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Ingresos familiares del mes
            </h3>
            <div className="flex h-[110px] flex-col justify-center">
              <div className="text-xl md:text-2xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">
                {formatMoney(ingresosFamilia)}
              </div>
              <p className="mt-2 text-sm leading-tight text-slate-500">
                Suma de todos los ingresos donde tú eres el dueño financiero.
              </p>
            </div>
          </div>

          {/* Gastos */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Gastos familiares del mes
            </h3>
            <div className="flex h-[110px] flex-col justify-center">
              <div className="text-xl md:text-2xl font-semibold tracking-tight text-rose-600 dark:text-rose-400">
                {formatMoney(gastosFamilia)}
              </div>
              <p className="mt-2 text-sm leading-tight text-slate-500">
                Incluye tus gastos y los de tus familiares con tus tarjetas.
              </p>
            </div>
          </div>

          {/* Flujo */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Flujo familiar (Ingresos – Gastos)
            </h3>
            <div className="flex h-[110px] flex-col justify-center">
              <div
                className={`text-xl md:text-2xl font-semibold tracking-tight ${
                  flujoFamiliar < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {formatMoney(flujoFamiliar)}
              </div>
              <p className="mt-2 text-sm leading-tight text-slate-500">
                Si es negativo, la familia está gastando más de lo que ingresa.
              </p>
            </div>
          </div>

          {/* Miembros activos */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Miembros activos
            </h3>
            <div className="flex h-[110px] flex-col justify-center">
              <div className="text-xl md:text-2xl font-semibold tracking-tight text-sky-600 dark:text-sky-400">
                {familyCtx?.activeMembers ?? 0}
              </div>
              <p className="mt-2 text-sm leading-tight text-slate-500">
                Cada miembro puede registrar gastos; el resumen se centra en el
                dueño financiero.
              </p>
            </div>
          </div>

          {/* Tip rápido */}
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm dark:border-amber-700 dark:bg-amber-900/30">
            <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              Tip rápido
            </h3>
            <div className="flex h-[110px] flex-col justify-center">
              <p className="text-sm leading-tight text-amber-700 dark:text-amber-300">
                Pídele a tu familia que use siempre el campo{" "}
                <strong>“Quién generó”</strong> al capturar gastos. Así este
                dashboard te dirá quién está gastando más.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Resumen inteligente familiar */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-semibold">
          Resumen inteligente de tus finanzas familiares
        </h2>
        {smartSummary.length === 0 ? (
          <p className="text-xs text-gray-500">
            Aún no hay suficiente información para generar un resumen.
          </p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-xs">
            {smartSummary.map((line, idx) => (
              <li key={idx}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      {/* Gráficas principales */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="h-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-2 text-xs font-semibold">
            Gastos familiares por categoría (mes actual)
          </h3>
          {chartDataCategorias.length === 0 ? (
            <p className="text-xs text-gray-500">
              Aún no hay gastos registrados en este mes.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartDataCategorias}
                margin={{ top: 10, right: 10, left: 0, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="category"
                  tick={{
                    fontSize: 10,
                    fill: isDark ? "#e5e7eb" : "#374151",
                  }}
                  angle={-30}
                  textAnchor="end"
                />
                <YAxis
                  tick={{
                    fontSize: 10,
                    fill: isDark ? "#e5e7eb" : "#374151",
                  }}
                />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="total"
                  name="Gasto familiar"
                  radius={4}
                  fill={isDark ? "#38bdf8" : "#0ea5e9"}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="h-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-2 text-xs font-semibold">
            Ingresos vs gastos familiares por día
          </h3>
          {chartDataLinea.length === 0 ? (
            <p className="text-xs text-gray-500">
              Aún no hay movimientos suficientes para la gráfica.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartDataLinea}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="dateLabel"
                  tick={{
                    fontSize: 10,
                    fill: isDark ? "#e5e7eb" : "#374151",
                  }}
                />
                <YAxis
                  tick={{
                    fontSize: 10,
                    fill: isDark ? "#e5e7eb" : "#374151",
                  }}
                />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="ingresos"
                  name="Ingresos"
                  dot={false}
                  stroke={isDark ? "#22c55e" : "#16a34a"}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="gastos"
                  name="Gastos"
                  dot={false}
                  stroke={isDark ? "#fb7185" : "#ef4444"}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Barras por categoría y por persona */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 text-sm font-semibold">
            Detalle de gastos familiares por categoría
          </h2>
          {gastosPorCategoria.length === 0 ? (
            <p className="text-xs text-gray-500">
              Aún no hay gastos registrados.
            </p>
          ) : (
            <div className="space-y-2">
              {gastosPorCategoria.map((item) => (
                <div key={item.category} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>{item.category}</span>
                    <span>
                      {formatMoney(item.total)}{" "}
                      <span className="text-gray-400">
                        ({item.percent.toFixed(1)}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-gray-200 dark:bg-slate-700">
                    <div
                      className="h-2 rounded bg-sky-500"
                      style={{
                        width: `${Math.max(item.percent, 2)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 text-sm font-semibold">
            Gastos familiares por persona
          </h2>
          {gastosPorPersona.length === 0 ? (
            <p className="text-xs text-gray-500">
              Aún no hay gastos familiares con el campo “Quién generó”
              registrado.
            </p>
          ) : (
            <div className="space-y-2">
              {gastosPorPersona.map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>{item.label}</span>
                    <span>
                      {formatMoney(item.total)}{" "}
                      <span className="text-gray-400">
                        ({item.percent.toFixed(1)}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-gray-200 dark:bg-slate-700">
                    <div
                      className="h-2 rounded bg-emerald-500"
                      style={{
                        width: `${Math.max(item.percent, 2)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
            Estos montos consideran sólo los{" "}
            <span className="font-semibold">gastos</span> del mes actual y usan
            el campo <span className="font-semibold">“Quién generó”</span> en
            tus movimientos. Es ideal para ver quién está gastando más dentro
            de la familia.
          </p>
        </div>
      </section>

      {/* Actividad reciente */}
      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-semibold">
          Actividad reciente de la familia
        </h2>
        {loadingTx ? (
          <p className="text-xs text-slate-500">Cargando movimientos...</p>
        ) : recentActivity.length === 0 ? (
          <p className="text-xs text-slate-500">
            Aún no hay actividad en este mes.
          </p>
        ) : (
          <ul className="space-y-2 text-xs">
            {recentActivity.map((t) => (
              <li
                key={t.id}
                className="flex items-start justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40"
              >
                <div className="flex flex-col">
                  <span className="text-[11px] text-slate-500">
                    {formatDateDisplay(t.date)}
                  </span>
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {t.type === "ingreso" ? "Ingreso" : "Gasto"} · {t.category}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-300">
                    {t.spender_label
                      ? `Generó: ${t.spender_label}`
                      : "Generó: (sin etiqueta)"}
                  </span>
                  {t.notes && (
                    <span className="mt-1 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-300">
                      {t.notes}
                    </span>
                  )}
                </div>
                <div className="ml-3 flex flex-col items-end">
                  <span
                    className={`text-sm font-semibold ${
                      t.type === "ingreso"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {formatMoney(t.amount)}
                  </span>
                  <span className="mt-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {t.method}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {txError && (
          <p className="mt-2 text-[11px] text-rose-500">{txError}</p>
        )}
      </section>
    </main>
  );
}
