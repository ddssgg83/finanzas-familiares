"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";
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
import Link from "next/link";

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
  created_by?: string | null;
  owner_user_id?: string | null;
  family_group_id?: string | null;
  goal_id?: string | null;
};

type FamilyGoalType = "ahorro" | "deuda" | "gasto_controlado" | "otro";
type FamilyGoalStatus =
  | "pendiente"
  | "en_progreso"
  | "completado"
  | "pausado"
  | "cancelado";

type FamilyGoal = {
  id: string;
  family_group_id?: string | null;
  name: string;
  description?: string | null;
  target_amount: number;
  current_amount?: number | null;
  due_date?: string | null;
  type?: FamilyGoalType | string;
  status?: FamilyGoalStatus | string;
  category?: string | null;
  owner_user_id?: string | null;
  icon?: string | null;
  color?: string | null;
  auto_track?: boolean | null;
  track_direction?: "ingresos" | "ahorros" | "gastos_reducidos" | null;
  track_category?: string | null;
  created_at?: string;
  updated_at?: string;
};

type FamilyMember = {
  id: string;
  full_name: string | null;
  role: string | null;
  family_group_id?: string | null;
};

type GoalWithProgress = FamilyGoal & {
  totalContributed: number;
  progressPct: number;
  last30Amount: number;
  projectedDaysToGoal: number | null;
  intensity: "on_track" | "at_risk" | "off_track";
};

