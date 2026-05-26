import type {
  PremiumCoachAction,
  PremiumCoachContext,
  PremiumCoachSuccessResponse,
} from "@/lib/premium/coachTypes";
import type { Locale } from "@/lib/i18n/config";

const MAX_TEXT = 180;

export function buildCoachSystemPrompt(locale: Locale = "es-MX") {
  const english = locale === "en-US";

  return `
You are RINDAY's family financial copilot.

Your job is to explain financial signals ALREADY calculated by the app and turn them into simple actions.
Do not invent data. Use only the received context.
Do not ask for additional information.
Do not provide formal legal, tax, credit, or specific investment advice.
Do not mention that you are an AI model.
Use a calm, premium, human, direct tone for families.
Respond ${english ? "in natural, premium English" : "en español natural, premium y claro"}.
Respond as valid JSON with:
{
  "title": string,
  "bullets": string[],
  "priorityAction": string
}

Rules:
- Maximum 4 bullets.
- Each bullet maximum 22 words.
- priorityAction maximum 24 words.
- If data is insufficient, say it clearly and recommend what to capture.
- No markdown.
`.trim();
}

export const PREMIUM_COACH_SYSTEM_PROMPT = buildCoachSystemPrompt("es-MX");

function actionPrompts(locale: Locale = "es-MX"): Record<PremiumCoachAction, string> {
  if (locale === "en-US") {
    return {
      explain_month: "Explain this financial month in simple language for a family. Prioritize clarity and calm.",
      three_actions: "Suggest 3 concrete actions for this week based on the received signals.",
      risk_summary: "Summarize the main risks and say which one to watch first. Avoid alarmism.",
      family_message: "Write a brief, kind message to share with the family about this financial status.",
    };
  }

  return {
    explain_month: "Explica este mes financiero en lenguaje simple para una familia. Prioriza claridad y calma.",
    three_actions: "Propón 3 acciones concretas para esta semana basadas en las señales recibidas.",
    risk_summary: "Resume los riesgos principales y di cuál vigilar primero. Evita alarmismo.",
    family_message: "Redacta un mensaje breve y amable para compartir con la familia sobre este estado financiero.",
  };
}

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

export function buildCoachUserPrompt(action: PremiumCoachAction, context: PremiumCoachContext, locale: Locale = "es-MX") {
  return JSON.stringify(
    {
      locale,
      language: locale === "en-US" ? "English" : "Spanish",
      task: actionPrompts(locale)[action],
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

export function normalizeCoachResponse(raw: unknown, locale: Locale = "es-MX"): PremiumCoachSuccessResponse {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const bullets = asStringArray(data.bullets);
  const fallbackTitle = locale === "en-US" ? "Financial read" : "Lectura financiera";
  const fallbackBullet =
    locale === "en-US"
      ? "I could not generate a complete read, but your local signals are still available."
      : "No pude generar una lectura completa, pero tus señales locales siguen disponibles.";
  const fallbackAction =
    locale === "en-US"
      ? "Review your local signals and choose one small action for this week."
      : "Revisa las señales locales y elige una acción pequeña para esta semana.";

  return {
    ok: true,
    title: cleanText(data.title, 90) || fallbackTitle,
    bullets: bullets.length
      ? bullets
      : [fallbackBullet],
    priorityAction:
      cleanText(data.priorityAction, 140) ||
      fallbackAction,
  };
}

export function parseCoachJson(content: string, locale: Locale = "es-MX"): PremiumCoachSuccessResponse {
  try {
    return normalizeCoachResponse(JSON.parse(content), locale);
  } catch {
    const fallbackBullets = content
      .split(/\n+/)
      .map((line) => line.replace(/^[-*•\d.\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 4);

    const fallbackTitle = locale === "en-US" ? "Financial read" : "Lectura financiera";
    const fallbackBullet =
      locale === "en-US"
        ? "I could not generate a complete read, but your local signals are still available."
        : "No pude generar una lectura completa, pero tus señales locales siguen disponibles.";
    const fallbackAction =
      locale === "en-US"
        ? "Choose one local signal and turn it into a concrete action this week."
        : "Elige una señal local y conviértela en una acción concreta esta semana.";

    return {
      ok: true,
      title: fallbackTitle,
      bullets: fallbackBullets.length
        ? fallbackBullets.map((line) => cleanText(line, 140))
        : [fallbackBullet],
      priorityAction: fallbackAction,
    };
  }
}
