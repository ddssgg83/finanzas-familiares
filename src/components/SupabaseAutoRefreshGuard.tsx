// src/components/SupabaseAutoRefreshGuard.tsx
"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Guard “silencioso”:
 * Como tenemos autoRefreshToken:false, NO debemos llamar startAutoRefresh.
 * Este componente solo se asegura de que el refresh quede apagado y no haga requests.
 */
export function SupabaseAutoRefreshGuard() {
  useEffect(() => {
    try {
      supabase.auth.stopAutoRefresh();
    } catch {
      // silencio
    }
  }, []);

  return null;
}
