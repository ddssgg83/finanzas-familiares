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

    const userId = currentUser.id;
    const email = (currentUser.email ?? "").toLowerCase();
    let cancelled = false;

    const loadFamily = async () => {
      setFamilyLoading(true);
      setFamilyError(null);

      try {
        const { data: memberRows, error: memberError } = await supabase
          .from("family_members")
          .select("id,family_id,status,user_id,invited_email")
          .or(`user_id.eq.${userId},invited_email.eq.${email}`)
          .eq("status", "active")
          .limit(1);

        if (memberError) throw memberError;

        if (!memberRows || memberRows.length === 0) {
          if (!cancelled) setFamilyCtx(null);
          return;
        }

        const member = memberRows[0];

        const { data: fam, error: famError } = await supabase
          .from("families")
          .select("id,name,user_id")
          .eq("id", member.family_id)
          .single();

        if (famError) throw famError;

        const { data: activeMembers, error: membersError } = await supabase
          .from("family_members")
          .select("id,status,user_id")
          .eq("family_id", fam.id)
          .eq("status", "active");

        if (membersError) throw membersError;

        const activeMemberUserIds = (activeMembers ?? [])
          .map((m) => m.user_id)
          .filter((id): id is string => !!id);

        if (!cancelled) {
          setFamilyCtx({
            familyId: fam.id,
            familyName: fam.name,
            ownerUserId: fam.user_id,
            activeMembers: activeMembers?.length ?? 0,
            activeMemberUserIds,
          });
        }
      } catch (err) {
        console.error("useFamilyContext error:", err);
        if (!cancelled) {
          setFamilyError("No se pudo cargar la información de tu familia. Revisa la sección Familia.");
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
