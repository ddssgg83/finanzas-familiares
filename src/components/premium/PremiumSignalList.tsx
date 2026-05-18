"use client";

import { CheckCircle2, CircleAlert, Info, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { FinancialSignal } from "@/lib/premium/financialSignals";

type Props = {
  signals: FinancialSignal[];
};

const severityMeta = {
  good: {
    icon: CheckCircle2,
    className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  },
  info: {
    icon: Info,
    className: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  },
  warning: {
    icon: CircleAlert,
    className: "bg-amber-500/12 text-amber-800 dark:text-amber-300",
  },
  critical: {
    icon: ShieldAlert,
    className: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  },
};

export function PremiumSignalList({ signals }: Props) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Señales inteligentes</CardTitle>
        <CardDescription>Lecturas locales, sin IA y sin esperar red externa.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {signals.map((signal) => {
            const meta = severityMeta[signal.severity];
            const Icon = meta.icon;

            return (
              <li
                key={signal.id}
                className="rounded-[22px] border border-[hsl(var(--border)/0.76)] bg-[hsl(var(--muted)/0.34)] p-3"
              >
                <div className="flex items-start gap-3">
                  <div className={cn("mt-0.5 rounded-2xl p-2", meta.className)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                        {signal.title}
                      </p>
                      {signal.metric ? (
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {signal.metric}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">{signal.body}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
