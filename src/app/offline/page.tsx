// src/app/offline/page.tsx
"use client";

import { useEffect, useState } from "react";

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return navigator.onLine;
  });

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const handleReload = () => {
    // recarga dura para intentar recuperar chunks/session/caché
    window.location.reload();
  };

  const goHome = () => {
    window.location.href = "/";
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold">
              {isOnline ? "Conexión restaurada" : "Estás sin conexión"}
            </h1>
            <p className="mt-2 text-[12px] text-slate-600 dark:text-slate-300">
              {isOnline
                ? "Ya volvió el internet. Recarga para volver a la app normal."
                : "Puedes seguir usando tu app. Tus movimientos se guardan localmente y se sincronizan cuando vuelva el internet."}
            </p>
          </div>

          <span
            className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isOnline
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-100"
                : "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-100"
            }`}
          >
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600 dark:bg-slate-950 dark:text-slate-300">
          Tip: si caes aquí por un <span className="font-semibold">hard refresh</span>,
          normalmente es por caché del Service Worker. Con internet de vuelta,
          presiona <span className="font-semibold">Recargar</span>.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={handleReload}
            className="inline-flex w-full items-center justify-center rounded-full bg-sky-500 px-4 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-sky-600"
          >
            Recargar
          </button>

          <button
            type="button"
            onClick={goHome}
            className="inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            Volver al Dashboard
          </button>
        </div>

        {!isOnline && (
          <p className="mt-3 text-center text-[10px] text-slate-400 dark:text-slate-500">
            Cuando tu conexión vuelva, esta pantalla cambiará a “Conexión restaurada”.
          </p>
        )}
      </div>
    </main>
  );
}
