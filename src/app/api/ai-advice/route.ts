// src/app/api/ai-advice/route.ts
import { NextRequest, NextResponse } from "next/server";
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

export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (authError || !user) {
      return NextResponse.json(
        { error: "Necesitas iniciar sesión para usar la IA." },
        { status: 401 }
      );
    }

    const { question, userEmail } = await req.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Falta la pregunta." },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("[ai-advice] Falta OPENAI_API_KEY en el servidor");
      return NextResponse.json(
        { error: "Error de configuración de IA en el servidor." },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey });

    const systemPrompt = `
Eres un coach financiero familiar. 
Responde de forma clara, corta y accionable (máximo 3-5 bullets).
No des consejos legales ni fiscales específicos, sólo recomendaciones generales.
El usuario está usando una app para controlar gastos, activos, deudas y presupuesto familiar.
Habla en español neutro, tono cercano pero profesional.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Usuario autenticado: ${user.email ?? user.id}
Usuario reportado: ${userEmail ?? "sin correo"}

Pregunta: ${question}`,
        },
      ],
      temperature: 0.4,
      max_tokens: 450,
    });

    const answer =
      completion.choices[0]?.message?.content ??
      "No pude generar una respuesta en este momento.";

    return NextResponse.json({ answer });
  } catch (err) {
    console.error("Error en /api/ai-advice:", err);
    return NextResponse.json(
      { error: "Ocurrió un error al procesar tu pregunta." },
      { status: 500 }
    );
  }
}
