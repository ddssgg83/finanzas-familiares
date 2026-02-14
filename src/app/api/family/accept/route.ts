// =======================================
// FILE: src/app/api/family/accept/route.ts
// =======================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

type InviteRow = {
  id: string;
  family_id: string;
  email: string;
  role: "admin" | "member";
  status: "pending" | "accepted" | "revoked" | "expired";
  token: string | null;
  created_at: string | null;

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

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();
    const mode = (String(body?.mode ?? "accept") as "preview" | "accept") || "accept";

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
    }

    // 1) Buscar invitación por token (server-side, sin depender de RLS)
    const { data: inv, error: invErr } = await supabaseAdmin
      .from("family_invites")
      .select(
        "id,family_id,email,role,status,token,created_at,expires_at,accepted_at,token_used,message"
      )
      .eq("token", token)
      .maybeSingle();

    if (invErr) {
      return NextResponse.json({ ok: false, error: invErr.message }, { status: 400 });
    }

    if (!inv) {
      return NextResponse.json(
        { ok: false, error: "Invitación no encontrada o token inválido." },
        { status: 404 }
      );
    }

    const invite = inv as InviteRow;

    // 2) Modo preview: no requiere sesión (para mostrar correo/estado)
    if (mode === "preview") {
      return NextResponse.json({
        ok: true,
        invite: {
          id: invite.id,
          family_id: invite.family_id,
          email: invite.email,
          role: invite.role,
          status: invite.status,
          created_at: invite.created_at,
          expires_at: invite.expires_at,
          accepted_at: invite.accepted_at,
          token_used: invite.token_used,
          message: invite.message,
        },
      });
    }

    // 3) Modo accept: requiere sesión (Authorization: Bearer <access_token>)
    const accessToken = getBearerToken(req);
    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "Necesitas iniciar sesión para aceptar la invitación.", code: "NEEDS_LOGIN" },
        { status: 401 }
      );
    }

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (userErr || !userRes?.user) {
      return NextResponse.json(
        { ok: false, error: "Sesión inválida o expirada. Vuelve a iniciar sesión.", code: "NEEDS_LOGIN" },
        { status: 401 }
      );
    }

    const user = userRes.user;
    const myEmail = String(user.email ?? "").toLowerCase().trim();
    const invEmail = String(invite.email ?? "").toLowerCase().trim();

    if (!myEmail || myEmail !== invEmail) {
      return NextResponse.json(
        {
          ok: false,
          error: "Esta invitación no corresponde a tu correo.",
          code: "EMAIL_MISMATCH",
          inviteEmail: invite.email,
          userEmail: user.email ?? null,
        },
        { status: 403 }
      );
    }

    // 4) Manejo expiración (si sigue pending)
    if (invite.status === "pending" && isExpired(invite.expires_at)) {
      await supabaseAdmin.from("family_invites").update({ status: "expired" }).eq("id", invite.id);
      return NextResponse.json(
        { ok: false, error: "Esta invitación ya expiró. Pide que te envíen una nueva.", code: "EXPIRED" },
        { status: 400 }
      );
    }

    // 5) Estados bloqueados (revoked/expired)
    if (invite.status === "revoked") {
      return NextResponse.json(
        { ok: false, error: "Esta invitación fue revocada.", code: "REVOKED" },
        { status: 400 }
      );
    }
    if (invite.status === "expired") {
      return NextResponse.json(
        { ok: false, error: "Esta invitación ya expiró. Pide una nueva.", code: "EXPIRED" },
        { status: 400 }
      );
    }

    // 6) Idempotencia: si ya fue aceptada o token_used, asegurar membership activo
    const alreadyUsed = invite.token_used === true || invite.status === "accepted";
    if (alreadyUsed) {
      const { data: existing, error: existErr } = await supabaseAdmin
        .from("family_members")
        .select("id,status,role")
        .eq("family_id", invite.family_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existErr) {
        return NextResponse.json({ ok: false, error: existErr.message }, { status: 400 });
      }

      if (!existing) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "La invitación ya fue usada. Si no apareces como miembro, pide que te inviten de nuevo.",
            code: "ALREADY_USED_NO_MEMBER",
          },
          { status: 409 }
        );
      }

      await supabaseAdmin
        .from("family_members")
        .update({ status: "active" })
        .eq("id", (existing as any).id);

      return NextResponse.json({ ok: true, status: "already_accepted" });
    }

    // 7) Debe estar pending para aceptar
    if (invite.status !== "pending") {
      return NextResponse.json(
        { ok: false, error: `Invitación no pendiente (estado: ${invite.status}).`, code: "NOT_PENDING" },
        { status: 400 }
      );
    }

    // 8) Upsert/activar miembro (admin server-side)
    const { data: existing, error: existErr } = await supabaseAdmin
      .from("family_members")
      .select("id,status,role")
      .eq("family_id", invite.family_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existErr) {
      return NextResponse.json({ ok: false, error: existErr.message }, { status: 400 });
    }

    if (!existing) {
      const { error: insErr } = await supabaseAdmin.from("family_members").insert([
        {
          family_id: invite.family_id,
          user_id: user.id,
          full_name: user.email ?? "Miembro",
          invited_email: user.email ?? null,
          role: invite.role,
          status: "active",
        },
      ]);
      if (insErr) {
        return NextResponse.json({ ok: false, error: insErr.message }, { status: 400 });
      }
    } else {
      const { error: updMemErr } = await supabaseAdmin
        .from("family_members")
        .update({ status: "active", role: invite.role })
        .eq("id", (existing as any).id);

      if (updMemErr) {
        return NextResponse.json({ ok: false, error: updMemErr.message }, { status: 400 });
      }
    }

    // 9) Marcar invitación accepted + token_used
    const nowISO = new Date().toISOString();
    const { error: updInvErr } = await supabaseAdmin
      .from("family_invites")
      .update({ status: "accepted", accepted_at: nowISO, token_used: true })
      .eq("id", invite.id);

    if (updInvErr) {
      return NextResponse.json({ ok: false, error: updInvErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, status: "accepted" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}