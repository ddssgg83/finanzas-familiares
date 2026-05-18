import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import {
  buildCoachUserPrompt,
  parseCoachJson,
  PREMIUM_COACH_SYSTEM_PROMPT,
  sanitizeCoachContext,
} from "@/lib/premium/coachPrompt";
import {
  PREMIUM_COACH_ACTIONS,
  type PremiumCoachAction,
  type PremiumCoachRequest,
} from "@/lib/premium/coachTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

async function getAuthenticatedUser(req: Request) {
  const accessToken = getBearerToken(req);
  if (!accessToken) return { user: null, error: "AUTH_REQUIRED" as const };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    }
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { user: null, error: "AUTH_REQUIRED" as const };

  return { user: data.user, error: null };
}

function isCoachAction(value: unknown): value is PremiumCoachAction {
  return PREMIUM_COACH_ACTIONS.includes(value as PremiumCoachAction);
}

function approximateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  let actionForLog = "unknown";

  try {
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Necesitas iniciar sesión para usar el copiloto." },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Partial<PremiumCoachRequest>;
    if (!isCoachAction(body.action)) {
      return NextResponse.json(
        { ok: false, error: "Acción de copiloto no válida." },
        { status: 400 }
      );
    }
    actionForLog = body.action;

    if (!body.context || typeof body.context !== "object") {
      return NextResponse.json(
        { ok: false, error: "Falta contexto financiero para generar la lectura." },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("[premium-coach] missing OPENAI_API_KEY");
      return NextResponse.json(
        { ok: false, error: "El copiloto no está configurado todavía." },
        { status: 500 }
      );
    }

    const context = sanitizeCoachContext(body.context);
    const userPrompt = buildCoachUserPrompt(body.action, context);
    const approxTokens = approximateTokens(PREMIUM_COACH_SYSTEM_PROMPT + userPrompt);
    const client = new OpenAI({ apiKey });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 420,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PREMIUM_COACH_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const response = parseCoachJson(content);

    console.info("[premium-coach]", {
      action: actionForLog,
      durationMs: Date.now() - startedAt,
      approxPromptTokens: approxTokens,
    });

    return NextResponse.json(response);
  } catch (err) {
    console.error("[premium-coach] error", {
      action: actionForLog,
      durationMs: Date.now() - startedAt,
      message: err instanceof Error ? err.message : "unknown",
    });

    return NextResponse.json(
      {
        ok: false,
        error: "No pude generar la explicación ahora. Tus señales locales siguen disponibles.",
      },
      { status: 500 }
    );
  }
}
