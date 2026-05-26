import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import {
  buildCoachSystemPrompt,
  buildCoachUserPrompt,
  parseCoachJson,
  sanitizeCoachContext,
} from "@/lib/premium/coachPrompt";
import {
  PREMIUM_COACH_ACTIONS,
  type PremiumCoachAction,
  type PremiumCoachRequest,
} from "@/lib/premium/coachTypes";
import { isLocale, type Locale } from "@/lib/i18n/config";

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

function errorMessage(locale: Locale, key: "auth" | "action" | "context" | "missingKey" | "generic") {
  const en = locale === "en-US";
  const messages = {
    auth: en ? "Sign in to use the copilot." : "Necesitas iniciar sesión para usar el copiloto.",
    action: en ? "Invalid copilot action." : "Acción de copiloto no válida.",
    context: en
      ? "Financial context is missing for this read."
      : "Falta contexto financiero para generar la lectura.",
    missingKey: en
      ? "The copilot is not configured yet."
      : "El copiloto no está configurado todavía.",
    generic: en
      ? "I could not generate the explanation right now. Your local signals are still available."
      : "No pude generar la explicación ahora. Tus señales locales siguen disponibles.",
  };
  return messages[key];
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  let actionForLog = "unknown";
  let localeForLog: Locale = "es-MX";

  try {
    const body = (await req.json().catch(() => ({}))) as Partial<PremiumCoachRequest>;
    const locale: Locale = isLocale(body.locale) ? body.locale : "es-MX";
    localeForLog = locale;

    const { user, error: authError } = await getAuthenticatedUser(req);
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: errorMessage(locale, "auth") },
        { status: 401 }
      );
    }

    if (!isCoachAction(body.action)) {
      return NextResponse.json(
        { ok: false, error: errorMessage(locale, "action") },
        { status: 400 }
      );
    }
    actionForLog = body.action;

    if (!body.context || typeof body.context !== "object") {
      return NextResponse.json(
        { ok: false, error: errorMessage(locale, "context") },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("[premium-coach] missing OPENAI_API_KEY");
      return NextResponse.json(
        { ok: false, error: errorMessage(locale, "missingKey") },
        { status: 500 }
      );
    }

    const context = sanitizeCoachContext(body.context);
    const systemPrompt = buildCoachSystemPrompt(locale);
    const userPrompt = buildCoachUserPrompt(body.action, context, locale);
    const approxTokens = approximateTokens(systemPrompt + userPrompt);
    const client = new OpenAI({ apiKey });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 420,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const response = parseCoachJson(content, locale);

    console.info("[premium-coach]", {
      action: actionForLog,
      locale: localeForLog,
      durationMs: Date.now() - startedAt,
      approxPromptTokens: approxTokens,
    });

    return NextResponse.json(response);
  } catch (err) {
    console.error("[premium-coach] error", {
      action: actionForLog,
      locale: localeForLog,
      durationMs: Date.now() - startedAt,
      message: err instanceof Error ? err.message : "unknown",
    });

    return NextResponse.json(
      {
        ok: false,
        error: errorMessage(localeForLog, "generic"),
      },
      { status: 500 }
    );
  }
}
