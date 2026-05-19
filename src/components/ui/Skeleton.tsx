import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SkeletonProps = HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-2xl bg-[hsl(var(--muted)/0.72)]",
        "after:absolute after:inset-0 after:-translate-x-full after:bg-[linear-gradient(90deg,transparent,hsl(var(--card)/0.72),transparent)] after:animate-[shimmer_1.65s_ease-in-out_infinite]",
        "motion-reduce:after:animate-none",
        className
      )}
      {...props}
    />
  );
}
