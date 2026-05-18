"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MonthlyProjection } from "@/lib/premium/financialSignals";

type Props = {
  projection: MonthlyProjection;
};

function formatMoney(value: number) {
  return value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}

const toneClass = {
  good: "text-emerald-600 dark:text-emerald-300",
  warning: "text-amber-700 dark:text-amber-300",
  critical: "text-rose-600 dark:text-rose-300",
  neutral: "text-slate-700 dark:text-slate-200",
};

export function PremiumProjectionCard({ projection }: Props) {
  const isPositive = projection.projectedBalance >= 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Proyección mensual</CardTitle>
            <CardDescription>Estimación simple con el ritmo actual del mes.</CardDescription>
          </div>
          <Badge variant={projection.confidence === "medium" ? "secondary" : "warning"}>
            {projection.confidence === "medium" ? "Confianza media" : "Datos tempranos"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="rounded-[22px] bg-[hsl(var(--muted)/0.65)] p-3 text-slate-700 dark:text-slate-200">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              {projection.label}
            </p>
            <p className={cn("mt-1 text-2xl font-semibold tracking-[-0.04em]", toneClass[projection.tone])}>
              {formatMoney(projection.projectedBalance)}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ProjectionMetric label="Gasto proyectado" value={formatMoney(projection.projectedExpenses)} />
          <ProjectionMetric label="Promedio diario" value={formatMoney(projection.dailyExpenseAverage)} />
        </div>

        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
          Calculado con {projection.daysElapsed} de {projection.daysInMonth} días del mes. Es una guía,
          no una predicción definitiva.
        </p>
      </CardContent>
    </Card>
  );
}

function ProjectionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-[hsl(var(--border)/0.76)] bg-[hsl(var(--muted)/0.34)] px-3 py-3">
      <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-950 dark:text-slate-50">{value}</div>
    </div>
  );
}
