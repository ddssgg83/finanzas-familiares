// src/app/familia/objetivos/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";
import { PageShell } from "@/components/ui/PageShell";

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

  // compatibilidad (por si tu tabla trae estos campos)
  owner_user_id?: string | null;
  created_by?: string | null;
  family_group_id?: string | null;
  user_id?: string | null;
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

// Progreso circular tipo “Activity”
function GoalProgressCircle({ progress }: { progress: number }) {
  const normalized = Math.max(0, Math.min(progress, 100));

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
  // Auth
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Data
  const [goals, setGoals] = useState<FamilyGoal[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---------- AUTH ----------
  useEffect(() => {
    let ignore = false;

    async function loadUser() {
      setAuthLoading(true);
      setAuthError(null);

      try {
        const { data } = await supabase.auth.getSession();
        const sessionUser = data.session?.user ?? null;
        if (!ignore) setUser(sessionUser);
      } catch (_err) {
        if (!ignore) {
          setUser(null);
          setAuthError("Hubo un problema al cargar tu sesión.");
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
      setGoals([]);
      setTxs([]);
    } catch (err) {
      console.error("Error cerrando sesión", err);
    }
  };

  // ---------- DATA ----------
  useEffect(() => {
    if (!user) {
      setGoals([]);
      setTxs([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // leer family_group_id si existe profiles (sin romper si no existe)
        let familyGroupId: string | null = null;

        try {
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("id, family_group_id")
            .eq("id", user.id)
            .maybeSingle();

          if (!profileError && profile) {
            familyGroupId = profile.family_group_id ?? null;
          }
        } catch {
          // ok: modo individual
        }

        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString();

        // Goals query (compatibilidad: si hay familyGroupId, también aceptamos metas sin family_group_id pero del owner)
        let goalsQuery = supabase
          .from("family_goals")
          .select("*")
          .order("created_at", { ascending: true });

        // Txs query (compatibilidad: family_group_id, owner_user_id, created_by, user_id)
        let txsQuery = supabase
          .from("transactions")
          .select("id, date, type, category, amount, goal_id, owner_user_id, created_by, family_group_id, user_id")
          .gte("date", startOfYear);

        if (familyGroupId) {
          goalsQuery = goalsQuery.or(
            `family_group_id.eq.${familyGroupId},owner_user_id.eq.${user.id}`
          );

          txsQuery = txsQuery.or(
            `family_group_id.eq.${familyGroupId},owner_user_id.eq.${user.id},created_by.eq.${user.id},user_id.eq.${user.id}`
          );
        } else {
          goalsQuery = goalsQuery.eq("owner_user_id", user.id);

          txsQuery = txsQuery.or(
            `owner_user_id.eq.${user.id},created_by.eq.${user.id},user_id.eq.${user.id}`
          );
        }

        const [
          { data: goalsData, error: goalsError },
          { data: txsData, error: txsError },
        ] = await Promise.all([goalsQuery, txsQuery]);

        if (goalsError) throw goalsError;
        if (txsError) throw txsError;

        if (!cancelled) {
          setGoals((goalsData || []) as FamilyGoal[]);
          setTxs((txsData || []) as Tx[]);
        }
      } catch (err: any) {
        console.error("Error cargando metas familiares:", err);
        if (!cancelled) {
          setError(
            err?.message ||
              "Ocurrió un error al cargar las metas familiares. Intenta de nuevo."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [user]);

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

      return { ...goal, totalContributed, progressPct };
    });
  }, [goals, txs]);

  // ---------- UI ----------
  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-600 dark:text-slate-300">
        Cargando sesión...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-sm font-semibold">Metas familiares</div>
          <p className="text-slate-500 dark:text-slate-400">
            Inicia sesión para ver y administrar metas familiares.
          </p>
          {authError && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400">{authError}</p>
          )}
          <Link
            href="/"
            className="inline-flex w-fit rounded-full bg-sky-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-600"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col pb-16 md:pb-4">
      <AppHeader
        title="Familia"
        subtitle="Metas familiares y planes en conjunto"
        activeTab="familia"
        userEmail={user.email ?? ""}
        userId={user.id}
        onSignOut={handleSignOut}
      />

      <PageShell maxWidth="6xl">
        <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
              Metas familiares
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 md:text-sm">
              Define y administra los objetivos financieros de tu familia. Puedes ligarlos
              a tus movimientos para que el avance se calcule solo.
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
              className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600"
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
                  Crea tu primera meta para vacaciones, un fondo de emergencia, el enganche
                  de una casa o cualquier objetivo importante.
                </p>
                <div className="mt-4 flex justify-center">
                  <Link
                    href="/familia/objetivos/nuevo"
                    className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600"
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
                              Se actualiza con:{" "}
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
      </PageShell>
    </main>
  );
}
