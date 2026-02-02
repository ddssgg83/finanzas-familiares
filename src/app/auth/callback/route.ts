import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function safeInternalNext(raw: string | null) {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  if (v.startsWith("/")) return v;
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  // Supabase manda ?code=... (PKCE)
  const code = url.searchParams.get("code");
  const nextParam = safeInternalNext(url.searchParams.get("next"));

  if (code) {
    // Esto “convierte” el code en sesión en el navegador (setea cookies/local storage según config)
    await supabase.auth.exchangeCodeForSession(code);
  }

  // a dónde regresar
  const redirectTo = nextParam || "/gastos";
  return NextResponse.redirect(new URL(redirectTo, url.origin));
}
