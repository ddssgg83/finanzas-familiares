// src/app/familia/objetivos/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { useTheme } from "next-themes";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

type FamilyGoalStatus =
  | "pendiente"
  | "en_progreso"
  | "completado"
  | "pausado"
  | "cancelado";

type FamilyGoal = {
  id: string;
  family_group_id?: string | null;
  owner_user_id?: string | null;
  name: string;
  description?: string | null;
  target_amount: number;
  current_amount?: number | null;
  due_date?: string | null;
  type?: string | null;
  status?: FamilyGoalStatus | string | null;
  category?: string | null;
  icon?: string | null;
  color?: string | null;
  auto_track?: boolean | null;
  track_direction?: "ingresos" | "ahorros" | "gastos_reducidos" | null;
  track_category?: string | null;
  created_at?: string;
  updated_at?: string;
};

type TxType = "ingreso" | "gasto";

type Tx = {
  id: string;
  date: string;
  type: TxType;
  category: string;
  amount: number;
  goal_id?: string | null;
  track_category?: string | null;
};

type GoalWithProgress = FamilyGoal & {
  totalContributed: number;
  progressPct: number;
};

function formatCurrency(monto: number): string {
  return monto.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "Sin fecha límite";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Sin fecha límite";
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Componente pequeño para progreso circular tipo Apple/Activity
function GoalProgressCircle({ progress }: { progress: number }) {
  const pct = Math.max(0, Math.min(progress, 120)); // limitamos a 120%
  const normalized = Math.min(progress, 100);

  return (
    <div className="relative h-14 w-14">
      <div
        className="h-full w-full rounded-full border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900"
        style={{
          backgroundImage: `conic-gradient(#22c55e ${normalized}%, transparent ${normalized}%)`,
        }}
      />
      <div className="absolute inset-1 flex items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-800 dark:bg-slate-950 dark:text-slate-50">
        {normalized.toFixed(0)}%
      </div>
    </div>
  );
}

export default function FamilyGoalsPage() {
  const { theme } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [goals, setGoals] = useState<FamilyGoal[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;
        if (!user) {
          setError("No se encontró el usuario. Inicia sesión de nuevo.");
          setLoading(false);
          return;
        }

        setUser(user);

        let familyGroupId: string | null = null;

        // Igual que en el dashboard: intentamos usar profiles pero no tronamos si no existe
        try {
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("id, family_group_id")
            .eq("id", user.id)
            .maybeSingle();

          if (!profileError && profile) {
            familyGroupId = profile.family_group_id ?? null;
          }
        } catch (innerErr) {
          console.warn(
            "No se pudo leer profiles para objetivos, se usa modo individual."
          );
        }

        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString();

        let goalsQuery = supabase.from("family_goals").select("*").order("created_at", { ascending: true });
        let txsQuery = supabase
          .from("transactions")
          .select("id, date, type, category, amount, goal_id")
          .gte("date", startOfYear);

        if (familyGroupId) {
          goalsQuery = goalsQuery.eq("family_group_id", familyGroupId);
          txsQuery = txsQuery.eq("family_group_id", familyGroupId);
        } else {
          goalsQuery = goalsQuery.eq("owner_user_id", user.id);
          txsQuery = txsQuery.eq("user_id", user.id);
        }

        const [
          { data: goalsData, error: goalsError },
          { data: txsData, error: txsError },
        ] = await Promise.all([goalsQuery, txsQuery]);

        if (goalsError) throw goalsError;
        if (txsError) throw txsError;

        setGoals((goalsData || []) as FamilyGoal[]);
        setTxs((txsData || []) as Tx[]);
      } catch (err: any) {
        console.error("Error cargando metas familiares:", err);
        setError(
          err?.message ||
            "Ocurrió un error al cargar las metas familiares. Intenta de nuevo."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const goalsWithProgress: GoalWithProgress[] = useMemo(() => {
    if (!goals.length) return [];

    return goals.map((goal) => {
      const target = goal.target_amount || 0;

      const relatedTxs = txs.filter((tx) => {
        const byGoalId = tx.goal_id === goal.id;
        const byCategory =
          goal.auto_track &&
          goal.track_category &&
          tx.category === goal.track_category;

        if (!byGoalId && !byCategory) return false;

        if (goal.track_direction === "ingresos" || goal.track_direction === "ahorros") {
          return tx.type === "ingreso";
        }
        if (goal.track_direction === "gastos_reducidos") {
          return tx.type === "gasto";
        }
        return true;
      });

      const totalContributed = relatedTxs.reduce(
        (sum, tx) => sum + (tx.amount || 0),
        0
      );

      const progressPct =
        target > 0 ? Math.min((totalContributed / target) * 100, 200) : 0;

      return {
        ...goal,
        totalContributed,
        progressPct,
      };
    });
  }, [goals, txs]);

  const isDark = theme === "dark";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <AppHeader
        title="Familia"
        subtitle="Metas familiares y planes en conjunto"
        activeTab="familia"
      />

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-10 pt-4 md:px-6 md:pt-6 lg:px-8">
        <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
              Metas familiares
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 md:text-sm">
              Define y administra los objetivos financieros de tu familia.
              Puedes ligarlos a tus movimientos para que el avance se calcule
              solo.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/familia/dashboard"
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Ver dashboard de metas
            </Link>

            <Link
              href="/familia/objetivos/nuevo"
              className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600 dark:bg-emerald-500 dark:hover:bg-emerald-600"
            >
              + Agregar objetivo
            </Link>
          </div>
        </section>

        {loading && (
          <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            Cargando metas familiares…
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {goalsWithProgress.length === 0 ? (
              <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-100">
                  Aún no tienes metas familiares.
                </p>
                <p>
                  Crea tu primera meta para vacaciones, un fondo de emergencia,
                  el enganche de una casa o cualquier objetivo importante para
                  tu familia.
                </p>
                <div className="mt-4 flex justify-center">
                  <Link
                    href="/familia/objetivos/nuevo"
                    className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                  >
                    Crear mi primera meta
                  </Link>
                </div>
              </section>
            ) : (
              <section className="grid gap-4 md:grid-cols-2">
                {goalsWithProgress.map((goal) => {
                  const normalizedProgress = Math.min(goal.progressPct, 100);
                  const overGoal = goal.progressPct >= 100;

                  let statusLabel = "Pendiente";
                  let statusClass =
                    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200";

                  if (overGoal || goal.status === "completado") {
                    statusLabel = "Completado";
                    statusClass =
                      "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
                  } else if (goal.status === "en_progreso") {
                    statusLabel = "En progreso";
                    statusClass =
                      "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300";
                  } else if (goal.status === "pausado") {
                    statusLabel = "Pausado";
                    statusClass =
                      "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
                  } else if (goal.status === "cancelado") {
                    statusLabel = "Cancelado";
                    statusClass =
                      "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
                  }

                  return (
                    <article
                      key={goal.id}
                      className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="flex items-start gap-3">
                        <GoalProgressCircle progress={goal.progressPct} />

                        <div className="flex-1">
                          <div className="mb-1 flex items-start justify-between gap-2">
                            <div>
                              <h2 className="text-sm font-semibold leading-tight">
                                {goal.name}
                              </h2>
                              {goal.category && (
                                <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                  {goal.category}
                                </p>
                              )}
                            </div>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass}`}
                            >
                              {statusLabel}
                            </span>
                          </div>

                          {goal.description && (
                            <p className="mb-2 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
                              {goal.description}
                            </p>
                          )}

                          <div className="mb-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                            <span>
                              Meta:{" "}
                              <span className="font-semibold text-slate-800 dark:text-slate-100">
                                {formatCurrency(goal.target_amount || 0)}
                              </span>
                            </span>
                            <span>
                              Aportado:{" "}
                              <span className="font-semibold text-slate-800 dark:text-slate-100">
                                {formatCurrency(goal.totalContributed || 0)}
                              </span>
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {normalizedProgress.toFixed(1)}% completado ·{" "}
                            {formatDate(goal.due_date)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <div className="flex flex-wrap gap-2">
                          {goal.auto_track && goal.track_category && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              Se actualiza con categoría:{" "}
                              <span className="font-semibold">
                                {goal.track_category}
                              </span>
                            </span>
                          )}
                          {goal.track_direction && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              Dirección:{" "}
                              <span className="font-semibold">
                                {goal.track_direction}
                              </span>
                            </span>
                          )}
                        </div>

                        <Link
                          href={`/familia/objetivos/${goal.id}/editar`}
                          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Editar
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
