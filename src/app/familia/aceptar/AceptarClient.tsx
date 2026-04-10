"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { PageShell } from "@/components/ui/PageShell";
import { Button, Card, EmptyState, Help, LinkButton, Section } from "@/components/ui/kit";
import { supabase } from "@/lib/supabase";
import { getSupabaseConfigError, prettySupabaseAuthError } from "@/lib/authErrors";

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
  family_name?: string | null;
};

type AuthMode = "signup" | "login";

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

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [emailMismatch, setEmailMismatch] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const [authMode, setAuthMode] = useState<AuthMode>("signup");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);

  const canRun = useMemo(() => !!token, [token]);
  const invitedEmail = invite?.email ?? null;

  const fetchPreview = useCallback(async (): Promise<InviteRow | null> => {
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
  }, [token]);

  const acceptInvite = useCallback(async (accessToken: string) => {
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
      if (code === "NEEDS_LOGIN") setNeedsAuth(true);
      if (code === "EMAIL_MISMATCH") setEmailMismatch(true);
      throw new Error(json?.error || "No se pudo aceptar la invitación.");
    }
  }, [token]);

  const completeInviteAcceptance = useCallback(async () => {
    setAccepting(true);
    setError(null);
    setAuthError(null);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      const u = sess.session?.user ?? null;

      if (!u || !accessToken) {
        setNeedsAuth(true);
        setError("Necesitas autenticarte para aceptar la invitación.");
        return;
      }

      setUserEmail(u.email ?? null);
      setUserId(u.id);
      await acceptInvite(accessToken);
      setSuccess(true);
      setNeedsAuth(false);
      setEmailMismatch(false);

      const refreshedInvite = await fetchPreview().catch(() => null);
      if (refreshedInvite) setInvite(refreshedInvite);

      router.replace("/familia");
    } catch (e: any) {
      setError(e?.message ?? "No se pudo aceptar la invitación.");
    } finally {
      setAccepting(false);
    }
  }, [acceptInvite, fetchPreview, router]);

  const onSignOutWrongSession = async () => {
    try {
      setSigningOut(true);
      setAuthError(null);
      setAuthInfo(null);
      await supabase.auth.signOut();
      setUserEmail(null);
      setUserId(null);
      setEmailMismatch(false);
      setNeedsAuth(true);
      setError(null);
    } catch (e: any) {
      setAuthError(e?.message ?? "No se pudo cerrar la sesión actual.");
    } finally {
      setSigningOut(false);
    }
  };

  const handleSignUp = async () => {
    const normalizedEmail = (invitedEmail ?? "").trim().toLowerCase();

    setAuthBusy(true);
    setAuthError(null);
    setAuthInfo(null);
    setError(null);

    try {
      const configError = getSupabaseConfigError();
      if (configError) {
        setAuthError(configError);
        return;
      }

      if (!fullName.trim()) {
        setAuthError("Escribe tu nombre para crear la cuenta.");
        return;
      }
      if (password.length < 6) {
        setAuthError("Tu contraseña debe tener al menos 6 caracteres.");
        return;
      }
      if (password !== confirmPassword) {
        setAuthError("Las contraseñas no coinciden.");
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (signUpError) {
        setAuthError(prettySupabaseAuthError(signUpError.message));
        return;
      }

      let hasSession = !!data.session;

      if (!hasSession) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (signInError || !signInData.session) {
          setAuthError(
            "La cuenta se creó, pero no pudimos iniciar sesión automáticamente. Revisa si tu proyecto exige confirmación por correo o intenta con Ya tengo cuenta."
          );
          return;
        }

        hasSession = true;
      }

      if (!hasSession) {
        setAuthError("No pudimos abrir tu sesión después de crear la cuenta.");
        return;
      }

      setAuthInfo("Cuenta creada. Estamos agregándote a la familia…");
      await completeInviteAcceptance();
    } catch (e: any) {
      setAuthError(prettySupabaseAuthError(e?.message));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignIn = async () => {
    const normalizedEmail = (invitedEmail ?? "").trim().toLowerCase();

    setAuthBusy(true);
    setAuthError(null);
    setAuthInfo(null);
    setError(null);

    try {
      const configError = getSupabaseConfigError();
      if (configError) {
        setAuthError(configError);
        return;
      }

      if (!password) {
        setAuthError("Escribe tu contraseña para continuar.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInError) {
        setAuthError(prettySupabaseAuthError(signInError.message));
        return;
      }

      setAuthInfo("Sesión iniciada. Estamos agregándote a la familia…");
      await completeInviteAcceptance();
    } catch (e: any) {
      setAuthError(prettySupabaseAuthError(e?.message));
    } finally {
      setAuthBusy(false);
    }
  };

  useEffect(() => {
    let alive = true;

    const run = async () => {
      setLoading(true);
      setError(null);
      setSuccess(false);
      setInvite(null);
      setNeedsAuth(false);
      setEmailMismatch(false);
      setAuthError(null);
      setAuthInfo(null);

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
        const inv = await fetchPreview();
        if (!alive) return;
        setInvite(inv);

        if (inv?.status === "revoked" || inv?.status === "expired") {
          setError("Esta invitación ya no está disponible.");
          setLoading(false);
          return;
        }

        const { data: sess } = await supabase.auth.getSession();
        const u = sess.session?.user ?? null;

        if (!alive) return;

        if (!u) {
          setNeedsAuth(true);
          setLoading(false);
          return;
        }

        setUserEmail(u.email ?? null);
        setUserId(u.id);

        const sessionEmail = String(u.email ?? "").toLowerCase().trim();
        const inviteEmail = String(inv?.email ?? "").toLowerCase().trim();

        if (inviteEmail && sessionEmail && sessionEmail !== inviteEmail) {
          setEmailMismatch(true);
          setNeedsAuth(false);
          setError(null);
          setLoading(false);
          return;
        }

        await completeInviteAcceptance();
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "No se pudo aceptar la invitación.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    void run();

    return () => {
      alive = false;
    };
  }, [completeInviteAcceptance, fetchPreview, token]);

  return (
    <main className="flex min-h-screen flex-col pb-16 md:pb-4">
      <AppHeader
        title="Aceptar invitación"
        subtitle="Únete a tu familia con un flujo corto y seguro."
        activeTab="familia"
        userEmail={userEmail ?? undefined}
        userId={userId ?? undefined}
      />

      <PageShell maxWidth="3xl">
        <Card>
          <Section
            title={success ? "Invitación aceptada" : "Aceptar invitación"}
            subtitle={
              success
                ? "Tu acceso familiar quedó listo."
                : "Confirma tu cuenta y entra directo al espacio familiar."
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
              <EmptyState>Preparando tu invitación…</EmptyState>
            ) : (
              <div className="space-y-4">
                {invite ? (
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          Invitación
                        </div>
                        <div className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-50">
                          {invite.family_name?.trim() || "Tu familia en RINDAY"}
                        </div>
                      </div>
                      <div className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-medium dark:border-slate-700">
                        Rol: {invite.role}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          Correo invitado
                        </div>
                        <div className="mt-1 font-medium">{invite.email}</div>
                      </div>

                      {invite.expires_at ? (
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                            Expira
                          </div>
                          <div className="mt-1 font-medium">{formatDateMX(invite.expires_at)}</div>
                        </div>
                      ) : null}
                    </div>

                    {invite.message ? (
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 text-[13px] dark:border-slate-800 dark:bg-slate-900">
                        <div className="font-semibold">Mensaje</div>
                        <div className="mt-1">{invite.message}</div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {!canRun ? (
                  <Help>
                    Asegúrate de abrir el enlace completo con <code>?token=...</code>
                  </Help>
                ) : null}

                {error ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                    {error}
                  </div>
                ) : null}

                {success ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                      Ya eres parte de la familia. Te estamos llevando al dashboard familiar.
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <a href="/familia">
                        <Button>Ir a Familia</Button>
                      </a>
                      <a href="/familia/dashboard">
                        <LinkButton tone="info">Ir a Dashboard Familiar</LinkButton>
                      </a>
                    </div>
                  </div>
                ) : emailMismatch ? (
                  <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
                    <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                      Esta invitación es para otro correo
                    </div>
                    <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
                      Tienes una sesión abierta como <span className="font-semibold">{userEmail ?? "otro correo"}</span>,
                      pero la invitación corresponde a <span className="font-semibold">{invitedEmail ?? "el correo invitado"}</span>.
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button onClick={onSignOutWrongSession} disabled={signingOut}>
                        {signingOut ? "Cerrando sesión…" : "Cerrar sesión y continuar"}
                      </Button>
                    </div>
                  </div>
                ) : needsAuth ? (
                  <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-base font-semibold text-slate-900 dark:text-slate-50">
                          {authMode === "signup" ? "Crea tu cuenta" : "Inicia sesión"}
                        </div>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          {authMode === "signup"
                            ? "Completa tu cuenta y te agregamos a la familia al terminar."
                            : "Entra con tu contraseña y te agregamos a la familia en el mismo paso."}
                        </p>
                      </div>

                      <div className="inline-flex rounded-full border border-slate-200 p-1 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode("signup");
                            setAuthError(null);
                            setAuthInfo(null);
                            setPassword("");
                            setConfirmPassword("");
                          }}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                            authMode === "signup"
                              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950"
                              : "text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          Crear cuenta
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode("login");
                            setAuthError(null);
                            setAuthInfo(null);
                            setConfirmPassword("");
                          }}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                            authMode === "login"
                              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950"
                              : "text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          Ya tengo cuenta
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 space-y-4">
                      <div>
                        <label className="mb-1 block text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                          Correo invitado
                        </label>
                        <input
                          value={invitedEmail ?? ""}
                          readOnly
                          className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 text-sm text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                        />
                      </div>

                      {authMode === "signup" ? (
                        <div>
                          <label className="mb-1 block text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                            Nombre
                          </label>
                          <input
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            disabled={authBusy}
                            autoComplete="name"
                            placeholder="Cómo quieres aparecer en la familia"
                            className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-sky-900/30"
                          />
                        </div>
                      ) : null}

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                            Contraseña
                          </label>
                          <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={authBusy}
                            autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                            placeholder={authMode === "signup" ? "Mínimo 6 caracteres" : "Tu contraseña"}
                            className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-sky-900/30"
                          />
                        </div>

                        {authMode === "signup" ? (
                          <div>
                            <label className="mb-1 block text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                              Confirmar contraseña
                            </label>
                            <input
                              type="password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              disabled={authBusy}
                              autoComplete="new-password"
                              placeholder="Repite tu contraseña"
                              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-sky-900/30"
                            />
                          </div>
                        ) : null}
                      </div>

                      {authError ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                          {authError}
                        </div>
                      ) : null}

                      {authInfo ? (
                        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200">
                          {authInfo}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={authMode === "signup" ? handleSignUp : handleSignIn}
                          disabled={authBusy || accepting}
                        >
                          {authBusy || accepting
                            ? "Procesando…"
                            : authMode === "signup"
                            ? "Crear cuenta y unirme"
                            : "Entrar y unirme"}
                        </Button>

                        <a href="/familia">
                          <LinkButton tone="info">Volver a Familia</LinkButton>
                        </a>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={completeInviteAcceptance} disabled={accepting || !canRun}>
                      {accepting ? "Procesando…" : "Aceptar invitación"}
                    </Button>
                    <a href="/familia">
                      <LinkButton tone="info">Volver a Familia</LinkButton>
                    </a>
                  </div>
                )}
              </div>
            )}
          </Section>
        </Card>
      </PageShell>
    </main>
  );
}
