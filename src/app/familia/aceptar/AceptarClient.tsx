// =======================================
// FILE: src/app/familia/aceptar/AceptarClient.tsx
// =======================================

"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PageShell } from "@/components/ui/PageShell";
import { AppHeader } from "@/components/AppHeader";
import {
  Button,
  Card,
  EmptyState,
  Help,
  LinkButton,
  Section,
} from "@/components/ui/kit";

type InviteRow = {
  id: string;
  family_id: string;
  email: string;
  role: "admin" | "member";
  status: "pending" | "accepted" | "revoked" | "expired";
  created_at: string | null;

  expires_at: string | null;
  accepted_at: string | null;
  token_used: boolean | null;
  message: string | null;
};

function formatDateMX(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-MX");
  } catch {
    return iso;
  }
}

export default function AceptarClient() {
  const sp = useSearchParams();
  const router = useRouter();
  const token = (sp.get("token") ?? "").trim();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // UX extra
  const [needsLogin, setNeedsLogin] = useState(false);
  const [emailMismatch, setEmailMismatch] = useState(false);
  const [copied, setCopied] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const canRun = useMemo(() => !!token, [token]);
  const invitedEmail = invite?.email ?? null;

  // ✅ OPCIÓN A (la buena): SOLO usamos next=... y que OnboardingClient lo persista.
  const goLogin = (mode: "login" | "signup") => {
    const next = `/familia/aceptar?token=${encodeURIComponent(token)}`;

    const url =
      `/onboarding?next=${encodeURIComponent(next)}` +
      (invitedEmail ? `&email=${encodeURIComponent(invitedEmail)}` : "") +
      `&mode=${mode}`;

    router.replace(url);
  };

  const onCopyInvitedEmail = async () => {
    try {
      if (!invitedEmail) return;
      await navigator.clipboard.writeText(invitedEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const onSignOutAndGoLogin = async () => {
    try {
      setSigningOut(true);
      await supabase.auth.signOut();
      goLogin("login");
    } finally {
      setSigningOut(false);
    }
  };

  const fetchPreview = async (): Promise<InviteRow | null> => {
    const res = await fetch("/api/family/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, mode: "preview" }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok !== true) {
      throw new Error(json?.error || "No se pudo cargar la invitación.");
    }

    return (json.invite ?? null) as InviteRow | null;
  };

  const acceptInvite = async (accessToken: string) => {
    const res = await fetch("/api/family/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token, mode: "accept" }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok !== true) {
      const code = String(json?.code ?? "");
      if (code === "NEEDS_LOGIN") {
        setNeedsLogin(true);
      }
      if (code === "EMAIL_MISMATCH") {
        setEmailMismatch(true);
      }
      throw new Error(json?.error || "No se pudo aceptar la invitación.");
    }
  };

  useEffect(() => {
    let alive = true;

    const run = async () => {
      setLoading(true);
      setError(null);
      setSuccess(false);
      setInvite(null);
      setNeedsLogin(false);
      setEmailMismatch(false);
      setCopied(false);

      if (!token) {
        setError("Falta el token de invitación.");
        setLoading(false);
        return;
      }

      if (typeof window !== "undefined" && !navigator.onLine) {
        setError("Para aceptar la invitación necesitas conexión a internet.");
        setLoading(false);
        return;
      }

      try {
        // 1) Preview server-side (sin depender de RLS)
        const inv = await fetchPreview();
        if (!alive) return;
        setInvite(inv);

        // 2) Sesión
        const { data: sess } = await supabase.auth.getSession();
        const u = sess.session?.user ?? null;

        if (!u) {
          setNeedsLogin(true);
          setError("Necesitas iniciar sesión para aceptar la invitación.");
          setLoading(false);
          return;
        }

        if (!alive) return;
        setUserEmail(u.email ?? null);
        setUserId(u.id);

        // 3) Accept server-side (valida email + idempotencia)
        const accessToken = sess.session?.access_token;
        if (!accessToken) {
          setNeedsLogin(true);
          setError("Sesión inválida. Vuelve a iniciar sesión.");
          setLoading(false);
          return;
        }

        await acceptInvite(accessToken);
        if (!alive) return;

        setSuccess(true);

        // refrescar preview (para status accepted/message)
        const inv2 = await fetchPreview().catch(() => null);
        if (!alive) return;
        if (inv2) setInvite(inv2);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "No se pudo aceptar la invitación.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    run();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const onTryAgain = async () => {
    if (!token) return;
    if (typeof window !== "undefined" && !navigator.onLine) {
      setError("Necesitas conexión a internet.");
      return;
    }

    try {
      setAccepting(true);
      setError(null);

      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      const u = sess.session?.user ?? null;

      if (!u || !accessToken) {
        setNeedsLogin(true);
        setError("Necesitas iniciar sesión para aceptar la invitación.");
        return;
      }

      setUserEmail(u.email ?? null);
      setUserId(u.id);

      await acceptInvite(accessToken);
      setSuccess(true);

      const inv2 = await fetchPreview().catch(() => null);
      if (inv2) setInvite(inv2);
    } catch (e: any) {
      setError(e?.message ?? "No se pudo aceptar la invitación.");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col pb-16 md:pb-4">
      <AppHeader
        title="Aceptar invitación"
        subtitle="Únete a tu familia y activa el dashboard familiar."
        activeTab="familia"
        userEmail={userEmail ?? undefined}
        userId={userId ?? undefined}
      />

      <PageShell maxWidth="3xl">
        <Card>
          <Section
            title={success ? "✅ Invitación aceptada" : "Aceptar invitación"}
            subtitle={
              success
                ? "Ya eres parte de la familia."
                : "Verificamos tu token y tu sesión para unirte de forma segura."
            }
            right={
              invite?.status ? (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Estado: <span className="font-semibold">{invite.status}</span>
                </span>
              ) : null
            }
          >
            {loading ? (
              <EmptyState>Procesando invitación…</EmptyState>
            ) : success ? (
              <div className="space-y-3">
                <div className="text-[12px] text-slate-600 dark:text-slate-300">
                  Puedes ir al módulo Familia y ver el dashboard familiar.
                </div>

                {invite?.message ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                    <div className="font-semibold">Mensaje</div>
                    <div className="mt-1">{invite.message}</div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <a href="/familia">
                    <Button>Ir a Familia</Button>
                  </a>
                  <a href="/familia/dashboard">
                    <Button>Ir a Dashboard Familiar</Button>
                  </a>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-[12px] text-slate-600 dark:text-slate-300">
                  {error ?? "Intenta de nuevo."}
                </div>

                {invite ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                    <div>
                      Invitación para:{" "}
                      <span className="font-semibold">{invite.email}</span>
                    </div>
                    <div>
                      Rol: <span className="font-semibold">{invite.role}</span>
                    </div>
                    {invite.expires_at ? (
                      <div>
                        Expira:{" "}
                        <span className="font-semibold">{formatDateMX(invite.expires_at)}</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {!canRun ? (
                  <Help>
                    Asegúrate de abrir el link con <code>?token=...</code>
                  </Help>
                ) : null}

                {needsLogin ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                    <div className="text-[12px] text-slate-700 dark:text-slate-200">
                      Para aceptar la invitación necesitas iniciar sesión con el correo invitado.
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button onClick={() => goLogin("login")}>Iniciar sesión</Button>
                      <Button onClick={() => goLogin("signup")}>Crear cuenta</Button>

                      {invitedEmail ? (
                        <LinkButton tone="info" onClick={onCopyInvitedEmail}>
                          {copied ? "Copiado ✅" : "Copiar correo invitado"}
                        </LinkButton>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {emailMismatch && invitedEmail ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                    <div className="text-[12px] text-slate-700 dark:text-slate-200">
                      Estás conectado como{" "}
                      <span className="font-semibold">{userEmail ?? "—"}</span>, pero esta invitación
                      es para{" "}
                      <span className="font-semibold">{invitedEmail}</span>.
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button onClick={onSignOutAndGoLogin} disabled={signingOut}>
                        {signingOut ? "Cerrando sesión…" : "Cerrar sesión e ingresar con el correo invitado"}
                      </Button>

                      <LinkButton tone="info" onClick={onCopyInvitedEmail}>
                        {copied ? "Copiado ✅" : "Copiar correo invitado"}
                      </LinkButton>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button onClick={onTryAgain} disabled={accepting || !canRun}>
                    {accepting ? "Intentando…" : "Intentar de nuevo"}
                  </Button>
                  <a href="/familia">
                    <LinkButton tone="info">Ir a Familia</LinkButton>
                  </a>
                </div>
              </div>
            )}
          </Section>
        </Card>
      </PageShell>
    </main>
  );
}