import { Suspense } from "react";
import OnboardingClient from "./OnboardingClient";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Cargando…</div>}>
      <OnboardingClient />
    </Suspense>
  );
}
