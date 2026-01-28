import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  const inviteUrl = opts.inviteUrl;
  const inviteeEmail = escapeHtml(opts.inviteeEmail);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
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
              Si no esperabas este correo, puedes ignorarlo. La invitación expirará automáticamente.
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

export async function POST(req: Request) {
  try {
    // Validar envs mínimos
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "Missing RESEND_API_KEY" }, { status: 500 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }

    const body = await req.json();

    const {
      familyId,
      email,
      role,
      inviterName,
      message,
    } = body as {
      familyId: string;
      email: string;
      role?: string; // default: member
      inviterName?: string;
      message?: string | null;
    };

    if (!familyId || !email) {
      return NextResponse.json({ error: "Missing familyId or email" }, { status: 400 });
    }

    const inviteEmail = String(email).toLowerCase().trim();
    const token = crypto.randomUUID();

    // 1) Guardar invite con tu RPC existente
    // Confirmado por tu screenshot: create_family_invite(p_family_id uuid, p_email text, p_role text, p_token uuid, p_message ...)
    const { error: rpcError } = await supabaseAdmin.rpc("create_family_invite", {
      p_family_id: familyId,
      p_email: inviteEmail,
      p_role: role ?? "member",
      p_token: token,
      p_message: message ?? null,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    // 2) Construir link (local/prod)
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      "https://rinday.app";

    const inviteUrl = `${baseUrl}/familia/invitacion?token=${encodeURIComponent(token)}`;

    // 3) Enviar email con Resend
    const from = process.env.RESEND_FROM || "RINDAY <no-reply@rinday.app>";
    const subject = "Te invitaron a unirte a una familia en RINDAY";

    const { error: emailError } = await resend.emails.send({
      from,
      to: inviteEmail,
      subject,
      html: renderInviteEmailHTML({
        inviterName: inviterName || "Un miembro de tu familia",
        inviteUrl,
        inviteeEmail: inviteEmail,
      }),
    });

    if (emailError) {
      return NextResponse.json({ error: emailError.message }, { status: 502 });
    }

    return NextResponse.json({ ok: true, token });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
