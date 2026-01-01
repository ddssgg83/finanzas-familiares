"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type FamilyContext = {
  familyId: string;
  familyName: string;
  ownerUserId: string;
  activeMembers: number;
  activeMemberUserIds: string[];
  cachedAt?: string; // ✅ metadata (no rompe nada)
};

// ✅ Cache por usuario (evita que un user pise a otro)
function familyCacheKey(userId: string) {
  return `ff-family-cache-v2:${userId}`;
}

function readFamilyCache(userId: string): FamilyContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(familyCacheKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    if (
      typeof (parsed as any).familyId !== "string" ||
      typeof (parsed as any).familyName !== "string" ||
      typeof (parsed as any).ownerUserId !== "string" ||
      typeof (parsed as any).activeMembers !== "number" ||
      !Array.isArray((parsed as any).activeMemberUserIds)
    ) {
      return null;
    }

    return parsed as FamilyContext;
  } catch {
    return null;
  }
}

function writeFamilyCache(userId: string, ctx: FamilyContext | null) {
  if (typeof window === "undefined") return;
  try {
    if (!ctx) {
      localStorage.removeItem(familyCacheKey(userId));
      return;
    }
    localStorage.setItem(
      familyCacheKey(userId),
      JSON.stringify({ ...ctx, cachedAt: new Date().toISOString() })
    );
  } catch {
    // ignore
  }
}

export function useFamilyContext(user: User | null) {
  const [familyCtx, setFamilyCtx] = useState<FamilyContext | null>(null);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [familyError, setFamilyError] = useState<string | null>(null);

  useEffect(() => {
    const currentUser = user;

    if (!currentUser) {
      setFamilyCtx(null);
      setFamilyError(null);
      setFamilyLoading(false);
      return;
    }

    let cancelled = false;

    const userId = currentUser.id;
    const email = (currentUser.email ?? "").toLowerCase();

    // ✅ IMPORTANTE: hidrata inmediatamente desde cache (evita flash a null/0)
    const cached = readFamilyCache(userId);
    if (cached) setFamilyCtx((prev) => prev ?? cached);

    const loadFamily = async () => {
      setFamilyLoading(true);
      setFamilyError(null);

      // ✅ OFFLINE: NO pegar a Supabase, solo cache
      if (typeof window !== "undefined" && !navigator.onLine) {
        if (!cancelled) {
          setFamilyCtx(cached);
          setFamilyError(null);
          setFamilyLoading(false);
        }
        return;
      }

      try {
        const { data: memberRows, error: memberError } = await supabase
          .from("family_members")
          .select("id,family_id,status,user_id,invited_email")
          .or(`user_id.eq.${userId},invited_email.eq.${email}`)
          .eq("status", "active")
          .limit(1);

        if (memberError) throw memberError;

        if (!memberRows || memberRows.length === 0) {
          if (!cancelled) {
            setFamilyCtx(null);
            writeFamilyCache(userId, null);
          }
          return;
        }

        const member = memberRows[0];

        const { data: fam, error: famError } = await supabase
          .from("families")
          .select("id,name,user_id")
          .eq("id", member.family_id)
          .single();

        if (famError) throw famError;

        const { data: activeMembersRows, error: membersError } = await supabase
          .from("family_members")
          .select("id,status,user_id")
          .eq("family_id", fam.id)
          .eq("status", "active");

        if (membersError) throw membersError;

        const activeMemberUserIds = (activeMembersRows ?? [])
          .map((m) => m.user_id)
          .filter((id): id is string => !!id);

        const nextCtx: FamilyContext = {
          familyId: fam.id,
          familyName: fam.name,
          ownerUserId: fam.user_id,
          activeMembers: activeMembersRows?.length ?? 0,
          activeMemberUserIds,
        };

        if (!cancelled) {
          setFamilyCtx(nextCtx);
          writeFamilyCache(userId, nextCtx);
        }
      } catch (err) {
        // ✅ Si se fue el internet a mitad: cae a cache, sin error
        if (typeof window !== "undefined" && !navigator.onLine) {
          const fallback = readFamilyCache(userId);
          if (!cancelled) {
            setFamilyCtx(fallback);
            setFamilyError(null);
            setFamilyLoading(false);
          }
          return;
        }

        console.error("useFamilyContext error:", err);
        if (!cancelled) {
          setFamilyError(
            "No se pudo cargar la información de tu familia. Revisa la sección Familia."
          );
          setFamilyCtx(null);
        }
      } finally {
        if (!cancelled) setFamilyLoading(false);
      }
    };

    loadFamily();

    // ✅ Opcional pero útil: al volver online, refresca solo el ctx
    const onOnline = () => {
      if (!cancelled) loadFamily();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
    }

    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
      }
    };
  }, [user]);

  const isFamilyOwner = useMemo(() => {
    if (!familyCtx || !user) return false;
    return familyCtx.ownerUserId === user.id;
  }, [familyCtx, user]);

  // ✅ extra: si estás offline y hay cache, te sirve para mostrar un badge
  const isUsingCachedFamily = useMemo(() => {
    if (typeof window === "undefined") return false;
    return !navigator.onLine && !!familyCtx;
  }, [familyCtx]);

  return { familyCtx, familyLoading, familyError, isFamilyOwner, isUsingCachedFamily };
}
