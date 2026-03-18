import "server-only";
import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  console.warn("⚠️ Falta OPENAI_API_KEY en el entorno del servidor");
}

export const ai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