function formatCurrency(monto: number): string {
  return monto.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "Sin fecha";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Sin fecha";
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysDiff(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export default function FamilyDashboardPage() {
  const { theme } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
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

        // Intentamos leer perfil/familia si existe la tabla `profiles`
        let familyGroupId: string | null = null;
        let members: FamilyMember[] = [];

        try {
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("id, family_group_id, full_name, role")
            .eq("id", user.id)
            .maybeSingle();

          if (!profileError && profile) {
            familyGroupId = profile.family_group_id ?? null;

            if (familyGroupId) {
              const { data: membersData, error: membersError } = await supabase
                .from("profiles")
                .select("id, full_name, role, family_group_id")
                .eq("family_group_id", familyGroupId);

              if (!membersError && membersData) {
                members = membersData as FamilyMember[];
              }
            }
          } else if (profileError) {
            // Si la tabla no existe o falla, trabajamos en modo individual
            console.warn(
              "No se pudo leer 'profiles', se usará modo individual:",
              profileError.message
            );
          }
        } catch (innerErr: any) {
          console.warn(
            "Error intentando leer tabla profiles, modo individual:",
            innerErr?.message
          );
        }

        // Si no hay miembros, al menos creamos el "grupo" con el propio usuario
        if (!members.length) {
          members = [
            {
              id: user.id,
              full_name: user.email ?? "Tu cuenta",
              role: "jefe",
              family_group_id: null,
            },
          ];
        }

        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString();

        // Queries base
        let goalsQuery = supabase.from("family_goals").select("*");
        let txsQuery = supabase
          .from("transactions")
          .select("*")
          .gte("date", startOfYear);

        // Si tenemos family_group_id, filtramos por familia PERO también aceptamos metas
// que por bug hayan quedado sin family_group_id pero sí son del owner.
// Esto evita que "desaparezcan" al navegar.
if (familyGroupId) {
  goalsQuery = goalsQuery.or(
    `family_group_id.eq.${familyGroupId},owner_user_id.eq.${user.id}`
  );

  // Para txs mantenemos familiar como principal; y por compatibilidad agregamos owner/created_by.
  // (Esto no agrega features, solo evita quedarnos sin datos por esquemas mezclados.)
  txsQuery = txsQuery.or(
    `family_group_id.eq.${familyGroupId},owner_user_id.eq.${user.id},created_by.eq.${user.id}`
  );
} else {
  // Modo individual
  goalsQuery = goalsQuery.eq("owner_user_id", user.id);

  // Compatibilidad: algunos esquemas usan user_id, otros created_by/owner_user_id
  txsQuery = txsQuery.or(
    `user_id.eq.${user.id},owner_user_id.eq.${user.id},created_by.eq.${user.id}`
  );
}

        const [
          { data: goalsData, error: goalsError },
          { data: txsData, error: txsError },
        ] = await Promise.all([goalsQuery, txsQuery]);

        if (goalsError) {
          console.warn(
            "Error cargando metas (se asumirá sin metas):",
            goalsError.message
          );
        }

        if (txsError) {
          console.error("Error cargando movimientos:", txsError.message);
          throw txsError;
        }

        setFamilyMembers(members);
        setGoals((goalsData || []) as FamilyGoal[]);
        setTxs((txsData || []) as Tx[]);
      } catch (err: any) {
        console.error("Error cargando dashboard familiar:", err);
        setError(
          err?.message ||
            "Ocurrió un error al cargar el dashboard familiar. Intenta de nuevo."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const memberMap = useMemo(() => {
    const map = new Map<string, FamilyMember>();
    familyMembers.forEach((m) => {
      if (m.id) map.set(m.id, m);
    });
    return map;
  }, [familyMembers]);

  const goalsWithProgress: GoalWithProgress[] = useMemo(() => {
    if (!goals.length) return [];

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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

      const last30Txs = relatedTxs.filter((tx) => {
        const d = new Date(tx.date);
        return d >= thirtyDaysAgo;
      });

      const last30Amount = last30Txs.reduce(
        (sum, tx) => sum + (tx.amount || 0),
        0
      );

      let projectedDaysToGoal: number | null = null;

      if (target > 0 && totalContributed < target && last30Amount > 0) {
        const dailyVelocity = last30Amount / 30;
        const remaining = target - totalContributed;
        projectedDaysToGoal = remaining / dailyVelocity;
      }

      let intensity: "on_track" | "at_risk" | "off_track" = "on_track";

      if (goal.due_date) {
        const due = new Date(goal.due_date);
        const today = new Date();
        const daysToDue = daysDiff(today, due);

        if (progressPct >= 100) {
          intensity = "on_track";
        } else if (projectedDaysToGoal === null) {
          intensity = "at_risk";
        } else if (projectedDaysToGoal > daysToDue) {
          intensity = "off_track";
        } else if (projectedDaysToGoal > daysToDue * 0.8) {
          intensity = "at_risk";
        } else {
          intensity = "on_track";
        }
      }

      return {
        ...goal,
        totalContributed,
        progressPct,
        last30Amount,
        projectedDaysToGoal,
        intensity,
      };
    });
  }, [goals, txs]);

  const globalSummary = useMemo(() => {
    if (!goalsWithProgress.length) {
      return {
        totalGoals: 0,
        completedGoals: 0,
        inProgressGoals: 0,
        globalTarget: 0,
        globalContributed: 0,
        globalProgressPct: 0,
        monthlyGoalContrib: 0,
      };
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const totalGoals = goalsWithProgress.length;
    const completedGoals =
      goalsWithProgress.filter(
        (g) => (g.status as string) === "completado" || g.progressPct >= 100
      ).length || 0;

    const inProgressGoals =
      goalsWithProgress.filter(
        (g) =>
          g.progressPct > 0 &&
          g.progressPct < 100 &&
          g.status !== "cancelado"
      ).length || 0;

    const globalTarget = goalsWithProgress.reduce(
      (sum, g) => sum + (g.target_amount || 0),
      0
    );
    const globalContributed = goalsWithProgress.reduce(
      (sum, g) => sum + g.totalContributed,
      0
    );

    const globalProgressPct =
      globalTarget > 0 ? Math.min((globalContributed / globalTarget) * 100, 200) : 0;

    const monthlyGoalContrib = txs
      .filter((tx) => {
        const d = new Date(tx.date);
        const isThisMonth = d >= startOfMonth && d <= now;
        return isThisMonth && tx.goal_id != null;
      })
      .reduce((sum, tx) => sum + (tx.amount || 0), 0);

    return {
      totalGoals,
      completedGoals,
      inProgressGoals,
      globalTarget,
      globalContributed,
      globalProgressPct,
      monthlyGoalContrib,
    };
  }, [goalsWithProgress, txs]);

  const goalsChartData = useMemo(
    () =>
      goalsWithProgress.map((g) => ({
        name: g.name,
        progreso: Number(g.progressPct.toFixed(1)),
      })),
    [goalsWithProgress]
  );

  const memberContributionChartData = useMemo(() => {
    if (!txs.length) return [];

    const map = new Map<string, number>();

    txs.forEach((tx) => {
      if (!tx.goal_id) return;
      const key = tx.owner_user_id || tx.created_by || "desconocido";
      map.set(key, (map.get(key) || 0) + (tx.amount || 0));
    });

    return Array.from(map.entries()).map(([userId, total]) => {
      const member = memberMap.get(userId);
      return {
        name: member?.full_name || "Miembro",
        aporte: total,
      };
    });
  }, [txs, memberMap]);

  const isDark = theme === "dark";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <AppHeader
        title="Familia"
        subtitle="Objetivos familiares y actividad del grupo"
        activeTab="familia"
      />

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-10 pt-4 md:px-6 md:pt-6 lg:px-8">
        <section className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
  <div>
    <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
      Dashboard familiar
    </h1>
    <p className="text-xs text-slate-500 dark:text-slate-400 md:text-sm">
      Visualiza el avance de tus objetivos familiares, quién está
      aportando más y qué tan cerca están de lograrse.
    </p>

    {/* 👇 NUEVO: Botones para metas familiares */}
    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
      <Link href="/familia/objetivos">
        <button className="rounded-full border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800">
          Ver metas familiares
        </button>
      </Link>

      <Link href="/familia/objetivos/nuevo">
        <button className="rounded-full bg-sky-500 px-3 py-1 font-medium text-white shadow-sm transition hover:bg-sky-600">
          Crear nueva meta
        </button>
      </Link>
    </div>
  </div>

  {user && (
    <div className="rounded-full bg-gradient-to-r from-emerald-500/10 via-sky-500/10 to-indigo-500/10 px-4 py-2 text-right text-[11px] text-slate-600 dark:text-slate-300">
      <div className="text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
        Jefe de familia
      </div>
      <div className="font-medium">
        {familyMembers.find((m) => m.id === user.id)?.full_name ||
          "Tu cuenta"}
      </div>
    </div>
  )}
</section>

        {loading && (
          <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            Cargando dashboard familiar…
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* RESUMEN GLOBAL */}
            <section className="grid gap-4 md:grid-cols-3">
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Metas familiares
                </div>
                <div className="flex items-baseline gap-2">
                  <div className="text-2xl font-semibold">
                    {globalSummary.totalGoals}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    totales
                  </div>
                </div>
                <div className="mt-2 flex gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {globalSummary.completedGoals} completadas
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {globalSummary.inProgressGoals} en progreso
                  </span>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Ahorro enfocado a metas
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {formatCurrency(globalSummary.globalContributed)} /{" "}
                  {formatCurrency(globalSummary.globalTarget || 0)}
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-sky-500 to-indigo-500"
                    style={{
                      width: `${Math.min(
                        globalSummary.globalProgressPct,
                        100
                      ).toFixed(1)}%`,
                    }}
                  />
                </div>
                <div className="mt-1 text-right text-[11px] text-slate-500 dark:text-slate-400">
                  Avance global{" "}
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {globalSummary.globalProgressPct.toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Aportado a metas este mes
                </div>
                <div className="text-2xl font-semibold">
                  {formatCurrency(globalSummary.monthlyGoalContrib || 0)}
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Suma de movimientos ligados a cualquier objetivo familiar
                  durante el mes actual.
                </p>
              </div>
            </section>

            {/* METAS + ANALÍTICA */}
            <section className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">
                      Objetivos familiares
                    </h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Objetivos vinculados a tus movimientos. El avance se
                      calcula automáticamente.
                    </p>
                  </div>
                </div>

                {goalsWithProgress.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                    Aún no tienes objetivos familiares. Crea metas para
                    vacaciones, estudios, fondo de emergencia, etc.
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {goalsWithProgress.map((goal) => {
                      const member =
                        goal.owner_user_id &&
                        memberMap.get(goal.owner_user_id);

                      const progressClamped = Math.min(goal.progressPct, 120);
                      const overGoal = goal.progressPct >= 100;

                      const intensityBadge =
                        goal.intensity === "on_track"
                          ? {
                              label: "En ruta",
                              className:
                                "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
                            }
                          : goal.intensity === "at_risk"
                          ? {
                              label: "En riesgo",
                              className:
                                "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
                            }
                          : {
                              label: "Fuera de ruta",
                              className:
                                "bg-rose-50 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
                            };

                      return (
                        <article
                          key={goal.id}
                          className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                        >
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-sky-500 to-indigo-500 opacity-70" />

                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-semibold leading-tight">
                                {goal.name}
                              </h3>
                              {goal.description && (
                                <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
                                  {goal.description}
                                </p>
                              )}
                            </div>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${intensityBadge.className}`}
                            >
                              {intensityBadge.label}
                            </span>
                          </div>

                          <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                            <span>
                              Meta:{" "}
                              <span className="font-semibold text-slate-800 dark:text-slate-100">
                                {formatCurrency(goal.target_amount || 0)}
                              </span>
                            </span>
                            <span>
                              Avance:{" "}
                              <span className="font-semibold text-slate-800 dark:text-slate-100">
                                {formatCurrency(goal.totalContributed)}
                              </span>
                            </span>
                          </div>

                          <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              className={`h-full rounded-full ${
                                overGoal
                                  ? "bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-700"
                                  : "bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500"
                              }`}
                              style={{ width: `${progressClamped}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                            <span>
                              {goal.progressPct.toFixed(1)}% completado
                              {goal.due_date && (
                                <>
                                  {" · "}
                                  meta al {formatDate(goal.due_date)}
                                </>
                              )}
                            </span>
                            {member && (
                              <span className="inline-flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Líder:{" "}
                                <span className="font-medium text-slate-700 dark:text-slate-200">
                                  {member.full_name}
                                </span>
                              </span>
                            )}
                          </div>

                          <div className="mt-3 rounded-xl bg-slate-50 p-2 text-[11px] text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">
                            {goal.last30Amount > 0 ? (
                              <p>
                                En los últimos 30 días se han aportado{" "}
                                <span className="font-semibold text-slate-800 dark:text-slate-100">
                                  {formatCurrency(goal.last30Amount)}
                                </span>{" "}
                                a esta meta.
                                {goal.projectedDaysToGoal && (
                                  <>
                                    {" "}
                                    Manteniendo este ritmo, podrían completarla
                                    en{" "}
                                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                                      ~
                                      {Math.round(
                                        goal.projectedDaysToGoal
                                      )}{" "}
                                      días
                                    </span>
                                    .
                                  </>
                                )}
                              </p>
                            ) : (
                              <p>
                                Todavía no se registran aportaciones recientes
                                para esta meta. Vincula movimientos o define una
                                categoría para que avance automáticamente.
                              </p>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* PANEL LATERAL */}
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-xs font-semibold">
                    Termómetro familiar
                  </h3>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Resumen rápido del estado de tus objetivos.
                  </p>

                  <ul className="mt-3 space-y-2 text-[11px] text-slate-600 dark:text-slate-300">
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span>
                        Tienen{" "}
                        <span className="font-semibold">
                          {globalSummary.completedGoals}
                        </span>{" "}
                        objetivo(s) completado(s).
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
                      <span>
                        Hay{" "}
                        <span className="font-semibold">
                          {globalSummary.inProgressGoals}
                        </span>{" "}
                        objetivo(s) en progreso.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-sky-500" />
                      <span>
                        Avance global:{" "}
                        <span className="font-semibold">
                          {globalSummary.globalProgressPct.toFixed(1)}%
                        </span>
                        .
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-xs font-semibold">
                    Progreso por objetivo
                  </h3>
                  <p className="mb-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Cada barra representa el avance de una meta.
                  </p>
                  {goalsChartData.length === 0 ? (
                    <div className="py-4 text-center text-[11px] text-slate-500 dark:text-slate-400">
                      Crea al menos una meta para ver la gráfica.
                    </div>
                  ) : (
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={goalsChartData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={isDark ? "#1e293b" : "#e2e8f0"}
                            vertical={false}
                          />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 10 }}
                            tickLine={false}
                            axisLine={{ stroke: isDark ? "#1e293b" : "#e2e8f0" }}
                          />
                          <YAxis
                            tick={{ fontSize: 10 }}
                            tickLine={false}
                            axisLine={{ stroke: isDark ? "#1e293b" : "#e2e8f0" }}
                            domain={[0, 120]}
                            tickFormatter={(value) => `${value}%`}
                          />
                          <Tooltip
                            contentStyle={{
                              fontSize: 11,
                            }}
                            formatter={(value: any) => `${value}%`}
                          />
                          <Bar dataKey="progreso" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-xs font-semibold">
                    Aportaciones por miembro
                  </h3>
                  <p className="mb-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Quién está aportando más a las metas (según movimientos
                    ligados).
                  </p>
                  {memberContributionChartData.length === 0 ? (
                    <div className="py-4 text-center text-[11px] text-slate-500 dark:text-slate-400">
                      Aún no hay aportaciones ligadas a metas por miembro.
                    </div>
                  ) : (
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={memberContributionChartData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={isDark ? "#1e293b" : "#e2e8f0"}
                            vertical={false}
                          />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 10 }}
                            tickLine={false}
                            axisLine={{ stroke: isDark ? "#1e293b" : "#e2e8f0" }}
                          />
                          <YAxis
                            tick={{ fontSize: 10 }}
                            tickLine={false}
                            axisLine={{ stroke: isDark ? "#1e293b" : "#e2e8f0" }}
                            tickFormatter={(value) =>
                              formatCurrency(Number(value))
                            }
                          />
                          <Tooltip
                            contentStyle={{ fontSize: 11 }}
                            formatter={(value: any) =>
                              formatCurrency(Number(value))
                            }
                          />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Line
                            type="monotone"
                            dataKey="aporte"
                            dot={false}
                            strokeWidth={2}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
