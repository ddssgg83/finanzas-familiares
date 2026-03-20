import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          "h-12 w-full rounded-2xl border border-[hsl(var(--input))] bg-[hsl(var(--card)/0.84)] px-4 text-sm text-[hsl(var(--foreground))] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none transition-all duration-200 placeholder:text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--border))] focus:border-[hsl(var(--ring))] focus:bg-[hsl(var(--card))] focus:ring-4 focus:ring-[hsl(var(--ring)/0.12)]",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export { Input };
