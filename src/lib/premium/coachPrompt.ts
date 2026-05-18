import type {
  PremiumCoachAction,
  PremiumCoachContext,
  PremiumCoachSuccessResponse,
} from "@/lib/premium/coachTypes";

const MAX_TEXT = 180;

export const PREMIUM_COACH_SYSTEM_PROMPT = `
Eres el Copiloto financiero familiar de RINDAY.

Tu trabajo es explicar señales financieras YA calculadas por la app y convertirlas en acciones simples.
No inventes datos. Usa solo el contexto recibido.
No pidas información adicional.
No des asesoría legal, fiscal, crediticia formal ni recomendaciones de inversión específica.
No menciones que eres un modelo de IA.
Habla en español claro, cálido y directo.
Mantén tono profesional, familiar y tranquilizador.
Responde en JSON válido con:
{
  "title": string,
  "bullets": string[],
  "priorityAction": string
}

Reglas:
- Máximo 4 bullets.
- Cada bullet máximo 22 palabras.
- priorityAction máximo 24 palabras.
- Si los datos son insuficientes, dilo claramente y recomienda qué capturar.
- No uses markdown.
`.trim();

export const ACTION_PROMPTS: Record<PremiumCoachAction, string> = {
  explain_month: "Explica este mes financiero en lenguaje simple para una familia. Prioriza claridad y calma.",
  three_actions: "Propón 3 acciones concretas para esta semana basadas en las señales recibidas.",
  risk_summary: "Resume los riesgos principales y di cuál vigilar primero. Evita alarmismo.",
  family_message: "Redacta un mensaje breve y amable para compartir con la familia sobre este estado financiero.",
};

function cleanText(value: unknown, max = MAX_TEXT) {
  const clean = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max).trim();
}

function cleanNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function sanitizeCoachContext(context: PremiumCoachContext): PremiumCoachContext {
  return {
    health: {
      score: Math.max(0, Math.min(100, Math.round(cleanNumber(context?.health?.score)))),
      label: cleanText(context?.health?.label, 60),
      factors: (context?.health?.factors ?? []).slice(0, 3).map((factor) => cleanText(factor, 120)),
    },
    projection: {
      projectedExpenses: cleanNumber(context?.projection?.projectedExpenses),
      projectedBalance: cleanNumber(context?.projection?.projectedBalance),
      dailyExpenseAverage: cleanNumber(context?.projection?.dailyExpenseAverage),
      confidence: context?.projection?.confidence === "medium" ? "medium" : "low",
      label: cleanText(context?.projection?.label, 80),
    },
    signals: (context?.signals ?? []).slice(0, 4).map((signal) => ({
      title: cleanText(signal.title, 80),
      body: cleanText(signal.body, 160),
      severity:
        signal.severity === "critical" ||
        signal.severity === "warning" ||
        signal.severity === "good" ||
        signal.severity === "info"
          ? signal.severity
          : "info",
      metric: signal.metric ? cleanText(signal.metric, 40) : undefined,
    })),
    risks: (context?.risks ?? []).slice(0, 3).map((risk) => ({
      title: cleanText(risk.title, 80),
      body: cleanText(risk.body, 160),
      severity:
        risk.severity === "critical" || risk.severity === "warning" || risk.severity === "info"
          ? risk.severity
          : "info",
    })),
    nextAction: {
      title: cleanText(context?.nextAction?.title, 90),
      body: cleanText(context?.nextAction?.body, 160),
    },
    familySummary: {
      title: cleanText(context?.familySummary?.title, 90),
      body: cleanText(context?.familySummary?.body, 160),
    },
  };
}

export function buildCoachUserPrompt(action: PremiumCoachAction, context: PremiumCoachContext) {
  return JSON.stringify(
    {
      task: ACTION_PROMPTS[action],
      context: sanitizeCoachContext(context),
    },
    null,
    2
  );
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, 140)).filter(Boolean).slice(0, 4);
}

export function normalizeCoachResponse(raw: unknown): PremiumCoachSuccessResponse {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const bullets = asStringArray(data.bullets);

  return {
    ok: true,
    title: cleanText(data.title, 90) || "Lectura financiera",
    bullets: bullets.length
      ? bullets
      : ["No pude generar una lectura completa, pero tus señales locales siguen disponibles."],
    priorityAction:
      cleanText(data.priorityAction, 140) ||
      "Revisa las señales locales y elige una acción pequeña para esta semana.",
  };
}

export function parseCoachJson(content: string): PremiumCoachSuccessResponse {
  try {
    return normalizeCoachResponse(JSON.parse(content));
  } catch {
    const fallbackBullets = content
      .split(/\n+/)
      .map((line) => line.replace(/^[-*•\d.\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 4);

    return {
      ok: true,
      title: "Lectura financiera",
      bullets: fallbackBullets.length
        ? fallbackBullets.map((line) => cleanText(line, 140))
        : ["No pude generar una lectura completa, pero tus señales locales siguen disponibles."],
      priorityAction: "Elige una señal local y conviértela en una acción concreta esta semana.",
    };
  }
}
