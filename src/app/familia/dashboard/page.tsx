"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";
import { useTheme } from "next-themes";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

export const dynamic = "force-dynamic";

type FamilyContext = {
  familyId: string;
  familyName: string;
  ownerUserId: string;
  memberId: string;
  role: "owner" | "member";
};

type TxRow = {
  id: string;
  date: string;
  type: "ingreso" | "gasto";
  amount: number;
  category: string | null;
  method: string | null;
  spender_label: string | null;
  owner_user_id: string | null;
};

type Asset = {
  id: string;
  current_value: number | null;
  owner: string | null;
  category: string | null;
};

type Debt = {
  id: string;
  total_amount: number | null;
  current_balance: number | null;
  monthly_payment: number | null;
  owner: string | null;
  category: string | null;
};

function formatMoney(num: number) {
  return num.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  });
}

function getCurrentMonthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function FamilyDashboardPage() {
  // -------- AUTH --------
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // -------- FAMILY CONTEXT --------
  const [familyCtx, setFamilyCtx] = useState<FamilyContext | null>(null);
  const [familyCtxLoading, setFamilyCtxLoading] = useState(false);
  const [familyCtxError, setFamilyCtxError] = useState<string | null>(null);

  // -------- THEME (para gráficas) --------
  const { theme, systemTheme } = useTheme();
  const [mountedTheme, setMountedTheme] = useState(false);

  useEffect(() => {
    setMountedTheme(true);
  }, []);

  const currentTheme = theme === "system" ? systemTheme : theme;
  const isDark = mountedTheme && currentTheme === "dark";

  // -------- MES SELECCIONADO --------
  const [month, setMonth] = useState<string>(() => getCurrentMonthKey());
  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-");
    const date = new Date(Number(y), Number(m) - 1, 1);
    const raw = date.toLocaleDateString("es-MX", {
      year: "numeric",
      month: "long",
    });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [month]);

  // -------- DATA DASHBOARD --------
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [dashError, setDashError] = useState<string | null>(null);

  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);

  // ==================================================
  //  AUTH
  // ==================================================
  useEffect(() => {
    let ignore = false;

    async function loadUser() {
      setAuthLoading(true);
      setAuthError(null);
      try {
        const { data, error } = await supabase.auth.getUser();

        if (error && (error as any).name !== "AuthSessionMissingError") {
          console.error("Error obteniendo usuario actual", error);
          if (!ignore) setAuthError("Hubo un problema al cargar tu sesión.");
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

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setFamilyCtx(null);
      setTransactions([]);
      setAssets([]);
      setDebts([]);
    } catch (err) {
      console.error("Error cerrando sesión", err);
    }
  };

  // ==================================================
  //  FAMILY CONTEXT (families + family_members)
  // ==================================================
  useEffect(() => {
    if (!user) {
      setFamilyCtx(null);
      return;
    }

    const loadFamilyCtx = async () => {
      setFamilyCtxLoading(true);
      setFamilyCtxError(null);

      try {
        const { data: memberRows, error: memberError } = await supabase
          .from("family_members")
          .select("id,family_id,role,status")
          .eq("user_id", user.id)
          .eq("status", "active")
          .limit(1);

        if (memberError) throw memberError;

        if (!memberRows || memberRows.length === 0) {
          // No pertenece a ninguna familia -> dashboard funciona pero sólo con sus datos
          setFamilyCtx(null);
          return;
        }

        const member = memberRows[0];

        const { data: fam, error: famError } = await supabase
          .from("families")
          .select("id,name,user_id")
          .eq("id", member.family_id)
          .single();

        if (famError) throw famError;

        setFamilyCtx({
          familyId: fam.id,
          familyName: fam.name,
          ownerUserId: fam.user_id,
          memberId: member.id,
          role: member.role as "owner" | "member",
        });
      } catch (err: any) {
        console.error("Error cargando contexto de familia", err);
        setFamilyCtxError("No se pudo cargar la información de familia.");
        setFamilyCtx(null);
      } finally {
        setFamilyCtxLoading(false);
      }
    };

    loadFamilyCtx();
  }, [user]);

  const isFamilyOwner =
    !!familyCtx && !!user && familyCtx.ownerUserId === user.id;

  // ==================================================
  //  CARGAR DATOS DEL DASHBOARD
  // ==================================================
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      setAssets([]);
      setDebts([]);
      return;
    }

    const loadDashboard = async () => {
      setLoadingDashboard(true);
      setDashError(null);

      try {
        const ownerUserId = familyCtx?.ownerUserId ?? user.id;

        // Rango de fechas del mes
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

        // 1) Movimientos de la familia (todos los que tengan owner_user_id = ownerUserId)
        const { data: txData, error: txError } = await supabase
          .from("transactions")
          .select(
            "id,date,type,amount,category,method,spender_label,owner_user_id"
          )
          .gte("date", from)
          .lte("date", to)
          .eq("owner_user_id", ownerUserId)
          .order("date", { ascending: false });

        if (txError) throw txError;

        setTransactions(
          (txData ?? []).map((t: any) => ({
            id: t.id,
            date: t.date,
            type: t.type,
            amount: Number(t.amount),
            category: t.category,
            method: t.method,
            spender_label: t.spender_label,
            owner_user_id: t.owner_user_id,
          }))
        );

        // 2) Activos y deudas del owner (por ahora patrimonio se captura desde el dueño)
        const { data: assetsData, error: assetsError } = await supabase
          .from("assets")
          .select("id,current_value,owner,category")
          .eq("user_id", ownerUserId);

        if (assetsError) throw assetsError;

        const { data: debtsData, error: debtsError } = await supabase
          .from("debts")
          .select("id,total_amount,current_balance,monthly_payment,owner,category")
          .eq("user_id", ownerUserId);

        if (debtsError) throw debtsError;

        setAssets((assetsData ?? []) as Asset[]);
        setDebts((debtsData ?? []) as Debt[]);
      } catch (err: any) {
        console.error("Error cargando dashboard familiar:", err);
        setDashError("No se pudo cargar el dashboard familiar.");
      } finally {
        setLoadingDashboard(false);
      }
    };

    // Sólo cargamos cuando haya user (y no necesitamos esperar a familyCtx)
    loadDashboard();
  }, [user, familyCtx, month]);

  // ==================================================
  //  MÉTRICAS CALCULADAS
  // ==================================================
  const {
    totalIngresos,
    totalGastos,
    gastosPorPersona,
    gastosPorCategoria,
  } = useMemo(() => {
    let ingresos = 0;
    let gastos = 0;

    const personaMap = new Map<string, number>();
    const catMap = new Map<string, number>();

    for (const t of transactions) {
      if (t.type === "ingreso") {
        ingresos += t.amount;
      } else {
        gastos += t.amount;

        // Por persona
        const persona = t.spender_label || "Sin etiqueta";
        personaMap.set(persona, (personaMap.get(persona) ?? 0) + t.amount);

        // Por categoría
        const cat = t.category || "SIN_CATEGORIA";
        catMap.set(cat, (catMap.get(cat) ?? 0) + t.amount);
      }
    }

    const personaArr = Array.from(personaMap.entries()).map(
      ([label, total]) => ({ label, total })
    );
    personaArr.sort((a, b) => b.total - a.total);

    const catArr = Array.from(catMap.entries()).map(([category, total]) => ({
      category,
      total,
    }));
    catArr.sort((a, b) => b.total - a.total);

    const totalGastosMes = gastos || 0;

    const personaWithPercent = personaArr.map((p) => ({
      ...p,
      percent: totalGastosMes
        ? Number(((p.total * 100) / totalGastosMes).toFixed(1))
        : 0,
    }));

    const catWithPercent = catArr.map((c) => ({
      ...c,
      percent: totalGastosMes
        ? Number(((c.total * 100) / totalGastosMes).toFixed(1))
        : 0,
    }));

    return {
      totalIngresos: ingresos,
      totalGastos: gastos,
      gastosPorPersona: personaWithPercent,
      gastosPorCategoria: catWithPercent,
    };
  }, [transactions]);

  const flujoMes = totalIngresos - totalGastos;

  const {
    totalActivos,
    totalDeudas,
    patrimonioNeto,
    pagoMensualDeudas,
  } = useMemo(() => {
    const activos = assets.reduce(
      (sum, a) => sum + Number(a.current_value ?? 0),
      0
    );

    const deudas = debts.reduce(
      (sum, d) => sum + Number(d.current_balance ?? d.total_amount ?? 0),
      0
    );

    const pagoMensual = debts.reduce(
      (sum, d) => sum + Number(d.monthly_payment ?? 0),
      0
    );

    return {
      totalActivos: activos,
      totalDeudas: deudas,
      patrimonioNeto: activos - deudas,
      pagoMensualDeudas: pagoMensual,
    };
  }, [assets, debts]);

  const chartDataPersonas = useMemo(
    () =>
      gastosPorPersona.map((p) => ({
        persona: p.label,
        total: p.total,
      })),
    [gastosPorPersona]
  );

  const chartDataCategorias = useMemo(
    () =>
      gastosPorCategoria.map((c) => ({
        category: c.category,
        total: c.total,
      })),
    [gastosPorCategoria]
  );

  const smartSummary = useMemo(() => {
    const lines: string[] = [];

    if (!transactions.length) {
      lines.push(
        "Todavía no hay movimientos este mes con etiqueta familiar. Empieza a registrar gastos en modo familia para ver el resumen."
      );
      return lines;
    }

    if (totalIngresos > 0) {
      const ratio = (totalGastos * 100) / totalIngresos;
      lines.push(
        `La familia ha gastado el ${ratio.toFixed(
          1
        )}% de los ingresos registrados en ${monthLabel}.`
      );

      if (ratio > 90) {
        lines.push(
          "Están muy cerca de gastar todo lo que ingresaron. Puede ser buen momento para frenar gastos variables."
        );
      } else if (ratio > 70) {
        lines.push(
          "El nivel de gasto es alto pero aún tienen algo de margen. Vale la pena revisar en qué se está concentrando el gasto."
        );
      } else if (ratio < 50) {
        lines.push(
          "Van muy bien: están gastando menos de la mitad de los ingresos del mes."
        );
      }
    } else if (totalGastos > 0) {
      lines.push(
        "Sólo se han registrado gastos, pero ningún ingreso familiar. Revisa si falta capturar sueldos o ingresos principales."
      );
    }

    if (gastosPorPersona.length > 0) {
      const top = gastosPorPersona[0];
      lines.push(
        `La persona con más gasto es "${top.label}" con ${formatMoney(
          top.total
        )} (${top.percent}% del gasto familiar).`
      );
    }

    if (gastosPorCategoria.length > 0) {
      const topCat = gastosPorCategoria[0];
      lines.push(
        `La categoría con más gasto es "${topCat.category}" con ${formatMoney(
          topCat.total
        )} (${topCat.percent}% del total).`
      );
    }

    if (patrimonioNeto >= 0) {
      lines.push(
        `El patrimonio neto familiar es positivo: ${formatMoney(
          patrimonioNeto
        )}.`
      );
    } else {
      lines.push(
        `El patrimonio neto familiar es negativo: ${formatMoney(
          patrimonioNeto
        )}. Conviene revisar activos y deudas.`
      );
    }

    if (pagoMensualDeudas > 0) {
      lines.push(
        `La carga fija mensual por deudas es de ${formatMoney(
          pagoMensualDeudas
        )}.`
      );
    }

    return lines;
  }, [
    transactions,
    totalIngresos,
    totalGastos,
    gastosPorPersona,
    gastosPorCategoria,
    patrimonioNeto,
    pagoMensualDeudas,
    monthLabel,
  ]);

  // ==================================================
  //  UI ESTADOS BÁSICOS
  // ==================================================
  if (authLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-sm text-slate-600 dark:text-slate-300">
        Cargando sesión...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-sm text-slate-600 dark:text-slate-300">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-semibold">Dashboard familiar</p>
          <p className="text-slate-500 dark:text-slate-400">
            Inicia sesión desde el dashboard principal para ver el resumen
            familiar.
          </p>
          {authError && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400">
              {authError}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ==================================================
  //  RENDER DASHBOARD
  // ==================================================
  return (
    <main className="flex flex-1 flex-col gap-4">
      <AppHeader
        title="Dashboard familiar"
        subtitle="Vista consolidada de ingresos, gastos y patrimonio de la familia."
        activeTab="familia"
        userEmail={user.email ?? ""}
        onSignOut={handleSignOut}
      />

      {/* Encabezado: mes + info familia */}
      <section className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="space-y-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Mes analizado
            </div>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                {monthLabel}
              </span>
            </div>
          </div>

          <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
            {familyCtxLoading && (
              <p>Cargando información de familia...</p>
            )}
            {familyCtx && (
              <>
                <p>
                  Familia:{" "}
                  <span className="font-semibold">
                    {familyCtx.familyName}
                  </span>{" "}
                  {isFamilyOwner ? "(jefe de familia)" : "(miembro)"}
                </p>
                {!isFamilyOwner && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-300">
                    Nota: este dashboard se basa en movimientos donde el dueño
                    financiero es el jefe de familia.
                  </p>
                )}
              </>
            )}
            {!familyCtx && !familyCtxLoading && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Aún no tienes una familia configurada. Este dashboard se basa
                sólo en los movimientos donde tú eres el dueño financiero.
              </p>
            )}
            {familyCtxError && (
              <p className="text-[11px] text-rose-500">
                {familyCtxError}
              </p>
            )}
          </div>
        </div>

        <div
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] ${
            loadingDashboard
              ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {loadingDashboard ? "Actualizando datos..." : "Datos al día"}
        </div>
      </section>

      {/* Tarjetas principales */}
      <section className="grid gap-4 md:grid-cols-4">
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-slate-500 dark:text-slate-400">
            Ingresos familiares del mes
          </span>
          <span className="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            {formatMoney(totalIngresos)}
          </span>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-slate-500 dark:text-slate-400">
            Gastos familiares del mes
          </span>
          <span className="mt-1 text-2xl font-semibold text-rose-600 dark:text-rose-400">
            {formatMoney(totalGastos)}
          </span>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-slate-500 dark:text-slate-400">
            Flujo del mes (Ingresos - Gastos)
          </span>
          <span
            className={`mt-1 text-2xl font-semibold ${
              flujoMes >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {formatMoney(flujoMes)}
          </span>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-slate-500 dark:text-slate-400">
            Costo fijo mensual de deudas
          </span>
          <span className="mt-1 text-2xl font-semibold text-amber-600 dark:text-amber-400">
            {formatMoney(pagoMensualDeudas)}
          </span>
        </div>
      </section>

      {/* Patrimonio */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-slate-500 dark:text-slate-400">
            Activos familiares
          </div>
          <div className="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            {formatMoney(totalActivos)}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Casas, autos, ahorros, inversiones y otros activos registrados por
            el jefe de familia.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-slate-500 dark:text-slate-400">
            Deudas familiares
          </div>
          <div className="mt-1 text-2xl font-semibold text-rose-600 dark:text-rose-400">
            {formatMoney(totalDeudas)}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Hipotecas, autos, tarjetas y demás deudas registradas.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-slate-500 dark:text-slate-400">
            Patrimonio neto familiar
          </div>
          <div
            className={`mt-1 text-2xl font-semibold ${
              patrimonioNeto >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {formatMoney(patrimonioNeto)}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Activos menos deudas, a nivel familia.
          </p>
        </div>
      </section>

      {/* Resumen inteligente */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-semibold">
          Resumen inteligente familiar
        </h2>
        {smartSummary.length === 0 ? (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Aún no hay suficiente información para generar un resumen.
          </p>
        ) : (
          <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed">
            {smartSummary.map((line, idx) => (
              <li key={idx}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      {/* Gráficas: por persona y por categoría */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="h-72 rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-2 text-xs font-semibold">
            Gastos por persona (familia)
          </h3>
          {chartDataPersonas.length === 0 ? (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Aún no hay gastos etiquetados por persona.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartDataPersonas}
                margin={{ top: 10, right: 10, left: 0, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="persona"
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

        <div className="h-72 rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-2 text-xs font-semibold">
            Gastos familiares por categoría
          </h3>
          {chartDataCategorias.length === 0 ? (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Aún no hay gastos registrados con categorías.
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
                  fill={isDark ? "#22c55e" : "#16a34a"}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Tabla resumen por persona */}
      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-semibold">
          Resumen de gasto por persona
        </h2>
        {gastosPorPersona.length === 0 ? (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Cuando registres gastos con etiquetas de “Quién generó”, aquí verás
            cuánto gasta cada miembro.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-[11px]">
              <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-200">
                <tr>
                  <th className="border-b border-slate-200 px-2 py-1 text-left dark:border-slate-700">
                    Persona
                  </th>
                  <th className="border-b border-slate-200 px-2 py-1 text-right dark:border-slate-700">
                    Gasto total
                  </th>
                  <th className="border-b border-slate-200 px-2 py-1 text-right dark:border-slate-700">
                    % del total
                  </th>
                </tr>
              </thead>
              <tbody>
                {gastosPorPersona.map((p) => (
                  <tr
                    key={p.label}
                    className="odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-800"
                  >
                    <td className="border-b border-slate-100 px-2 py-1 dark:border-slate-700">
                      {p.label}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-1 text-right dark:border-slate-700">
                      {formatMoney(p.total)}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-1 text-right dark:border-slate-700">
                      {p.percent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {dashError && (
          <p className="mt-2 text-[11px] text-rose-500 dark:text-rose-300">
            {dashError}
          </p>
        )}
      </section>
    </main>
  );
}
