"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
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
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppHeader } from "@/components/AppHeader";

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
};

type Asset = {
  id: string;
  name: string;
  category: string | null;
  current_value: number | null;
  owner: string | null;
  notes: string | null;
  created_at?: string;
};

type Debt = {
  id: string;
  name: string;
  type: string;
  total_amount: number;
  current_balance: number | null;
  notes: string | null;
  created_at?: string;
};

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

export default function HomeDashboardPage() {
  // ---------- AUTH ----------
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  // ---------- ESTADO PRINCIPAL ----------
  const [month, setMonth] = useState<string>(() => getCurrentMonthKey());
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPatrimonio, setLoadingPatrimonio] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Presupuesto (por ahora localStorage)
  const [budget, setBudget] = useState<number | null>(null);

  // Tema (para gráficas)
  const { theme, systemTheme } = useTheme();
  const [mountedTheme, setMountedTheme] = useState(false);
  useEffect(() => setMountedTheme(true), []);
  const currentTheme = theme === "system" ? systemTheme : theme;
  const isDark = mountedTheme && currentTheme === "dark";

  // =========================================================
  //  AUTH EFFECT
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
        console.error("Error en login", error);
        setAuthError(error.message);
        return;
      }
      setAuthEmail("");
      setAuthPassword("");
    } catch {
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
    } catch {
      setAuthError("No se pudo crear la cuenta.");
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setTransactions([]);
      setAssets([]);
      setDebts([]);
      setBudget(null);
    } catch (err) {
      console.error("Error cerrando sesión", err);
    }
  };

  // =========================================================
  //  CARGAR TRANSACCIONES DEL MES
  // =========================================================
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      return;
    }

    const userId = user.id;

    async function load() {
      setLoading(true);
      setError(null);

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
          .select("*")
          .eq("user_id", userId)
          .gte("date", from)
          .lte("date", to)
          .order("date", { ascending: false });

        if (error) throw error;

        setTransactions(
          (data ?? []).map((t: any) => ({
            id: t.id,
            date: t.date,
            type: t.type,
            category: t.category,
            amount: Number(t.amount),
            method: t.method,
            notes: t.notes,
          }))
        );
      } catch (err) {
        console.error(err);
        setError("No se pudieron cargar los movimientos.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [month, user]);

  // =========================================================
  //  CARGAR PATRIMONIO (ACTIVOS + DEUDAS)
  // =========================================================
  useEffect(() => {
    if (!user) {
      setAssets([]);
      setDebts([]);
      return;
    }
    const userId = user.id;

    async function loadPatrimonio() {
      setLoadingPatrimonio(true);

      try {
        const [assetsRes, debtsRes] = await Promise.all([
          supabase
            .from("assets")
            .select(
              "id,name,category,current_value,owner,notes,created_at"
            )
            .eq("user_id", userId),
          supabase
            .from("debts")
            .select(
              "id,name,type,total_amount,current_balance,notes,created_at"
            )
            .eq("user_id", userId),
        ]);

        if (assetsRes.error) {
          console.warn("Error cargando activos", assetsRes.error);
        } else {
          setAssets((assetsRes.data ?? []) as Asset[]);
        }

        if (debtsRes.error) {
          console.warn("Error cargando deudas", debtsRes.error);
        } else {
          setDebts((debtsRes.data ?? []) as Debt[]);
        }
      } catch (err) {
        console.error("Error cargando patrimonio en dashboard", err);
      } finally {
        setLoadingPatrimonio(false);
      }
    }

    loadPatrimonio();
  }, [user]);

  // =========================================================
  //  PRESUPUESTO DEL MES (LOCALSTORAGE)
  // =========================================================
  useEffect(() => {
    const key = `ff-budget-${month}`;
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(key) : null;
    if (raw) {
      const val = Number(raw);
      setBudget(Number.isFinite(val) ? val : null);
    } else {
      setBudget(null);
    }
  }, [month]);

  // =========================================================
  //  CÁLCULOS
  // =========================================================
  const { totalIngresos, totalGastos } = useMemo(() => {
    let ingresos = 0;
    let gastos = 0;
    for (const t of transactions) {
      if (t.type === "ingreso") ingresos += t.amount;
      else gastos += t.amount;
    }
    return { totalIngresos: ingresos, totalGastos: gastos };
  }, [transactions]);

  const flujo = totalIngresos - totalGastos;
  const disponible = budget != null ? budget - totalGastos : null;

  const totalActivos = useMemo(
    () => assets.reduce((sum, a) => sum + (a.current_value ?? 0), 0),
    [assets]
  );

  const totalDeudas = useMemo(
    () =>
      debts.reduce(
        (sum, d) =>
          sum + Number(d.current_balance ?? d.total_amount ?? 0),
        0
      ),
    [debts]
  );

  const patrimonioNeto = totalActivos - totalDeudas;

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
    const totalGastosMes = entries.reduce((sum, e) => sum + e.total, 0);
    return entries.slice(0, 5).map((e) => ({
      ...e,
      percent: totalGastosMes ? (e.total * 100) / totalGastosMes : 0,
    }));
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
    const arr = Array.from(map.values());
    arr.sort((a, b) => (a.date < b.date ? -1 : 1));
    return arr.map((d) => ({
      ...d,
      dateLabel: formatDateDisplay(d.date),
    }));
  }, [transactions]);

  const lastTransactions = useMemo(
    () => transactions.slice(0, 5),
    [transactions]
  );

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-");
    const date = new Date(Number(y), Number(m) - 1, 1);
    const raw = date.toLocaleDateString("es-MX", {
      year: "numeric",
      month: "long",
    });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [month]);

  // =========================================================
  //  UI: AUTH
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">Finanzas familiares</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tu panel para controlar gastos, ingresos y patrimonio.
              </p>
            </div>
            <ThemeToggle />
          </div>

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
  //  UI: DASHBOARD PRINCIPAL
  // =========================================================
  return (
    <main className="flex flex-1 flex-col gap-4">
      <AppHeader
        title="Finanzas familiares – Dashboard"
        subtitle="Resumen rápido de tus gastos, ingresos y patrimonio. Desde aquí te vas a las secciones de captura."
        activeTab="dashboard"
        userEmail={user.email}
        onSignOut={handleSignOut}
      />

      {/* Selector de mes + navegación rápida */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-300">
              Mes que se está analizando
            </div>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                {monthLabel}
              </span>
            </div>
          </div>

          {/* Navegación rápida (mobile: botones full-width) */}
          <div className="flex w-full flex-col gap-2 text-[11px] sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
            <Link
              href="/gastos"
              className="w-full rounded-full bg-sky-500 px-3 py-1 text-center font-medium text-white hover:bg-sky-600 sm:w-auto"
            >
              Capturar gastos / ingresos
            </Link>
            <Link
              href="/patrimonio"
              className="w-full rounded-full bg-emerald-500 px-3 py-1 text-center font-medium text-white hover:bg-emerald-600 sm:w-auto"
            >
              Ver / editar patrimonio
            </Link>
            <Link
              href="/aprende"
              className="w-full rounded-full bg-amber-500 px-3 py-1 text-center font-medium text-white hover:bg-amber-600 sm:w-auto"
            >
              Aprender finanzas
            </Link>
            <Link
              href="/familia"
              className="w-full rounded-full bg-indigo-500 px-3 py-1 text-center font-medium text-white hover:bg-indigo-600 sm:w-auto"
            >
              Gestionar familia
            </Link>
            <Link
              href="/familia/dashboard"
              className="w-full rounded-full bg-slate-900 px-3 py-1 text-center font-medium text-white hover:bg-black dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white sm:w-auto"
            >
              Dashboard familiar
            </Link>
          </div>
        </div>
      </section>

      {/* Tarjetas resumen principales */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex min-h-[110px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-gray-500 dark:text-gray-300">
            Ingresos del mes
          </div>
          <div className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">
            {formatMoney(totalIngresos)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Todo lo que ha entrado en este mes.
          </p>
        </div>

        <div className="flex min-h-[110px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-gray-500 dark:text-gray-300">
            Gastos del mes
          </div>
          <div className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight text-rose-600 dark:text-rose-400">
            {formatMoney(totalGastos)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Suma de todos tus egresos registrados.
          </p>
        </div>

        <div className="flex min-h-[110px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-gray-500 dark:text-gray-300">
            Flujo del mes (Ingresos - Gastos)
          </div>
          <div
            className={`mt-1 text-2xl md:text-3xl font-semibold tracking-tight ${
              flujo >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {formatMoney(flujo)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Si es negativo te estás comiendo ahorros o deuda.
          </p>
        </div>

        <div className="flex min-h-[110px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-gray-500 dark:text-gray-300">
            Patrimonio neto estimado
          </div>
          <div
            className={`mt-1 text-2xl md:text-3xl font-semibold tracking-tight ${
              patrimonioNeto >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {formatMoney(patrimonioNeto)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Activos ({formatMoney(totalActivos)}) – Deudas (
            {formatMoney(totalDeudas)}).
          </p>
        </div>
      </section>

      {/* Gráficas principales */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="h-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-2 text-xs font-semibold">
            Top gastos por categoría
          </h3>
          {chartDataCategorias.length === 0 ? (
            <p className="text-xs text-gray-500">
              Aún no hay gastos registrados este mes.
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
                  name="Gasto"
                  radius={4}
                  fill={isDark ? "#38bdf8" : "#0ea5e9"}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="h-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-2 text-xs font-semibold">
            Ingresos vs gastos por día
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

      {/* Últimos movimientos + mini resumen patrimonio */}
      <section className="grid gap-4 md:grid-cols-2">
        {/* Últimos movimientos */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Últimos movimientos</h2>
            <Link
              href="/gastos"
              className="text-[11px] text-sky-600 hover:underline"
            >
              Ver todos en Gastos e ingresos →
            </Link>
          </div>
          {loading ? (
            <p className="text-xs text-gray-500">Cargando movimientos...</p>
          ) : lastTransactions.length === 0 ? (
            <p className="text-xs text-gray-500">
              No tienes movimientos en este mes.
            </p>
          ) : (
            <ul className="space-y-2 text-xs">
              {lastTransactions.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                >
                  <div>
                    <div className="font-medium">
                      {t.type === "ingreso" ? "Ingreso" : "Gasto"} •{" "}
                      {t.category}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {formatDateDisplay(t.date)} · {t.method}
                      {t.notes ? ` · ${t.notes}` : ""}
                    </div>
                  </div>
                  <div
                    className={`text-sm font-semibold ${
                      t.type === "ingreso"
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }`}
                  >
                    {formatMoney(t.amount)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Mini resumen patrimonio */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Patrimonio rápido (activos y deudas)
            </h2>
            <Link
              href="/patrimonio"
              className="text-[11px] text-sky-600 hover:underline"
            >
              Ver detalle en Patrimonio →
            </Link>
          </div>
          {loadingPatrimonio ? (
            <p className="text-xs text-gray-500">Cargando patrimonio...</p>
          ) : (
            <>
              <div className="grid gap-3 text-xs md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Activos totales
                  </div>
                  <div className="mt-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatMoney(totalActivos)}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Deudas totales
                  </div>
                  <div className="mt-1 text-sm font-semibold text-rose-600 dark:text-rose-400">
                    {formatMoney(totalDeudas)}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Patrimonio neto
                  </div>
                  <div
                    className={`mt-1 text-sm font-semibold ${
                      patrimonioNeto >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {formatMoney(patrimonioNeto)}
                  </div>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                Revisa y edita activos / deudas en la sección{" "}
                <span className="font-medium">Patrimonio</span>. Aquí sólo ves
                el resumen rápido.
              </p>
            </>
          )}
        </div>
      </section>

      {error && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </section>
      )}
    </main>
  );
}
