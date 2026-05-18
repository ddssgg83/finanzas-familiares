"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  eyebrow: string;
  title: string;
  body: string;
  href?: string;
  actionLabel?: string;
  icon: ComponentType<{ className?: string }>;
  tone?: "default" | "good" | "warning";
};

const toneClasses = {
  default: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  good: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/12 text-amber-800 dark:text-amber-300",
};

export function PremiumInsightCard({
  eyebrow,
  title,
  body,
  href,
  actionLabel,
  icon: Icon,
  tone = "default",
}: Props) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-4 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className={cn("rounded-[20px] p-3", toneClasses[tone])}>
            <Icon className="h-5 w-5" />
          </div>
          <Badge variant="secondary">{eyebrow}</Badge>
        </div>

        <div className="space-y-2">
          <h3 className="text-lg font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-50">
            {title}
          </h3>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{body}</p>
        </div>

        {href && actionLabel ? (
          <div className="mt-auto pt-1">
            <Link href={href} className={cn(buttonVariants({ variant: "outline" }), "w-full justify-between")}>
              {actionLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
