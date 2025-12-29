"use client";

type Props = {
  pendingCount?: number;
  isOnline?: boolean;
  syncing?: boolean;
  className?: string;
};

export function SyncBadge({
  pendingCount = 0,
  isOnline = true,
  syncing = false,
  className = "",
}: Props) {
  const hasPending = pendingCount > 0;

  // ✅ Mensajes más “premium”
  const label = syncing
    ? "Sincronizando…"
    : !isOnline
    ? hasPending
      ? `Sin conexión · Pendientes: ${pendingCount}`
      : "Sin conexión"
    : hasPending
    ? `Pendientes: ${pendingCount}`
    : "Sincronizado";

  // ✅ Tonos: azul (sync), ámbar (pendiente/offline), verde (ok)
  const tone = syncing
    ? "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-100"
    : !isOnline || hasPending
    ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100"
    : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100";

  const dot = syncing
    ? "bg-sky-500"
    : !isOnline || hasPending
    ? "bg-amber-500"
    : "bg-emerald-500";

  const dotAnim = syncing || hasPending ? "animate-pulse" : "";

  return (
    <span
      aria-live="polite"
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold",
        "select-none whitespace-nowrap",
        tone,
        className,
      ].join(" ")}
      title={label}
    >
      {/* Dot */}
      <span className={["h-2 w-2 rounded-full", dot, dotAnim].join(" ")} />

      {/* Spinner solo en syncing */}
      {syncing && (
        <span
          className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
          aria-hidden="true"
        />
      )}

      {label}
    </span>
  );
}
