// =======================================
// FILE: src/app/api/family/invite/route.ts
// =======================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const runtime = "nodejs"; // ✅ necesario para nodemailer en Vercel

// ===============================
// Helpers
// ===============================
function escapeHtml(str: string) {
  return String(str ?? "").replace(/[&<>"']/g, (m) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[m] ?? m;
  });
}

function renderInviteEmailHTML(opts: {
  inviterName: string;
  inviteUrl: string;
  inviteeEmail: string;
  message?: string | null;
}) {
  const inviterName = escapeHtml(opts.inviterName || "Un miembro de tu familia");
  const inviteeEmail = escapeHtml(opts.inviteeEmail);
  const inviteUrl = opts.inviteUrl;
  const customMsg = opts.message ? escapeHtml(opts.message) : "";

  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="100%" style="max-width:560px;background:#FFFFFF;border-radius:16px;padding:32px;box-shadow:0 8px 30px rgba(15,23,42,0.08);" role="presentation">
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <img src="https://rinday.app/brand/rinday-logo.svg" alt="RINDAY" height="32" />
            </td>
          </tr>

          <tr>
            <td style="font-size:20px;font-weight:700;color:#0F172A;padding-bottom:10px;">
              Te invitaron a unirte a una familia
            </td>
          </tr>

          <tr>
            <td style="font-size:15px;line-height:1.7;color:#334155;padding-bottom:16px;">
              <strong>${inviterName}</strong> te invitó a unirte a su familia en <strong>RINDAY</strong>.
              <br />
              Este correo fue enviado a: <strong>${inviteeEmail}</strong>
            </td>
          </tr>

          ${
            customMsg
              ? `<tr>
                   <td style="font-size:14px;line-height:1.7;color:#0F172A;background:#F1F5F9;border-radius:12px;padding:12px 14px;margin-bottom:14px;">
                     <strong>Mensaje:</strong><br/>${customMsg}
                   </td>
                 </tr>`
              : ""
          }

          <tr>
            <td align="center" style="padding:10px 0 24px 0;">
              <a href="${inviteUrl}"
                 style="display:inline-block;background:#0EA5E9;color:#FFFFFF;
                        padding:14px 22px;border-radius:12px;
                        text-decoration:none;font-weight:700;">
                Aceptar invitación
              </a>
            </td>
          </tr>

          <tr>
            <td style="font-size:13px;color:#64748B;line-height:1.6;">
              Si no esperabas este correo, puedes ignorarlo.
              <br /><br />
              —<br /><strong>RINDAY</strong><br />
              Tranquilidad financiera compartida
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function getBaseUrl() {
  const explicit = (process.env.PUBLIC_APP_URL_FOR_EMAIL ?? "").trim();
  if (explicit) return explicit;

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://rinday.app";
}

function getSmtpConfig() {
  const host = (process.env.SMTP_HOST ?? "").trim();
  const port = Number((process.env.SMTP_PORT ?? "587").trim());
  const user = (process.env.SMTP_USER ?? "").trim();
  const pass = (process.env.SMTP_PASS ?? "").trim();

  const secureEnv = (process.env.SMTP_SECURE ?? "").trim().toLowerCase();
  const secure =
    secureEnv === "true" ? true : secureEnv === "false" ? false : port === 465;

  const tlsRejectUnauthorized =
    (process.env.SMTP_TLS_REJECT_UNAUTHORIZED ?? "true")
      .trim()
      .toLowerCase() !== "false";

  return { host, port, user, pass, secure, tlsRejectUnauthorized };
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function isUuidLike(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v || "")
  );
}

