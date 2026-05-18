"use client";

import { CircleAlert, Info, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PremiumRiskModel } from "@/lib/premium/dashboardInsights";

type Props = {
  risks: PremiumRiskModel[];
};

const severityMeta = {
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

export function PremiumRiskList({ risks }: Props) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Riesgos detectados</CardTitle>
        <CardDescription>Senales cortas para revisar antes de cerrar el mes.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {risks.map((risk) => {
            const meta = severityMeta[risk.severity];
            const Icon = meta.icon;
            return (
              <li
                key={`${risk.title}-${risk.severity}`}
                className="rounded-[22px] border border-[hsl(var(--border)/0.76)] bg-[hsl(var(--muted)/0.38)] p-3"
              >
                <div className="flex items-start gap-3">
                  <div className={cn("mt-0.5 rounded-2xl p-2", meta.className)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{risk.title}</p>
                    <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">{risk.body}</p>
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
