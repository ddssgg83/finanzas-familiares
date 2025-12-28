// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("⚠️ Falta configurar NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

/**
 * Fetch “suave”:
 * - OFFLINE: NO lanza throw (evita overlay ruidoso), devuelve Response 599.
 * - Si falla fetch y detecta offline: también devuelve 599.
 */
const robustFetch: typeof fetch = async (input, init) => {
  const isBrowser = typeof window !== "undefined";

  if (isBrowser && !navigator.onLine) {
    return new Response(JSON.stringify({ message: "offline" }), {
      status: 599,
      statusText: "Offline",
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    return await fetch(input, init);
  } catch (err) {
    if (isBrowser && !navigator.onLine) {
      return new Response(JSON.stringify({ message: "offline" }), {
        status: 599,
        statusText: "Offline",
        headers: { "Content-Type": "application/json" },
      });
    }
    throw err;
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: robustFetch },
  auth: {
    persistSession: true,
    autoRefreshToken: false, // ✅ clave para evitar AuthApiError offline
    detectSessionInUrl: true,
  },
});
