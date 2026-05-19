"use client";

import { Sparkles, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PremiumHealthCard } from "@/components/premium/PremiumHealthCard";
import { PremiumCoachPanel } from "@/components/premium/PremiumCoachPanel";
import { PremiumInsightCard } from "@/components/premium/PremiumInsightCard";
import { PremiumProjectionCard } from "@/components/premium/PremiumProjectionCard";
import { PremiumRiskList } from "@/components/premium/PremiumRiskList";
import { PremiumSignalList } from "@/components/premium/PremiumSignalList";
import type { PremiumDashboardModel } from "@/lib/premium/dashboardInsights";

type Props = {
  model: PremiumDashboardModel;
};

export function PremiumPreview({ model }: Props) {
  return (
    <section className="space-y-3 md:space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between md:gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Vista premium</Badge>
            <span className="text-xs text-slate-500 dark:text-slate-400">Calculado con tus datos actuales</span>
          </div>
          <div>
            <p className="eyebrow">Insights financieros</p>
            <h2 className="section-title">Decisiones claras para este mes</h2>
          </div>
        </div>
        <p className="max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          Lecturas calculadas con tus movimientos, patrimonio y contexto familiar actual.
        </p>
      </div>

      <div className="grid gap-3 md:gap-4 xl:grid-cols-[1.05fr,0.95fr]">
        <PremiumHealthCard health={model.health} />
        <PremiumInsightCard
          eyebrow="Siguiente acción"
          title={model.nextAction.title}
          body={model.nextAction.body}
          href={model.nextAction.href}
          actionLabel={model.nextAction.actionLabel}
          icon={Sparkles}
          tone="good"
        />
      </div>

      <div className="grid gap-3 md:gap-4 lg:grid-cols-[1fr,0.86fr]">
        <PremiumRiskList risks={model.risks} />
        <PremiumInsightCard
          eyebrow="Familia"
          title={model.familySummary.title}
          body={model.familySummary.body}
          href={model.familySummary.href}
          actionLabel={model.familySummary.actionLabel}
          icon={UsersRound}
          tone="default"
        />
      </div>

      <div className="grid gap-3 md:gap-4 lg:grid-cols-[1fr,0.86fr]">
        <PremiumSignalList signals={model.signals} />
        <PremiumProjectionCard projection={model.projection} />
      </div>

      <PremiumCoachPanel model={model} />
    </section>
  );
}
