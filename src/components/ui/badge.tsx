import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.04em] transition-colors focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:ring-offset-2 focus:ring-offset-[hsl(var(--background))]",
  {
    variants: {
      variant: {
        default:
          "border-[hsl(var(--primary)/0.18)] bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]",
        secondary:
          "border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.78)] text-[hsl(var(--foreground))]",
        destructive:
          "border-[hsl(var(--danger)/0.24)] bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))]",
        outline:
          "border-[hsl(var(--border))] bg-transparent text-[hsl(var(--foreground))]",
        success:
          "border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]",
        warning:
          "border-[hsl(var(--warning)/0.22)] bg-[hsl(var(--warning)/0.14)] text-[hsl(var(--warning))]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { badgeVariants };
