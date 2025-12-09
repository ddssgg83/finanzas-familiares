import { ai } from "./ai";

export async function askAI(prompt: string) {
  try {
    const completion = await ai.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    return completion.output_text;
  } catch (error: any) {
    console.error("Error preguntando a la IA:", error);
    return "Lo siento, no pude generar una respuesta.";
  }
}
