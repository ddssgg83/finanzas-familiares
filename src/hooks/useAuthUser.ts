// src/hooks/useAuthUser.ts
"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * Offline-safe:
 * - NO usa supabase.auth.getUser() (porque pega a red)
 * - usa getSession() (lee storage local)
 * - se mantiene sincronizado con onAuthStateChange
 */
export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const { data } = await supabase.auth.getSession(); // ✅ local, offline-safe
        if (!cancelled) setUser(data.session?.user ?? null);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };

    boot();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, authLoading };
}
