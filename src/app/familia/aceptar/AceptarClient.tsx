"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PageShell } from "@/components/ui/PageShell";
import { AppHeader } from "@/components/AppHeader";

type InviteRow = {
  id: string;
  family_id: string;
  email: string;
  role: "admin" | "member";
  status: "pending" | "accepted" | "revoked" | "expired";
  invited_by: string | null;
  token: string | null;
  created_at: string;

  expires_at: string | null;
  accepted_at: string | null;
  token_used: boolean | null;
  message: string | null;
};

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  const exp = new Date(expiresAt).getTime();
  if (!Number.isFinite(exp)) return false;
  return Date.now() > exp;
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

  const canRun = useMemo(() => !!token, [token]);

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

      // Requiere sesión
      const { data: sess } = await supabase.auth.getSession();
      const u = sess.session?.user ?? null;

      if (!u) {
        if (!alive) return;
        setNeedsLogin(true);
        setError("Necesitas iniciar sesión para aceptar la invitación.");
        setLoading(false);
        return;
      }

      if (!alive) return;
      setUserEmail(u.email ?? null);
      setUserId(u.id);

      // Aceptar escribe en BD
      if (typeof window !== "undefined" && !navigator.onLine) {
        setError("Para aceptar la invitación necesitas conexión a internet.");
        setLoading(false);
        return;
      }

      try {
        // 1) Cargar invitación por token
        const { data: inv, error: invErr } = await supabase
          .from("family_invites")
          .select(
            "id,family_id,email,role,status,invited_by,token,created_at,expires_at,accepted_at,token_used,message"
          )
          .eq("token", token)
          .maybeSingle();

        if (invErr) throw invErr;
        if (!inv) throw new Error("Invitación no encontrada o token inválido.");

        const inviteRow = inv as InviteRow;
        setInvite(inviteRow);

        // 2) Validar correo
        const myEmail = (u.email ?? "").toLowerCase().trim();
        const invEmail = (inviteRow.email ?? "").toLowerCase().trim();

        if (!myEmail || invEmail !== myEmail) {
          setEmailMismatch(true);
          throw new Error("Esta invitación no corresponde a tu correo.");
        }

        // 3) Expiración
        if (inviteRow.status === "pending" && isExpired(inviteRow.expires_at)) {
          await supabase
            .from("family_invites")
            .update({ status: "expired" })
            .eq("id", inviteRow.id);

          throw new Error("Esta invitación ya expiró. Pide que te envíen una nueva.");
        }

        // 4) Idempotencia
        const alreadyUsed =
          inviteRow.token_used === true || inviteRow.status === "accepted";

        if (alreadyUsed) {
          const { data: existing, error: existErr } = await supabase
            .from("family_members")
            .select("id,status")
            .eq("family_id", inviteRow.family_id)
            .eq("user_id", u.id)
            .maybeSingle();

          if (existErr) throw existErr;

          if (!existing) {
            throw new Error(
              "La invitación ya fue usada. Si no apareces como miembro, pide que te inviten de nuevo."
            );
          }

          await supabase
            .from("family_members")
            .update({ status: "active" })
            .eq("id", (existing as any).id);

          if (!alive) return;
          setSuccess(true);
          return;
        }

        // 5) Estados bloqueados
        if (inviteRow.status !== "pending") {
          throw new Error(
            `Esta invitación ya no está pendiente (estado: ${inviteRow.status}).`
          );
        }

        // 6) Insertar/activar miembro
        const { data: existing, error: existErr } = await supabase
          .from("family_members")
          .select("id,status,role")
          .eq("family_id", inviteRow.family_id)
          .eq("user_id", u.id)
          .maybeSingle();

        if (existErr) throw existErr;

        if (!existing) {
          const { error: insErr } = await supabase.from("family_members").insert([
            {
              family_id: inviteRow.family_id,
              user_id: u.id,
              full_name: u.email ?? "Miembro",
              invited_email: u.email ?? null,
              role: inviteRow.role,
              status: "active",
            },
          ]);
          if (insErr) throw insErr;
        } else {
          const { error: updMemErr } = await supabase
            .from("family_members")
            .update({ status: "active", role: inviteRow.role })
            .eq("id", (existing as any).id);
          if (updMemErr) throw updMemErr;
        }

        // 7) Marcar invitación accepted + token_used
        const nowISO = new Date().toISOString();
        const { error: updErr } = await supabase
          .from("family_invites")
          .update({
            status: "accepted",
            accepted_at: nowISO,
            token_used: true,
          })
          .eq("id", inviteRow.id);

        if (updErr) throw updErr;

        if (!alive) return;
        setSuccess(true);
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
  }, [token]);

  const invitedEmail = invite?.email ?? null;

  const goLogin = (mode: "login" | "signup") => {
    // Guardamos el token para que onboarding lo regrese aquí
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("acceptInviteToken", token);
      } catch {}
    }

    // Si tu onboarding soporta params, mandamos contexto
    const url =
      `/onboarding?next=${encodeURIComponent(`/familia/aceptar?token=${token}`)}` +
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
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {loading ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Procesando invitación…
            </p>
          ) : success ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">
                ✅ Invitación aceptada
              </p>
              <p className="text-[12px] text-slate-600 dark:text-slate-300">
                Ya eres parte de la familia. Puedes ir al módulo Familia y ver el dashboard familiar.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href="/familia"
                  className="rounded-full bg-sky-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-sky-700"
                >
                  Ir a Familia
                </a>
                <a
                  href="/familia/dashboard"
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
                >
                  Ir a Dashboard Familiar
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-rose-700 dark:text-rose-200">
                No se pudo aceptar la invitación
              </p>
              <p className="text-[12px] text-slate-600 dark:text-slate-300">
                {error ?? "Intenta de nuevo."}
              </p>

              {/* ✅ Si no hay sesión: botones de login/signup */}
              {needsLogin ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="text-[12px] text-slate-700 dark:text-slate-200">
                    Para aceptar la invitación necesitas iniciar sesión con el correo invitado.
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => goLogin("login")}
                      className="rounded-full bg-slate-900 px-4 py-2 text-[12px] font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                    >
                      Iniciar sesión
                    </button>
                    <button
                      onClick={() => goLogin("signup")}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
                    >
                      Crear cuenta
                    </button>
                  </div>
                </div>
              ) : null}

              {/* ✅ UX PRO cuando el correo no coincide */}
              {emailMismatch && invitedEmail ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="text-[12px] text-slate-700 dark:text-slate-200">
                    Estás conectado como{" "}
                    <span className="font-semibold">{userEmail ?? "—"}</span>, pero esta invitación es para{" "}
                    <span className="font-semibold">{invitedEmail}</span>.
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={onSignOutAndGoLogin}
                      disabled={signingOut}
                      className="rounded-full bg-slate-900 px-4 py-2 text-[12px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                    >
                      {signingOut ? "Cerrando sesión…" : "Cerrar sesión e ingresar con el correo invitado"}
                    </button>

                    <button
                      onClick={onCopyInvitedEmail}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
                    >
                      {copied ? "Copiado ✅" : "Copiar correo invitado"}
                    </button>
                  </div>
                </div>
              ) : null}

              {!canRun && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Asegúrate de abrir el link con <code>?token=...</code>
                </p>
              )}
            </div>
          )}
        </div>
      </PageShell>
    </main>
  );
}
