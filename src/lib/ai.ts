import OpenAI from "openai";

if (!process.env.NEXT_PUBLIC_OPENAI_API_KEY) {
  console.warn("⚠️ Falta NEXT_PUBLIC_OPENAI_API_KEY en el .env.local");
}

export const ai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
});
