// src/app/familia/aceptar/page.tsx
import { Suspense } from "react";
import AceptarClient from "./AceptarClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col pb-16 md:pb-4">
          <div className="mx-auto w-full max-w-3xl px-4 py-10">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm text-slate-600 dark:text-slate-300">Cargando…</p>
            </div>
          </div>
        </main>
      }
    >
      <AceptarClient />
    </Suspense>
  );
}
