// src/app/api/family/invite/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const runtime = "nodejs"; // ✅ necesario para nodemailer en Vercel

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
  // ✅ Link siempre al dominio real
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

  // Si no defines SMTP_SECURE, usamos regla típica:
  // 465 => secure true (SSL)
  // 587/25 => secure false (STARTTLS)
  const secureEnv = (process.env.SMTP_SECURE ?? "").trim().toLowerCase();
  const secure =
    secureEnv === "true" ? true : secureEnv === "false" ? false : port === 465;

  // A2 a veces requiere TLS y no le gusta “rejectUnauthorized” false.
  // Lo dejamos true por defecto (seguro).
  const tlsRejectUnauthorized =
    (process.env.SMTP_TLS_REJECT_UNAUTHORIZED ?? "true")
      .trim()
      .toLowerCase() !== "false";

  return { host, port, user, pass, secure, tlsRejectUnauthorized };
}

export async function POST(req: Request) {
  try {
    // ✅ 1) Token desde Authorization: Bearer <access_token>
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!token) {
      return NextResponse.json(
        { error: "Auth session missing! (no bearer token)" },
        { status: 401 }
      );
    }

    // ✅ 2) Cliente Supabase “como usuario”
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );

    // ✅ 3) Validar usuario
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json(
        { error: userErr?.message ?? "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { familyId, email, role, inviterName, message } = body as {
      familyId: string;
      email: string;
      role?: string;
      inviterName?: string;
      message?: string | null;
    };

    if (!familyId || !email) {
      return NextResponse.json(
        { error: "Missing familyId or email" },
        { status: 400 }
      );
    }

    const inviteEmail = String(email).toLowerCase().trim();
    const inviteToken = crypto.randomUUID();

    // ✅ 4) Crear invitación (DB)
    const { error: rpcError } = await supabase.rpc("create_family_invite", {
      p_family_id: familyId,
      p_email: inviteEmail,
      p_role: role ?? "member",
      p_token: inviteToken,
      p_message: message ?? null,
    });

    if (rpcError) {
      // Ej: duplicate key unique_pending
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    // ✅ 5) Link del correo
    const baseUrl = getBaseUrl();
    const inviteUrl = `${baseUrl}/familia/aceptar?token=${encodeURIComponent(
      inviteToken
    )}`;

    // ✅ 6) SMTP send
    // A) Forzar from en formato correcto
    const from = (
      process.env.SMTP_FROM || `RINDAY <${process.env.SMTP_USER || ""}>`
    )
      .trim()
      .toString();

    const smtp = getSmtpConfig();
    const hasSmtp =
      !!smtp.host && !!smtp.port && !!smtp.user && !!smtp.pass && !!from;

    let email_sent = false;
    let email_error: string | null = null;

    // B) Debug opcional controlado por ENV
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

        // ✅ timeouts para Vercel
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 20_000,
      });

      // ✅ (opcional) verificar conexión SMTP SOLO si DEBUG_EMAIL=true
      if (includeDebug) {
        await transporter.verify();
      }

      await transporter.sendMail({
        from,
        to: inviteEmail,
        subject: "Te invitaron a unirte a una familia en RINDAY",
        html: renderInviteEmailHTML({
          inviterName: inviterName || (userData.user.email ?? "RINDAY"),
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

    // ✅ Respuesta SIEMPRE ok true (porque la invitación ya existe)
    return NextResponse.json({
      ok: true,
      token: inviteToken,
      inviteUrl,
      email_sent,
      email_error,

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
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
