import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);

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

    // ✅ 4) RPC como usuario (para que auth.uid() aplique y valide admin)
    const { error: rpcError } = await supabase.rpc("create_family_invite", {
      p_family_id: familyId,
      p_email: inviteEmail,
      p_role: role ?? "member",
      p_token: inviteToken,
      p_message: message ?? null,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    // ✅ 5) Enviar email

// 1) URL base para links del correo
// - En Vercel: fuerza dominio real
// - En local: usa localhost (a menos que definas PUBLIC_APP_URL_FOR_EMAIL)
const baseUrl =
  (process.env.PUBLIC_APP_URL_FOR_EMAIL?.trim() ||
    (process.env.VERCEL ? "https://rinday.app" : "http://localhost:3000"));

// 2) Link final del correo
const inviteUrl = `${baseUrl}/familia/aceptar?token=${encodeURIComponent(inviteToken)}`;

const from = process.env.RESEND_FROM || "RINDAY <no-reply@rinday.app>";
const subject = "Te invitaron a unirte a una familia en RINDAY";

const { error: emailError } = await resend.emails.send({
  from,
  to: inviteEmail,
  subject,
  html: renderInviteEmailHTML({
    inviterName: inviterName || (userData.user.email ?? "RINDAY"),
    inviteUrl,
    inviteeEmail: inviteEmail,
  }),
});

if (emailError) {
  return NextResponse.json({ error: emailError.message }, { status: 502 });
}

return NextResponse.json({ ok: true, token: inviteToken });

  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
