// src/app/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

type MonthlySummary = {
  incomes: number;
  expenses: number;
  balance: number;
  monthLabel: string;
};

type NetWorthSummary = {
  assets: number;
  debts: number;
  netWorth: number;
};

type Goal = {
  id: string;
  title: string;
  targetAmount: number;
  deadline?: string;
  status: "en-proceso" | "completado" | "pausado";
};

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [netWorth, setNetWorth] = useState<NetWorthSummary | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  // Objetivos (por ahora solo en memoria)
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalDeadline, setGoalDeadline] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setDataError(null);

      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!cancelled) setUser(userData?.user ?? null);

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        const monthLabel = monthStart.toLocaleDateString("es-MX", {
          month: "long",
          year: "numeric",
        });

        // ---------- RESUMEN MENSUAL ----------
        try {
          const { data: txs } = await supabase
            .from("transactions")
            .select("type, amount, date")
            .gte("date", monthStart.toISOString())
            .lt("date", nextMonthStart.toISOString());

          let incomes = 0;
          let expenses = 0;

          (txs ?? []).forEach((tx: any) => {
            const amt = Number(tx.amount) || 0;
            if (tx.type === "ingreso") incomes += amt;
            if (tx.type === "gasto") expenses += amt;
          });

          if (!cancelled) {
            setSummary({
              incomes,
              expenses,
              balance: incomes - expenses,
              monthLabel,
            });
          }
        } catch (err) {
          console.warn("No se pudo cargar resumen mensual:", err);
          if (!cancelled) {
            setSummary({
              incomes: 0,
              expenses: 0,
              balance: 0,
              monthLabel,
            });
            setDataError("No se pudieron cargar algunos datos de este mes.");
          }
        }

        // ---------- VALOR PATRIMONIAL ----------
        try {
          const [assetsRes, debtsRes] = await Promise.all([
            supabase.from("assets").select("current_value"),
            supabase.from("debts").select("current_balance, total_amount"),
          ]);

          const assetsTotal = (assetsRes.data ?? []).reduce(
            (acc: number, row: any) => acc + (Number(row.current_value) || 0),
            0
          );

          const debtsTotal = (debtsRes.data ?? []).reduce(
            (acc: number, row: any) =>
              acc +
              (Number(row.current_balance ?? row.total_amount ?? 0) || 0),
            0
          );

          if (!cancelled) {
            setNetWorth({
              assets: assetsTotal,
              debts: debtsTotal,
              netWorth: assetsTotal - debtsTotal,
            });
          }
        } catch (err) {
          console.warn("No se pudo cargar patrimonio:", err);
          if (!cancelled) {
            setNetWorth({
              assets: 0,
              debts: 0,
              netWorth: 0,
            });
            setDataError("No se pudieron cargar algunos datos de patrimonio.");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const balanceTag = useMemo(() => {
    if (!summary) return null;
    const { balance } = summary;
    if (balance > 0)
      return { label: "Mes superavitario", tone: "positivo" as const };
    if (balance < 0)
      return { label: "Mes en rojo", tone: "negativo" as const };
    return { label: "Mes tablas", tone: "neutro" as const };
  }, [summary]);

  const handleAddGoal = () => {
    if (!goalTitle.trim() || !goalTarget.trim()) return;
    const amount = Number(goalTarget.replace(/,/g, "."));
    if (Number.isNaN(amount) || amount <= 0) return;

    const newGoal: Goal = {
      id: crypto.randomUUID(),
      title: goalTitle.trim(),
      targetAmount: amount,
      deadline: goalDeadline || undefined,
      status: "en-proceso",
    };

    setGoals((prev) => [newGoal, ...prev]);
    setGoalTitle("");
    setGoalTarget("");
    setGoalDeadline("");
  };

  return (
    <main className="flex min-h-screen flex-col pb-16 md:pb-4">
      <AppHeader
        title="Dashboard"
        subtitle="Una vista rápida de cómo va tu mes y tus objetivos financieros."
        activeTab="dashboard"
        userEmail={user?.email ?? undefined}
      />

      <section className="px-4 pb-4 pt-3 md:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          {/* FILA 1: Resumen mensual + patrimonio */}
          <div className="grid gap-3 md:grid-cols-[2fr,1.4fr]">
            {/* Resumen mensual */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Resumen de este mes
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {summary
                      ? `Movimientos del mes de ${summary.monthLabel}.`
                      : "Cargando movimientos recientes..."}
                  </p>
                </div>
                {balanceTag && (
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-semibold ${
                      balanceTag.tone === "positivo"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-100"
                        : balanceTag.tone === "negativo"
                        ? "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-100"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    }`}
                  >
                    {balanceTag.label}
                  </span>
                )}
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <SummaryCard
                  label="Ingresos del mes"
                  value={summary?.incomes ?? 0}
                  tone="positive"
                />
                <SummaryCard
                  label="Gastos del mes"
                  value={summary?.expenses ?? 0}
                  tone="negative"
                />
                <SummaryCard
                  label="Balance del mes"
                  value={summary?.balance ?? 0}
                  tone={
                    summary && summary.balance >= 0 ? "positive" : "negative"
                  }
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <div>
                  {dataError
                    ? dataError
                    : "Para ver el detalle por categoría, entra a “Gastos e ingresos”."}
                </div>
                <div className="flex gap-2">
                  <LinkButton href="/gastos">Ver gastos / ingresos</LinkButton>
                  <LinkButton href="/familia/dashboard">
                    Ver dashboard familiar
                  </LinkButton>
                </div>
              </div>
            </div>

            {/* Patrimonio */}
            <div className="flex flex-col gap-3">
              <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Valor patrimonial
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Suma de tus activos menos tus deudas registradas.
                </p>

                <div className="mt-3 space-y-2">
                  <SimpleRow
                    label="Activos personales"
                    value={netWorth?.assets ?? 0}
                  />
                  <SimpleRow
                    label="Deudas personales"
                    value={netWorth?.debts ?? 0}
                  />
                  <SimpleRow
                    label="Valor neto"
                    value={netWorth?.netWorth ?? 0}
                    highlight
                  />
                </div>

                <div className="mt-3 text-right">
                  <LinkButton href="/patrimonio">
                    Ver detalle de activos / deudas
                  </LinkButton>
                </div>
              </div>

              <div className="rounded-2xl border border-sky-100 bg-sky-50/80 p-3 text-[11px] shadow-sm dark:border-sky-900/50 dark:bg-sky-900/10 dark:text-slate-100">
                <p className="font-medium text-sky-800 dark:text-sky-100">
                  Tip rápido:
                </p>
                <p className="mt-1 text-slate-600 dark:text-slate-200">
                  Si este mes tu balance es positivo, decide desde hoy qué
                  porcentaje se va directo a ahorro o a bajar deudas, antes de
                  que “se pierda” en gastos chicos.
                </p>
              </div>
            </div>
          </div>

          {/* FILA 2: Objetivos */}
          <section className="grid gap-3 md:grid-cols-[1.4fr,2fr]">
            {/* Formulario de objetivo */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Define un objetivo financiero
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Puede ser ahorrar para un fondo de emergencia, pagar una deuda
                o juntar para unas vacaciones.
              </p>

              <div className="mt-3 space-y-2 text-[12px]">
                <div>
                  <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-300">
                    Nombre del objetivo
                  </label>
                  <input
                    value={goalTitle}
                    onChange={(e) => setGoalTitle(e.target.value)}
                    placeholder="Ej. Fondo de emergencia, Pagar tarjeta BBVA..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-300">
                      Monto meta (MXN)
                    </label>
                    <input
                      value={goalTarget}
                      onChange={(e) => setGoalTarget(e.target.value)}
                      placeholder="Ej. 25,000"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-300">
                      Fecha objetivo (opcional)
                    </label>
                    <input
                      type="date"
                      value={goalDeadline}
                      onChange={(e) => setGoalDeadline(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddGoal}
                  className="mt-2 w-full rounded-full bg-sky-500 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-sky-600 disabled:bg-sky-300"
                  disabled={!goalTitle.trim() || !goalTarget.trim()}
                >
                  Guardar objetivo (solo en este dispositivo)
                </button>

                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  Próximamente estos objetivos se conectarán con tus datos
                  reales de gastos y patrimonio para mostrar tu avance
                  automático.
                </p>
              </div>
            </div>

            {/* Lista de objetivos */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Tus objetivos
                </h2>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {goals.length === 0
                    ? "Empieza creando tu primer objetivo."
                    : `${goals.length} objetivo(s) activos`}
                </span>
              </div>

              {goals.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                  Aquí verás tus objetivos con su monto meta y fecha. Más
                  adelante podrás ligar cada uno a categorías específicas de
                  gastos.
                </div>
              ) : (
                <ul className="mt-3 space-y-2 text-[12px]">
                  {goals.map((goal) => (
                    <li
                      key={goal.id}
                      className="flex items-start justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                    >
                      <div>
                        <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-100">
                          {goal.title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Meta:{" "}
                          <span className="font-medium">
                            {goal.targetAmount.toLocaleString("es-MX", {
                              style: "currency",
                              currency: "MXN",
                              maximumFractionDigits: 0,
                            })}
                          </span>
                          {goal.deadline &&
                            ` · Para: ${new Date(
                              goal.deadline
                            ).toLocaleDateString("es-MX")}`}
                        </p>
                      </div>
                      <span className="mt-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-100">
                        En proceso
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

// ---------- Subcomponentes simples ----------

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "positive" | "negative";
}) {
  const isPositive = tone === "positive";
  const formatted = value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <p className="text-slate-500 dark:text-slate-400">{label}</p>
      <p
        className={`mt-1 text-base font-semibold ${
          isPositive
            ? "text-emerald-600 dark:text-emerald-300"
            : "text-rose-600 dark:text-rose-300"
        }`}
      >
        {formatted}
      </p>
    </div>
  );
}

function SimpleRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  const formatted = value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });

  return (
    <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
      <span>{label}</span>
      <span
        className={`font-semibold ${
          highlight ? "text-sky-700 dark:text-sky-300" : ""
        }`}
      >
        {formatted}
      </span>
    </div>
  );
}

function LinkButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
    >
      {children}
    </a>
  );
}
