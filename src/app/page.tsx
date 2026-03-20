// src/app/page.tsx
"use client";

import { type ComponentType, type ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import {
  ArrowRight,
  ChartNoAxesCombined,
  CircleDollarSign,
  Landmark,
  PiggyBank,
  ShieldCheck,
  Target,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";
import { PageShell } from "@/components/ui/PageShell";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

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

type DashboardScope = {
  userId: string;
  familyId?: string | null;
  view: "personal" | "family";
};

function safeJSONParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getMonthKey(monthStart: Date) {
  const y = monthStart.getFullYear();
  const m = String(monthStart.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function cacheKeyForScope(prefix: string, scope: DashboardScope, month: string) {
  const family = scope.familyId ?? "personal";
  return `${prefix}-v2:${scope.userId}:${family}:${scope.view}:${month}`;
}

function isNetworkLikeError(err: unknown) {
  const msg = String((err as { message?: string })?.message ?? "").toLowerCase();
  return msg.includes("offline") || msg.includes("failed to fetch") || msg.includes("network");
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [netWorth, setNetWorth] = useState<NetWorthSummary | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalDeadline, setGoalDeadline] = useState("");

  const { familyCtx, familyLoading } = useFamilyContext(user);

  useEffect(() => {
    let ignore = false;

    async function loadUser() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!ignore) setUser(sessionData.session?.user ?? null);
      } catch {
        if (!ignore) setUser(null);
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

  useEffect(() => {
    let cancelled = false;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthKey = getMonthKey(monthStart);
    const monthLabel = monthStart.toLocaleDateString("es-MX", {
      month: "long",
      year: "numeric",
    });

    if (!user) {
      setSummary(null);
      setNetWorth(null);
      setDataError(null);
      setLoading(false);
      return;
    }

    if (familyLoading) {
      setSummary(null);
      setNetWorth(null);
      setDataError(null);
      setLoading(true);
      return;
    }

    const currentUser = user;

    const scope: DashboardScope = {
      userId: currentUser.id,
      familyId: familyCtx?.familyId ?? null,
      view: "personal",
    };

    const summaryCacheKey = cacheKeyForScope("ff-dashboard-summary", scope, monthKey);
    const netWorthCacheKey = cacheKeyForScope("ff-dashboard-networth", scope, monthKey);

    const applySummaryFromCache = () => {
      const cached = safeJSONParse<Pick<MonthlySummary, "incomes" | "expenses" | "balance">>(
        typeof window !== "undefined" ? localStorage.getItem(summaryCacheKey) : null
      );

      setSummary({
        incomes: Number(cached?.incomes ?? 0),
        expenses: Number(cached?.expenses ?? 0),
        balance: Number(cached?.balance ?? 0),
        monthLabel,
      });
    };

    const applyNetWorthFromCache = () => {
      const cached = safeJSONParse<NetWorthSummary>(
        typeof window !== "undefined" ? localStorage.getItem(netWorthCacheKey) : null
      );

      setNetWorth({
        assets: Number(cached?.assets ?? 0),
        debts: Number(cached?.debts ?? 0),
        netWorth: Number(cached?.netWorth ?? 0),
      });
    };

    async function loadDashboard() {
      setLoading(true);
      setDataError(null);
      setSummary(null);
      setNetWorth(null);

      if (typeof window !== "undefined" && !navigator.onLine) {
        if (!cancelled) {
          applySummaryFromCache();
          applyNetWorthFromCache();
          setLoading(false);
        }
        return;
      }

      try {
        let txQuery = supabase
          .from("transactions")
          .select("type, amount, date, family_group_id, user_id, owner_user_id, spender_user_id")
          .gte("date", monthStart.toISOString())
          .lt("date", nextMonthStart.toISOString());

        if (familyCtx?.familyId) {
          txQuery = txQuery
            .eq("family_group_id", familyCtx.familyId)
            .or(
              `spender_user_id.eq.${currentUser.id},user_id.eq.${currentUser.id},owner_user_id.eq.${currentUser.id}`
            );
        } else {
          txQuery = txQuery.or(
            `spender_user_id.eq.${currentUser.id},user_id.eq.${currentUser.id},owner_user_id.eq.${currentUser.id}`
          );
        }

        const { data: txs, error } = await txQuery;
        if (error) throw error;

        let incomes = 0;
        let expenses = 0;

        (txs ?? []).forEach((tx: { type: string; amount: number | string }) => {
          const amt = Number(tx.amount) || 0;
          if (tx.type === "ingreso") incomes += amt;
          if (tx.type === "gasto") expenses += amt;
        });

        const nextSummary: MonthlySummary = {
          incomes,
          expenses,
          balance: incomes - expenses,
          monthLabel,
        };

        if (!cancelled) setSummary(nextSummary);

        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(
              summaryCacheKey,
              JSON.stringify({
                incomes: nextSummary.incomes,
                expenses: nextSummary.expenses,
                balance: nextSummary.balance,
              })
            );
          } catch {}
        }
      } catch (err) {
        console.warn("No se pudo cargar resumen mensual:", err);
        if (!cancelled) applySummaryFromCache();
        if (!isNetworkLikeError(err) && !cancelled) {
          setDataError("No se pudieron cargar algunos datos de este mes.");
        }
      }

      try {
        const [assetsRes, debtsRes] = await Promise.all([
          supabase.from("assets").select("current_value").eq("user_id", currentUser.id),
          supabase.from("debts").select("current_balance, total_amount").eq("user_id", currentUser.id),
        ]);

        if (assetsRes.error) throw assetsRes.error;
        if (debtsRes.error) throw debtsRes.error;

        const assetsTotal = (assetsRes.data ?? []).reduce(
          (acc: number, row: { current_value?: number | string }) => acc + (Number(row.current_value) || 0),
          0
        );

        const debtsTotal = (debtsRes.data ?? []).reduce(
          (acc: number, row: { current_balance?: number | string; total_amount?: number | string }) =>
            acc + (Number(row.current_balance ?? row.total_amount ?? 0) || 0),
          0
        );

        const nextNetWorth: NetWorthSummary = {
          assets: assetsTotal,
          debts: debtsTotal,
          netWorth: assetsTotal - debtsTotal,
        };

        if (!cancelled) setNetWorth(nextNetWorth);

        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(netWorthCacheKey, JSON.stringify(nextNetWorth));
          } catch {}
        }
      } catch (err) {
        console.warn("No se pudo cargar patrimonio:", err);
        if (!cancelled) applyNetWorthFromCache();
        if (!isNetworkLikeError(err) && !cancelled) {
          setDataError((prev) => prev ?? "No se pudieron cargar algunos datos de patrimonio.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [user, familyCtx?.familyId, familyLoading]);

  const balanceTag = useMemo(() => {
    if (!summary) return { label: "Sin datos del mes", variant: "secondary" as const };
    if (summary.balance > 0) return { label: "Mes superavitario", variant: "success" as const };
    if (summary.balance < 0) return { label: "Mes en rojo", variant: "destructive" as const };
    return { label: "Mes equilibrado", variant: "secondary" as const };
  }, [summary]);

  const dashboardNarrative = useMemo(() => {
    if (loading) return "Estamos armando tu vista financiera de este mes.";
    if (dataError) return dataError;
    if (!summary) return "Aun no hay movimientos suficientes para este periodo.";
    if (summary.balance > 0) {
      return "Tu mes va sano. Es un buen momento para mandar una parte del excedente a ahorro o deuda.";
    }
    if (summary.balance < 0) {
      return "Hay presion en el flujo mensual. Conviene revisar categorias variables antes de cerrar el mes.";
    }
    return "Vas parejo este mes. Una pequena mejora en gasto variable puede darte margen de ahorro.";
  }, [loading, dataError, summary]);

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
    <main className="flex min-h-screen flex-col pb-16 md:pb-8">
      <AppHeader
        title="Dashboard"
        subtitle="Una cabina sobria y clara para leer tu salud financiera personal antes de entrar al detalle."
        activeTab="dashboard"
        userEmail={user?.email ?? undefined}
        userId={user?.id}
      />

      <PageShell maxWidth="6xl">
        <section className="surface-hero overflow-hidden rounded-[32px] px-5 py-6 md:px-8 md:py-8">
          <div className="grid gap-6 lg:grid-cols-[1.35fr,0.9fr] lg:items-end">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Sistema visual base</Badge>
                <Badge variant={balanceTag.variant}>{balanceTag.label}</Badge>
              </div>

              <div className="space-y-3">
                <p className="eyebrow">Vista principal</p>
                <h2 className="max-w-3xl text-balance text-3xl font-semibold tracking-[-0.05em] text-slate-950 dark:text-slate-50 md:text-5xl">
                  Finanzas familiares con presencia mas sobria, moderna y premium.
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 md:text-base">
                  {dashboardNarrative}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href="/gastos" className={buttonVariants({ variant: "default", size: "lg" })}>
                  Revisar movimientos
                </Link>
                <Link href="/familia/dashboard" className={buttonVariants({ variant: "outline", size: "lg" })}>
                  Ver dashboard familiar
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <HeroStat
                icon={CircleDollarSign}
                label="Ingresos"
                value={summary?.incomes ?? 0}
                accent="success"
                loading={loading}
              />
              <HeroStat
                icon={WalletCards}
                label="Gastos"
                value={summary?.expenses ?? 0}
                accent="danger"
                loading={loading}
              />
              <HeroStat
                icon={Landmark}
                label="Valor neto"
                value={netWorth?.netWorth ?? 0}
                accent="primary"
                loading={loading}
              />
            </div>
          </div>
        </section>

        <Tabs defaultValue="overview" className="w-full">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="eyebrow">Componentes base aplicados</p>
              <h3 className="section-title">Dashboard principal</h3>
            </div>
            <TabsList>
              <TabsTrigger value="overview">Vista general</TabsTrigger>
              <TabsTrigger value="goals">Objetivos</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1.35fr,0.9fr]">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-2">
                      <CardTitle>Resumen del mes</CardTitle>
                      <CardDescription>
                        {summary
                          ? `Movimientos consolidados de ${summary.monthLabel}.`
                          : "Estamos consultando tus movimientos recientes."}
                      </CardDescription>
                    </div>
                    <Badge variant={balanceTag.variant}>{balanceTag.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-3">
                    <MetricPanel label="Ingresos del mes" value={summary?.incomes ?? 0} tone="positive" />
                    <MetricPanel label="Gastos del mes" value={summary?.expenses ?? 0} tone="negative" />
                    <MetricPanel
                      label="Balance del mes"
                      value={summary?.balance ?? 0}
                      tone={summary && summary.balance >= 0 ? "positive" : "negative"}
                    />
                  </div>

                  <div className="premium-banner" data-tone={dataError ? "critical" : "info"}>
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                          Contexto rapido
                        </p>
                        <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                          {dataError
                            ? dataError
                            : "Si tu balance ya es positivo, separa un porcentaje fijo antes de que se diluya en gasto operativo."}
                        </p>
                      </div>
                      <Link href="/gastos" className={buttonVariants({ variant: "outline" })}>
                        Ver gastos e ingresos
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Patrimonio personal</CardTitle>
                    <CardDescription>Activos menos deudas con lectura compacta y accionable.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ValueRow label="Activos personales" value={netWorth?.assets ?? 0} />
                    <ValueRow label="Deudas personales" value={netWorth?.debts ?? 0} />
                    <ValueRow label="Valor neto" value={netWorth?.netWorth ?? 0} highlight />
                    <Link href="/patrimonio" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
                      Ver detalle patrimonial
                    </Link>
                  </CardContent>
                </Card>

                <div className="premium-banner" data-tone="positive">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-2xl bg-emerald-500/12 p-2 text-emerald-600 dark:text-emerald-300">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                        Recomendacion del sistema
                      </p>
                      <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                        Usa el dashboard como lectura ejecutiva. El detalle operativo vive en movimientos,
                        patrimonio y familia.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="goals" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[0.92fr,1.08fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Nuevo objetivo financiero</CardTitle>
                  <CardDescription>
                    Una meta clara merece una superficie dedicada, limpia y de alta confianza.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Nombre del objetivo">
                    <Input
                      value={goalTitle}
                      onChange={(event) => setGoalTitle(event.target.value)}
                      placeholder="Ej. Fondo de emergencia, liquidar tarjeta o vacaciones"
                    />
                  </Field>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Monto meta (MXN)">
                      <Input
                        value={goalTarget}
                        onChange={(event) => setGoalTarget(event.target.value)}
                        placeholder="Ej. 25,000"
                      />
                    </Field>

                    <Field label="Fecha objetivo">
                      <Input
                        type="date"
                        value={goalDeadline}
                        onChange={(event) => setGoalDeadline(event.target.value)}
                      />
                    </Field>
                  </div>

                  <Button
                    type="button"
                    onClick={handleAddGoal}
                    size="lg"
                    className="w-full"
                    disabled={!goalTitle.trim() || !goalTarget.trim()}
                  >
                    Guardar objetivo rapido
                  </Button>

                  <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                    Esta captura rapida sigue siendo personal. El seguimiento automatizado de metas
                    familiares se mantiene en el modulo de Familia.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle>Tus objetivos</CardTitle>
                      <CardDescription>
                        Jerarquia clara entre vacio, progreso activo y proximas acciones.
                      </CardDescription>
                    </div>
                    <Badge variant={goals.length > 0 ? "success" : "secondary"}>
                      {goals.length > 0 ? `${goals.length} activo(s)` : "Sin objetivos"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {goals.length === 0 ? (
                    <div className="empty-state">
                      <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                        <div className="rounded-[22px] bg-[hsl(var(--accent))] p-3 text-[hsl(var(--accent-foreground))]">
                          <Target className="h-6 w-6" />
                        </div>
                        <div className="space-y-2">
                          <p className="text-base font-semibold text-slate-950 dark:text-slate-50">
                            Tus metas apareceran aqui
                          </p>
                          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                            Empieza con una meta simple y convierte este tablero en una herramienta de
                            decision, no solo de registro.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {goals.map((goal) => (
                        <li
                          key={goal.id}
                          className="surface-2 rounded-[24px] px-4 py-4 transition-all duration-200 hover:-translate-y-0.5"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-1">
                              <p className="text-base font-semibold text-slate-950 dark:text-slate-50">
                                {goal.title}
                              </p>
                              <p className="text-sm text-slate-600 dark:text-slate-300">
                                Meta de{" "}
                                <span className="font-semibold text-slate-900 dark:text-slate-100">
                                  {formatCurrency(goal.targetAmount)}
                                </span>
                                {goal.deadline
                                  ? ` · Para el ${new Date(goal.deadline).toLocaleDateString("es-MX")}`
                                  : " · Sin fecha limite"}
                              </p>
                            </div>
                            <Badge variant="warning">En proceso</Badge>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <section className="grid gap-4 lg:grid-cols-3">
          <SystemTile
            icon={ChartNoAxesCombined}
            title="Jerarquia de cards"
            description="Hero, card principal, card secundaria y panel de metrica con bordes y sombras mas controladas."
          />
          <SystemTile
            icon={PiggyBank}
            title="Spacing y ritmo"
            description="Separaciones mas amplias, radios consistentes y respiracion visual para lectura ejecutiva."
          />
          <SystemTile
            icon={ArrowRight}
            title="Acciones premium"
            description="Botones mas firmes, inputs mas limpios y tabs con contraste claro entre contexto y seleccion."
          />
        </section>
      </PageShell>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function MetricPanel({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "positive" | "negative";
}) {
  const isPositive = tone === "positive";

  return (
    <div className="metric-card">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p
        className={cn(
          "mt-3 text-2xl font-semibold tracking-[-0.04em]",
          isPositive ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"
        )}
      >
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function ValueRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[22px] border border-[hsl(var(--border)/0.76)] bg-[hsl(var(--muted)/0.45)] px-4 py-3">
      <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
      <span
        className={cn(
          "text-sm font-semibold text-slate-950 dark:text-slate-50",
          highlight && "text-[hsl(var(--primary))] dark:text-sky-300"
        )}
      >
        {formatCurrency(value)}
      </span>
    </div>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
  accent,
  loading,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent: "success" | "danger" | "primary";
  loading: boolean;
}) {
  const accentClass =
    accent === "success"
      ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
      : accent === "danger"
      ? "bg-rose-500/12 text-rose-600 dark:text-rose-300"
      : "bg-sky-500/12 text-sky-700 dark:text-sky-300";

  return (
    <div className="surface-1 rounded-[26px] p-4">
      <div className="flex items-center gap-3">
        <div className={cn("rounded-[18px] p-2.5", accentClass)}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="mt-1 text-xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-50">
            {loading ? "Cargando..." : formatCurrency(value)}
          </p>
        </div>
      </div>
    </div>
  );
}

function SystemTile({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="surface-1 rounded-[28px] p-5">
      <div className="flex items-start gap-4">
        <div className="rounded-[18px] bg-[hsl(var(--accent))] p-3 text-[hsl(var(--accent-foreground))]">
          <Icon className="h-5 w-5" />
        </div>
        <div className="space-y-2">
          <h4 className="text-base font-semibold text-slate-950 dark:text-slate-50">{title}</h4>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
        </div>
      </div>
    </div>
  );
}

function formatCurrency(value: number) {
  return value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}
