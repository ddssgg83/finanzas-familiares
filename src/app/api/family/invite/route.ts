import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

// ✅ Importante: Resend funciona mejor en Node (no Edge)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(str: string) {
  return str.replace(/[&<>"']/g, (m) => {
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
}) {
  const inviterName = escapeHtml(opts.inviterName || "Un miembro de tu familia");
  const inviteeEmail = escapeHtml(opts.inviteeEmail);
  const inviteUrl = opts.inviteUrl;

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
            <td style="font-size:15px;line-height:1.7;color:#334155;padding-bottom:20px;">
              <strong>${inviterName}</strong> te invitó a unirte a su familia en <strong>RINDAY</strong>.
              <br />
              Este correo fue enviado a: <strong>${inviteeEmail}</strong>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:10px 0 24px 0;">
              <a href="${inviteUrl}"
                 style="display:inline-block;background:#5B5FFF;color:#FFFFFF;
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

function safeEmail(raw: unknown) {
  const e = String(raw ?? "").trim().toLowerCase();
  if (!e || !e.includes("@")) return null;
  return e;
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();

  try {
    // ✅ 0) Validar envs de Resend
    const RESEND_API_KEY = (process.env.RESEND_API_KEY ?? "").trim();
    if (!RESEND_API_KEY) {
      console.error("[invite] missing RESEND_API_KEY", { requestId });
      return NextResponse.json(
        {
          ok: true,
          emailSent: false,
          error: "RESEND_API_KEY no está configurada en Vercel (Production).",
        },
        { status: 200 }
      );
    }

    const resend = new Resend(RESEND_API_KEY);

    // ✅ 1) Token desde Authorization: Bearer <access_token>
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Auth session missing! (no bearer token)" },
        { status: 401 }
      );
    }

    // ✅ 2) Cliente “como usuario” usando el access_token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    // ✅ 3) Validar usuario
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json(
        { ok: false, error: userErr?.message ?? "Not authenticated" },
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

    if (!familyId) {
      return NextResponse.json(
        { ok: false, error: "Missing familyId" },
        { status: 400 }
      );
    }

    const inviteEmail = safeEmail(email);
    if (!inviteEmail) {
      return NextResponse.json(
        { ok: false, error: "Ingresa un correo válido." },
        { status: 400 }
      );
    }

    const inviteToken = crypto.randomUUID();

    // ✅ 4) RPC como usuario (para que auth.uid() aplique y valide admin)
    const { error: rpcError } = await supabase.rpc("create_family_invite", {
      p_family_id: familyId,
      p_email: inviteEmail,
      p_role: role ?? "member",
      p_token: inviteToken,
      p_message: message ?? null,
    });

    if (rpcError) {
      return NextResponse.json(
        { ok: false, error: rpcError.message },
        { status: 400 }
      );
    }

    // ✅ 5) Link final del correo
    const baseUrl =
      process.env.PUBLIC_APP_URL_FOR_EMAIL?.trim() ||
      (process.env.VERCEL ? "https://rinday.app" : "http://localhost:3000");

    const inviteUrl = `${baseUrl}/familia/aceptar?token=${encodeURIComponent(
      inviteToken
    )}`;

    // ✅ 6) Enviar email (SIN romper el flujo si falla)
    const from = process.env.RESEND_FROM?.trim() || "RINDAY <no-reply@rinday.app>";
    const subject = "Te invitaron a unirte a una familia en RINDAY";

    const html = renderInviteEmailHTML({
      inviterName: inviterName || (userData.user.email ?? "RINDAY"),
      inviteUrl,
      inviteeEmail: inviteEmail,
    });

    const { data, error: emailError } = await resend.emails.send({
      from,
      to: inviteEmail,
      subject,
      html,
    });

    if (emailError) {
      // 🔥 Log completo (esto es lo que necesitamos ver en Vercel logs)
      console.error("[invite] resend error", {
        requestId,
        message: emailError.message,
        name: (emailError as any).name,
        statusCode: (emailError as any).statusCode,
        cause: (emailError as any).cause,
        // a veces viene "type" o "code"
        type: (emailError as any).type,
        code: (emailError as any).code,
        from,
        to: inviteEmail,
      });

      // ✅ No fallar: devolvemos link para "Copiar link"
      return NextResponse.json(
        {
          ok: true,
          emailSent: false,
          token: inviteToken,
          inviteUrl,
          error: emailError.message,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        emailSent: true,
        token: inviteToken,
        inviteUrl,
        resendId: data?.id ?? null,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("[invite] unexpected error", { requestId, error: e?.message, e });
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
