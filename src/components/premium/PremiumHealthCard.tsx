"use client";

import { Activity, CheckCircle2, CircleAlert, Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PremiumHealthModel } from "@/lib/premium/dashboardInsights";
import { useI18n } from "@/lib/i18n/useI18n";

type Props = {
  health: PremiumHealthModel;
};

const toneClasses = {
  good: {
    ring: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200",
    bar: "bg-emerald-500",
    icon: CheckCircle2,
    badge: "success" as const,
  },
  warning: {
    ring: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200",
    bar: "bg-amber-500",
    icon: CircleAlert,
    badge: "warning" as const,
  },
  critical: {
    ring: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200",
    bar: "bg-rose-500",
    icon: CircleAlert,
    badge: "destructive" as const,
  },
  neutral: {
    ring: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200",
    bar: "bg-slate-400",
    icon: Gauge,
    badge: "secondary" as const,
  },
};

export function PremiumHealthCard({ health }: Props) {
  const { dictionary } = useI18n();
  const tone = toneClasses[health.tone];
  const Icon = tone.icon;
  const scoreLabel = health.score > 0 ? `${health.score}/100` : "--";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{dictionary.premium.health.title}</CardTitle>
            <CardDescription>{dictionary.premium.health.description}</CardDescription>
          </div>
          <Badge variant={tone.badge}>{health.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-4">
          <div className={cn("flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] border", tone.ring)}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  {dictionary.premium.health.score}
                </p>
                <p className="mt-1 text-3xl font-semibold tracking-[-0.05em] text-slate-950 dark:text-slate-50">
                  {scoreLabel}
                </p>
              </div>
              <Activity className="h-4 w-4 text-slate-400" />
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${health.score}%` }} />
            </div>
          </div>
        </div>

        <ul className="space-y-2">
          {health.factors.map((factor) => (
            <li key={factor} className="flex gap-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
              <span>{factor}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