function isEmailLike(v: string) {
  const s = String(v || "").trim();
  if (!s || s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isDuplicateRpc(err: any) {
  // Postgres unique violation = 23505
  const code = (err?.code ?? "").toString();
  const msg = (err?.message ?? "").toString().toLowerCase();
  return code === "23505" || msg.includes("duplicate") || msg.includes("unique");
}

// ===============================
// Route
// ===============================
export async function POST(req: Request) {
  try {
    // ✅ 1) Validar sesión usando access token
    const accessToken = getBearerToken(req);
    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "Auth session missing! (no bearer token)" },
        { status: 401 }
      );
    }

    // ✅ Admin client (service role) para DB + validar user con token
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );

    const { data: userRes, error: userErr } =
      await supabaseAdmin.auth.getUser(accessToken);

    if (userErr || !userRes?.user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const user = userRes.user;

    // ✅ 2) Body
    const body = await req.json().catch(() => ({}));
    const { familyId, email, role, inviterName, message } = body as {
      familyId: string;
      email: string;
      role?: "admin" | "member" | string;
      inviterName?: string;
      message?: string | null;
    };

    if (!familyId || !email) {
      return NextResponse.json(
        { ok: false, error: "Missing familyId or email" },
        { status: 400 }
      );
    }

    if (!isUuidLike(familyId)) {
      return NextResponse.json({ ok: false, error: "Invalid familyId (uuid)" }, { status: 400 });
    }

    const inviteEmail = String(email).toLowerCase().trim();
    if (!isEmailLike(inviteEmail)) {
      return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
    }

    // Tu CHECK constraint parece ser 'admin'/'member'
    const inviteRole = role === "admin" ? "admin" : "member";

    // ✅ 3) Validar OWNER (tú decidiste esta regla; tus policies dejan admin también)
    const { data: ownerCheck, error: ownerErr } = await supabaseAdmin
      .from("family_groups")
      .select("id,owner_user_id")
      .eq("id", familyId)
      .maybeSingle();

    if (ownerErr) {
      return NextResponse.json({ ok: false, error: ownerErr.message }, { status: 400 });
    }
    if (!ownerCheck) {
      return NextResponse.json({ ok: false, error: "Family not found" }, { status: 404 });
    }
    if ((ownerCheck as any).owner_user_id !== user.id) {
      return NextResponse.json(
        { ok: false, error: "Sólo el jefe de familia puede invitar miembros." },
        { status: 403 }
      );
    }

    // ✅ 4) Crear token + insertar invitación vía RPC
    const inviteToken =
      (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : undefined) ||
      `tok_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    let created = true;

    const { error: rpcError } = await supabaseAdmin.rpc("create_family_invite", {
      p_family_id: familyId,
      p_email: inviteEmail,
      p_role: inviteRole,
      p_token: inviteToken,
      p_message: message ?? null,
    });

    // Si el RPC marca duplicado: reusar token vigente pendiente (mejor UX)
    if (rpcError) {
      if (isDuplicateRpc(rpcError)) {
        created = false;

        const { data: existing, error: existingErr } = await supabaseAdmin
          .from("family_invites")
          .select("token, created_at, status, revoked_at, expires_at, token_used")
          .eq("family_id", familyId)
          .eq("email", inviteEmail)
          .eq("status", "pending")
          .is("revoked_at", null)
          .eq("token_used", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingErr) {
          // Si no podemos leer el existente, devolvemos el error original del RPC
          return NextResponse.json({ ok: false, error: rpcError.message }, { status: 400 });
        }

        const existingToken = (existing as any)?.token as string | null;

        const baseUrl = getBaseUrl();
        const finalToken = existingToken ?? inviteToken;
        const inviteUrl = `${baseUrl}/familia/aceptar?token=${encodeURIComponent(finalToken)}`;

        return NextResponse.json({
          ok: true,
          token: finalToken,
          inviteUrl,
          email_sent: false,
          email_error: "Invite already exists (pending). Reusing link.",
          created,
        });
      }

      return NextResponse.json({ ok: false, error: rpcError.message }, { status: 400 });
    }

    // ✅ 5) Link del correo
    const baseUrl = getBaseUrl();
    const inviteUrl = `${baseUrl}/familia/aceptar?token=${encodeURIComponent(inviteToken)}`;

    // ✅ 6) SMTP send (si falla, NO tronamos la invitación)
    const from = (process.env.SMTP_FROM || `RINDAY <${process.env.SMTP_USER || ""}>`).trim();

    const smtp = getSmtpConfig();
    const hasSmtp = !!smtp.host && !!smtp.port && !!smtp.user && !!smtp.pass && !!from;

    let email_sent = false;
    let email_error: string | null = null;

    const includeDebug = (process.env.DEBUG_EMAIL ?? "").toLowerCase() === "true";

    try {
      if (!hasSmtp) {
        throw new Error(
          "SMTP env missing. Required: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (or SMTP_USER fallback)"
        );
      }

      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: smtp.user, pass: smtp.pass },
        tls: { rejectUnauthorized: smtp.tlsRejectUnauthorized },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 20_000,
      });

      if (includeDebug) {
        await transporter.verify();
      }

      const niceInviter =
        inviterName?.trim() ||
        (user.user_metadata as any)?.full_name ||
        (user.email ?? "RINDAY");

      await transporter.sendMail({
        from,
        to: inviteEmail,
        subject: "Te invitaron a unirte a una familia en RINDAY",
        html: renderInviteEmailHTML({
          inviterName: niceInviter,
          inviteUrl,
          inviteeEmail: inviteEmail,
          message: message ?? null,
        }),
      });

      email_sent = true;
    } catch (err: any) {
      email_error = err?.message ?? "Failed to send email via SMTP";
      console.error("[invite][smtp] error:", err);
    }

    // ✅ Respuesta SIEMPRE ok true (porque la invitación ya existe en DB)
    return NextResponse.json({
      ok: true,
      token: inviteToken,
      inviteUrl,
      email_sent,
      email_error,
      created,
      ...(includeDebug
        ? {
            debug: {
              baseUrl,
              smtp: {
                host: smtp.host ? "ok" : "missing",
                port: smtp.port,
                user: smtp.user ? "ok" : "missing",
                pass: smtp.pass ? "ok" : "missing",
                from: from ? "ok" : "missing",
                secure: smtp.secure,
                tlsRejectUnauthorized: smtp.tlsRejectUnauthorized,
              },
            },
          }
        : {}),
    });
  } catch (e: any) {
    console.error("[invite] fatal:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}