"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";
import { PageShell } from "@/components/ui/PageShell";

type Out = {
  status: number;
  ok: boolean;
  data: any;
};

export default function InvitarTestPage() {
  const [familyId, setFamilyId] = useState("25270fec-43f2-4a68-87d7-4468872fbd15");
  const [email, setEmail] = useState("contador@rek.com.mx");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [message, setMessage] = useState<string>("");
  const [out, setOut] = useState<Out | null>(null);

  const [sessionEmail, setSessionEmail] = useState<string>("(cargando...)");
  const [hasToken, setHasToken] = useState<boolean>(false);

  // DEBUG: ver sesión real
  useEffect(() => {
    let alive = true;

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const s = data.session;

      if (!alive) return;
      setSessionEmail(s?.user?.email ?? "(NO HAY SESIÓN)");
      setHasToken(!!s?.access_token);
    };

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const send = async () => {
    setOut(null);

    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    if (!accessToken) {
      setOut({
        status: 401,
        ok: false,
        data: { error: "No hay sesión. Inicia sesión y vuelve a intentar." },
      });
      return;
    }

    const payload = {
      familyId: familyId.trim(),
      email: email.trim(),
      role,
      inviterName: "RINDAY",
      message: message.trim() ? message.trim() : null,
    };

    const res = await fetch("/api/family/invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = { error: "No JSON response" };
    }

    setOut({
      status: res.status,
      ok: res.ok,
      data: json,
    });
  };

  return (
    <main className="flex min-h-screen flex-col pb-16 md:pb-4">
      <AppHeader
        title="Invitar test"
        subtitle="Prueba rápida del endpoint /api/family/invite"
        activeTab="familia"
        userEmail={sessionEmail.includes("@") ? sessionEmail : undefined}
      />

      <PageShell maxWidth="3xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
            <div>
              <b>Sesión:</b> {sessionEmail}
            </div>
            <div>
              <b>Access token:</b> {hasToken ? "✅ Sí" : "❌ No"}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-semibold">familyId</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                value={familyId}
                onChange={(e) => setFamilyId(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-semibold">email</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-semibold">role</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold">message (opcional)</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <button
              onClick={send}
              className="rounded-full bg-sky-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-sky-700"
            >
              Enviar invitación
            </button>

            {out && (
              <pre className="mt-4 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
{JSON.stringify(out, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </PageShell>
    </main>
  );
}
