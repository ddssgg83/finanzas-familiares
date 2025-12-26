import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          "h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-[15px] text-slate-900 outline-none transition " +
            "focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/20 " +
            "dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export { Input };
