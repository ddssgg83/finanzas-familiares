"use client";

type Scope = "personal" | "family";

export function ScopeToggle({
  value,
  onChange,
  label = "Vista",
  help,
}: {
  value: Scope;
  onChange: (v: Scope) => void;
  label?: string;
  help?: string;
}) {
  return (
    <div className="flex flex-col items-start gap-2 text-xs md:items-end">
      <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>

      <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 text-[11px] dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => onChange("personal")}
          className={`rounded-full px-3 py-1 transition ${
            value === "personal"
              ? "bg-sky-500 text-white"
              : "text-slate-700 hover:bg-white/60 dark:text-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          Sólo yo
        </button>
        <button
          type="button"
          onClick={() => onChange("family")}
          className={`rounded-full px-3 py-1 transition ${
            value === "family"
              ? "bg-sky-500 text-white"
              : "text-slate-700 hover:bg-white/60 dark:text-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          Familia
        </button>
      </div>

      {help ? (
        <p className="max-w-xs text-[11px] text-slate-500 dark:text-slate-400">
          {help}
        </p>
      ) : null}
    </div>
  );
}
