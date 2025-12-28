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
};

const FAMILY_CACHE_KEY = "ff-family-cache-v1";

function readFamilyCache(): FamilyContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(FAMILY_CACHE_KEY);
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

function writeFamilyCache(ctx: FamilyContext | null) {
  if (typeof window === "undefined") return;
  try {
    if (!ctx) {
      localStorage.removeItem(FAMILY_CACHE_KEY);
      return;
    }
    localStorage.setItem(FAMILY_CACHE_KEY, JSON.stringify(ctx));
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
      writeFamilyCache(null);
      return;
    }

    let cancelled = false;

    const userId = currentUser.id;
    const email = (currentUser.email ?? "").toLowerCase();

    const loadFamily = async () => {
      setFamilyLoading(true);
      setFamilyError(null);

      // ✅ OFFLINE: no intentes pegar a Supabase
      if (typeof window !== "undefined" && !navigator.onLine) {
        const cached = readFamilyCache();
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
            writeFamilyCache(null);
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
          writeFamilyCache(nextCtx);
        }
      } catch (err) {
        // ✅ si se fue el internet a mitad, cae a cache y NO spamees error
        if (typeof window !== "undefined" && !navigator.onLine) {
          if (!cancelled) {
            const cached = readFamilyCache();
            setFamilyCtx(cached);
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

    return () => {
      cancelled = true;
    };
  }, [user]);

  const isFamilyOwner = useMemo(() => {
    if (!familyCtx || !user) return false;
    return familyCtx.ownerUserId === user.id;
  }, [familyCtx, user]);

  return { familyCtx, familyLoading, familyError, isFamilyOwner };
}
