import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { question, userEmail } = await req.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Falta la pregunta." },
        { status: 400 }
      );
    }

    const systemPrompt = `
Eres un coach financiero familiar.
Da respuestas en 3–5 bullets, claras, prácticas y cortas.
No des consejos fiscales o legales.
Habla en español neutro.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Usuario: ${userEmail ?? "sin correo"}\n\nPregunta: ${question}`,
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
