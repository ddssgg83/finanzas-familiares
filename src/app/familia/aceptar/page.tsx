// =======================================
// FILE: src/app/familia/aceptar/page.tsx
// =======================================

import { Suspense } from "react";
import AceptarClient from "./AceptarClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm">Cargando…</div>}>
      <AceptarClient />
    </Suspense>
  );
}