function looksLikeUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function prettySupabaseAuthError(message?: string) {
  const raw = String(message ?? "").trim();
  const msg = raw.toLowerCase();

  if (!raw) {
    return "No pudimos iniciar sesión. Intenta de nuevo.";
  }

  if (msg.includes("invalid login credentials")) {
    return "Correo o contraseña incorrectos.";
  }

  if (msg.includes("email not confirmed")) {
    return "Tu cuenta requiere verificación de correo antes de continuar.";
  }

  if (msg.includes("user already registered")) {
    return "Este correo ya tiene cuenta. Inicia sesión o usa otro correo.";
  }

  if (msg.includes("password")) {
    return "La contraseña no es válida. Usa al menos 6 caracteres.";
  }

  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("load failed")) {
    return "No pudimos conectarnos al servicio de acceso. Revisa tu conexión e intenta de nuevo en unos segundos.";
  }

  if (msg.includes("offline")) {
    return "No hay conexión a internet. Reconéctate e intenta de nuevo.";
  }

  if (msg.includes("fetch")) {
    return "La solicitud de acceso no pudo completarse. Intenta de nuevo en unos segundos.";
  }

  return raw;
}

export function getSupabaseConfigError() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

  if (!url || !anonKey) {
    return "Falta configurar Supabase en este despliegue.";
  }

  if (!looksLikeUrl(url)) {
    return "La URL pública de Supabase no es válida en este despliegue.";
  }

  return null;
}
