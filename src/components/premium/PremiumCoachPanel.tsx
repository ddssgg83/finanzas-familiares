"use client";

import { useMemo, useState } from "react";
import { Bot, Loader2, MessageSquareText, ShieldCheck, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PremiumDashboardModel } from "@/lib/premium/dashboardInsights";
import type {
  PremiumCoachAction,
  PremiumCoachContext,
  PremiumCoachSuccessResponse,
} from "@/lib/premium/coachTypes";

type Props = {
  model: PremiumDashboardModel;
};

const actions: Array<{
  action: PremiumCoachAction;
  label: string;
}> = [
  { action: "explain_month", label: "Explícame este mes" },
  { action: "three_actions", label: "Dame 3 acciones" },
  { action: "risk_summary", label: "Resume mis riesgos" },
  { action: "family_message", label: "Mensaje para mi familia" },
];

function getOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

function buildCoachContext(model: PremiumDashboardModel): PremiumCoachContext {
  return {
    health: {
      score: model.health.score,
      label: model.health.label,
      factors: model.health.factors,
    },
    projection: {
      projectedExpenses: model.projection.projectedExpenses,
      projectedBalance: model.projection.projectedBalance,
      dailyExpenseAverage: model.projection.dailyExpenseAverage,
      confidence: model.projection.confidence,
      label: model.projection.label,
    },
    signals: model.signals.map((signal) => ({
      title: signal.title,
      body: signal.body,
      severity: signal.severity,
      metric: signal.metric,
    })),
    risks: model.risks.map((risk) => ({
      title: risk.title,
      body: risk.body,
      severity: risk.severity,
    })),
    nextAction: {
      title: model.nextAction.title,
      body: model.nextAction.body,
    },
    familySummary: {
      title: model.familySummary.title,
      body: model.familySummary.body,
    },
  };
}

export function PremiumCoachPanel({ model }: Props) {
  const [online, setOnline] = useState(getOnline);
  const [loadingAction, setLoadingAction] = useState<PremiumCoachAction | null>(null);
  const [result, setResult] = useState<PremiumCoachSuccessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const context = useMemo(() => buildCoachContext(model), [model]);
  const disabled = !online || !!loadingAction;

  const runCoach = async (action: PremiumCoachAction) => {
    setOnline(getOnline());
    if (!getOnline()) {
      setError("La explicación con IA requiere internet. Tus señales locales siguen disponibles.");
      return;
    }

    setLoadingAction(action);
    setError(null);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError("Tu sesión expiró. Vuelve a iniciar sesión para usar el copiloto.");
        return;
      }

      const res = await fetch("/api/premium/coach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, context }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok !== true) {
        throw new Error(json?.error ?? "No pude generar la explicación ahora.");
      }

      setResult(json as PremiumCoachSuccessResponse);
    } catch (err: any) {
      setError(err?.message ?? "No pude generar la explicación ahora. Tus señales locales siguen disponibles.");
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Copiloto financiero</CardTitle>
            <CardDescription>Explica tus señales locales con una lectura guiada y breve.</CardDescription>
          </div>
          <Badge variant="secondary">IA guiada</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-[24px] border border-[hsl(var(--border)/0.76)] bg-[hsl(var(--muted)/0.34)] p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-[20px] bg-sky-500/12 p-3 text-sky-700 dark:text-sky-300">
              <Bot className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                Sin chat libre, solo contexto útil
              </p>
              <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                Usa señales agregadas. No enviamos movimientos, notas, emails ni identificadores.
              </p>
            </div>
          </div>
        </div>

        {!online ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            La explicación con IA requiere internet. Tus señales locales siguen disponibles.
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          {actions.map((item) => {
            const isLoading = loadingAction === item.action;
            return (
              <button
                key={item.action}
                type="button"
                onClick={() => runCoach(item.action)}
                disabled={disabled}
                className={cn(
                  "inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition",
                  "border-slate-200 bg-white text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60",
                  "dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
                )}
              >
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {isLoading ? "Preparando…" : item.label}
              </button>
            );
          })}
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
            {error}
          </div>
        ) : null}

        {result ? (
          <div className="space-y-3 rounded-[24px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-emerald-500/12 p-2 text-emerald-700 dark:text-emerald-300">
                <MessageSquareText className="h-4 w-4" />
              </div>
              <div className="min-w-0 space-y-2">
                <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{result.title}</p>
                <ul className="space-y-1.5">
                  {result.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
              <div className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="font-semibold">Acción prioritaria:</span> {result.priorityAction}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
