import { NextResponse } from "next/server";
import OpenAI from "openai";

// Usa SOLO la clave privada (NO NEXT_PUBLIC)
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    console.error("[aprende-ai] OPENAI_API_KEY no está definida");
    return NextResponse.json(
      { answer: "No hay API key configurada." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const {
      mode = "qa",
      question,
      summary,
      monthLabel,
    } = body;

    let systemContent = "";
    let userContent = "";

    switch (mode) {
      case "explain":
        systemContent =
          "Eres un maestro de primaria que explica finanzas en español muy simple, como para un niño de 10 años.";
        userContent = question ?? "";
        break;

      case "plan":
        systemContent =
          "Eres un asesor financiero personal. Responde SOLO con un plan de acción práctico y numerado.";
        userContent = question ?? "";
        break;

      case "analyze-expenses":
        systemContent =
          "Eres un asesor personal. Da (1) observaciones clave, (2) 3 acciones para ahorrar, (3) frase corta de ánimo.";
        userContent = `Resumen del mes ${monthLabel ?? ""}:\n${summary ?? ""}`;
        break;

      case "qa":
      default:
        systemContent =
          "Eres un asesor financiero personal. Responde en español, de forma clara y práctica.";
        userContent = question ?? "";
        break;
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userContent },
      ],
      temperature: 0.4,
      max_tokens: 600,
    });

    return NextResponse.json({
      answer: completion.choices[0].message.content ?? "",
    });
  } catch (err: any) {
    console.error("[aprende-ai] Error:", err?.message ?? err);
    return NextResponse.json(
      { answer: "Error al conectarse con la IA." },
      { status: 500 }
    );
  }
}
