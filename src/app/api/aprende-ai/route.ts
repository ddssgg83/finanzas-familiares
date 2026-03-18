// src/app/api/aprende-ai/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

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

export async function POST(req: Request) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (authError || !user) {
      return NextResponse.json(
        { answer: "Necesitas iniciar sesión para usar la IA." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      mode = "qa", // "qa" | "explain" | "plan" | "analyze-expenses"
      question,
      summary,
      monthLabel,
    } = body;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("[aprende-ai] Falta OPENAI_API_KEY en el servidor");
      return NextResponse.json(
        { answer: "Error de configuración de IA en el servidor." },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey });

    let systemContent = "";
    let userContent = "";

    switch (mode) {
      case "explain":
        systemContent =
          "Eres un maestro de primaria que explica finanzas en español muy simple, como para un niño de 10 años. Usa ejemplos de la vida diaria en familia.";
        userContent = question ?? "";
        break;

      case "plan":
        systemContent =
          "Eres un asesor financiero personal. Responde SOLO con un plan de acción claro, en pasos numerados y bullets, aplicado a la situación del usuario. Nada de teoría, solo cosas prácticas.";
        userContent = question ?? "";
        break;

      case "analyze-expenses":
        systemContent =
          "Eres un asesor financiero personal. Te doy un resumen de ingresos y gastos de un mes. Devuelve: (1) 3–5 observaciones clave, (2) 3 acciones concretas para reducir gastos, (3) una frase final de ánimo corta.";
        userContent = `Resumen de mis movimientos del mes ${
          monthLabel ?? ""
        }:\n${summary ?? ""}`;
        break;

      case "qa":
      default:
        systemContent =
          "Eres un asesor financiero personal que habla en español, directo y práctico. Te enfocas en ayudar a familias con presupuesto, deudas, ahorro y tarjetas.";
        userContent = question ?? "";
        break;
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemContent },
        {
          role: "user",
          content: `Usuario autenticado: ${user.email ?? user.id}\n\n${userContent}`,
        },
      ],
    });

    const answer = completion.choices[0].message.content ?? "";

    return NextResponse.json({ answer });
  } catch (err) {
    console.error("Error en /api/aprende-ai:", err);
    return NextResponse.json(
      { answer: "Error al conectarse con la IA." },
      { status: 500 }
    );
  }
}
