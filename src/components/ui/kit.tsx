import * as React from "react";

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900",
        className
      )}
    >
      {children}
    </section>
  );
}

export function Section({
  title,
  subtitle,
  right,
  children,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      {(title || subtitle || right) && (
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            {title && (
              <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
            )}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300">
      {children}
    </label>
  );
}

export function Help({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{children}</div>;
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      {...props}
      className={cn(
        "h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm leading-normal text-slate-900 outline-none transition",
        "focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/20",
        "dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100",
        className
      )}
    />
  );
});

Input.displayName = "Input";

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm leading-normal text-slate-900 outline-none transition",
        "focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/20",
        "dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100",
        props.className
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-[96px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-normal text-slate-900 outline-none transition",
        "focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/20",
        "dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100",
        props.className
      )}
    />
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
}) {
  const base = "h-10 rounded-xl px-4 text-sm transition disabled:opacity-60";
  const styles =
    variant === "primary"
      ? "w-full bg-slate-900 font-semibold text-white shadow-sm hover:bg-black dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
      : "border border-slate-200 bg-white font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

  return <button {...props} className={cn(base, styles, className)} />;
}

export function LinkButton({
  tone = "info",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "info" | "danger" }) {
  return (
    <button
      {...props}
      className={cn(
        "text-[11px] font-medium hover:underline",
        tone === "danger"
          ? "text-rose-600 dark:text-rose-400"
          : "text-sky-600 dark:text-sky-400",
        props.className
      )}
    />
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  help,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  label?: string;
  help?: string;
}) {
  return (
    <div className="space-y-2">
      {label && <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>}
      <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 text-[11px] dark:border-slate-700 dark:bg-slate-900">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "rounded-full px-3 py-1",
                active
                  ? "bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900"
                  : "text-slate-700 dark:text-slate-200"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {help && <p className="max-w-xs text-[11px] text-slate-500 dark:text-slate-400">{help}</p>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "neutral" | "good" | "bad";
}) {
  const valueClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
      ? "text-rose-600 dark:text-rose-400"
      : "text-slate-900 dark:text-slate-100";

  return (
    <Card className="p-4">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tracking-tight", valueClass)}>{value}</div>
      {hint && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
    </Card>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-500 dark:text-slate-400">{children}</p>;
}

export function ListItem({
  left,
  right,
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-0 flex-1">{left}</div>
      {right ? <div className="flex flex-col items-end gap-1">{right}</div> : null}
    </li>
  );
}
