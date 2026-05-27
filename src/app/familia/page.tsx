// =======================================
// FILE: src/app/familia/page.tsx
// =======================================
"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";
import { PageShell } from "@/components/ui/PageShell";
import { formatDateDisplay } from "@/lib/format";
import { useFamilyContext, type FamilyContext } from "@/hooks/useFamilyContext";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  Button,
  Card,
  EmptyState,
  Help,
  Input,
  Label,
  LinkButton,
  ListItem,
  Section,
  Select,
  StatCard,
  Textarea,
} from "@/components/ui/kit";

export const dynamic = "force-dynamic";

// =========================================================
// Tipos (familia)
// =========================================================
type FamilyGroupRow = {
  id: string;
  name: string | null;
  owner_user_id?: string | null;
  created_at?: string;
};

type FamilyMemberRow = {
  id: string;
  family_id: string;
  user_id: string | null;

  full_name: string | null;
  invited_email: string | null;

  role: "owner" | "admin" | "member";
  status: "active" | "invited" | "removed";
  created_at?: string;
};

type FamilyInviteRow = {
  id: string;
  family_id: string;
  email: string;
  role: "admin" | "member";
  status: "pending" | "accepted" | "revoked" | "expired";
  invited_by: string | null;
  token: string | null;
  created_at?: string;
  email_sent?: boolean | null;
  email_error?: string | null;
};

type CreateFamilyForm = {
  name: string;
  notes: string;
};

type InviteForm = {
  email: string;
  role: "member" | "admin";
  message: string;
};

// =========================================================
// OFFLINE helpers (cache + cola de sync) — Familia
// =========================================================
function isOfflineNow() {
  if (typeof window === "undefined") return false;
  return !navigator.onLine;
}

function safeUUID() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function cacheKey(base: string, scope: { userId: string; familyId?: string | null }) {
  const fam = scope.familyId ? `fam:${scope.familyId}` : "nofam";
  return `ff-${base}-v1:${scope.userId}:${fam}`;
}

function readCache<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeCache<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// ✅ leer familyCtx cache directo (para obtener familyId apenas se conoce el user)
function familyCtxCacheKey(userId: string) {
  return `ff-family-cache-v2:${userId}`;
}
function readFamilyCtxCache(userId: string): FamilyContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(familyCtxCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const p = parsed as Record<string, unknown>;
    if (
      typeof p.familyId !== "string" ||
      typeof p.familyName !== "string" ||
      typeof p.ownerUserId !== "string"
    ) {
      return null;
    }
    return parsed as FamilyContext;
  } catch {
    return null;
  }
}

// =========================================================
// PUNTO 1: Query directo para obtener MI rol desde BD
// =========================================================
async function fetchMyMembership(userId: string) {
  const ownerRes = await supabase
    .from("family_groups")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .maybeSingle();

  if (ownerRes.data?.id) {
    return {
      data: { family_id: ownerRes.data.id, role: "owner" as const, status: "active" },
      error: null,
    };
  }

  const { data, error } = await supabase
    .from("family_members")
    .select("family_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  return { data, error };
}

type OfflineOp =
  | {
      kind: "create_family";
      id: string;
      payload: { family_name: string; owner_user_id: string; local_family_id: string };
    }
  | {
      kind: "invite";
      id: string;
      payload: {
        family_id: string;
        email: string;
        role: "admin" | "member";
        token: string;
        message?: string | null;
      };
    }
  | {
      kind: "revoke_invite";
      id: string;
      payload: { invite_id: string };
    }
  | {
      kind: "remove_member";
      id: string;
      payload: { member_id: string };
    }
  | {
      kind: "change_role";
      id: string;
      payload: { member_id: string; role: "admin" | "member" };
    };

function opsKey(userId: string) {
  return `ff-familia-ops-v1:${userId}`;
}

function readOps(userId: string): OfflineOp[] {
  return readCache<OfflineOp[]>(opsKey(userId), []);
}

function writeOps(userId: string, ops: OfflineOp[]) {
  writeCache(opsKey(userId), ops);
}

function friendlyFamilyError(message?: string | null) {
  const msg = String(message ?? "").toLowerCase();
  if (!msg) return "No pudimos completar la acción. Intenta de nuevo.";
  if (msg.includes("auth session") || msg.includes("not authenticated") || msg.includes("bearer")) {
    return "Tu sesión expiró. Vuelve a iniciar sesión e inténtalo de nuevo.";
  }
  if (msg.includes("family not found")) {
    return "No encontramos esta familia. Actualiza la pantalla e inténtalo de nuevo.";
  }
  if (msg.includes("not allowed") || msg.includes("permission") || msg.includes("rls")) {
    return "No tienes permisos para hacer esta acción.";
  }
  if (msg.includes("network") || msg.includes("failed to fetch") || msg.includes("offline")) {
    return "No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.";
  }
  return message ?? "No pudimos completar la acción. Intenta de nuevo.";
}

// =========================================================
// Página
// =========================================================
export default function FamiliaPage() {
  const { dictionary, locale } = useI18n();
  const t = dictionary.family;
  const pageT = t.page;

  // -------- AUTH --------
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // ✅ Online/offline reactivo
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [t.errors.auth]);
  const offline = !isOnline;

  // -------- FAMILY CTX --------
  const { familyCtx, familyLoading, familyError, isUsingCachedFamily } = useFamilyContext(user);

  // ✅ familyId cacheado para evitar null offline
  const [cachedFamilyId, setCachedFamilyId] = useState<string | null>(null);

  // ✅ optimistic family id (si se crea familia offline)
  const [optimisticFamilyId, setOptimisticFamilyId] = useState<string | null>(null);

  // ✅ rol y familyId leídos DIRECTO de family_members (online)
  const [myRole, setMyRole] = useState<"owner" | "admin" | "member">("member");
  const [dbFamilyId, setDbFamilyId] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  // ✅ ORDEN (más confiable):
  // 1) familyCtx (si está)
  // 2) dbFamilyId (leído directo de family_members)
  // 3) optimistic (offline create)
  // 4) cached LS
  const effectiveFamilyId =
    familyCtx?.familyId ?? dbFamilyId ?? optimisticFamilyId ?? cachedFamilyId ?? null;

  // -------- DATA --------
  const [familyGroup, setFamilyGroup] = useState<FamilyGroupRow | null>(null);
  const [members, setMembers] = useState<FamilyMemberRow[]>([]);
  const [invites, setInvites] = useState<FamilyInviteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // -------- OFFLINE QUEUE --------
  const [pendingOpsCount, setPendingOpsCount] = useState(0);
  const syncInFlight = useRef(false);

  // forzar refresh visual después de sync
  const [reloadTick, setReloadTick] = useState(0);

  // -------- FORMS --------
  const [createFamilyForm, setCreateFamilyForm] = useState<CreateFamilyForm>({
    name: "",
    notes: "",
  });
  const [inviteForm, setInviteForm] = useState<InviteForm>({
    email: "",
    role: "member",
    message: "",
  });

  const [savingCreateFamily, setSavingCreateFamily] = useState(false);
  const [savingInvite, setSavingInvite] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState<{
    tone: "success" | "warning" | "error";
    message: string;
  } | null>(null);

  // -------- LIMPIEZA INVITES (B + C) --------
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [hideCleanupNudge, setHideCleanupNudge] = useState(false);
  const cleanupNudgeKey = useMemo(() => {
    if (!user?.id || !effectiveFamilyId) return null;
    return `ff-family-cleanup-nudge-v1:${user.id}:${effectiveFamilyId}`;
  }, [user?.id, effectiveFamilyId]);

  // =========================================================
  // Helpers UI
  // =========================================================
  const buildInviteLink = (token: string) => {
    if (typeof window === "undefined") return `/familia/aceptar?token=${encodeURIComponent(token)}`;
    return `${window.location.origin}/familia/aceptar?token=${encodeURIComponent(token)}`;
  };

  const copyInviteLink = async (token: string | null) => {
    try {
      if (!token) {
        alert(t.errors.copyMissingToken);
        return;
      }
      const link = buildInviteLink(token);
      await navigator.clipboard.writeText(link);
      alert(pageT.linkCopied);
    } catch (err) {
      console.error("Error copiando link:", err);
      alert(t.errors.copyLink);
    }
  };

  // =========================================================
  // AUTH (offline-safe)
  // =========================================================
  useEffect(() => {
    let ignore = false;

    async function loadUser() {
      setAuthLoading(true);
      setAuthError(null);

      try {
        const { data } = await supabase.auth.getSession();
        const sessionUser = data.session?.user ?? null;
        if (!ignore) setUser(sessionUser);
      } catch {
        if (!ignore) {
          setUser(null);
          setAuthError(t.errors.auth);
        }
      } finally {
        if (!ignore) setAuthLoading(false);
      }
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      ignore = true;
      subscription.unsubscribe();
    };
  }, [t.errors.auth]);

  // ✅ cuando ya conozcamos user, leemos familyId del cache inmediato
  useEffect(() => {
    if (!user) {
      setCachedFamilyId(null);
      return;
    }
    const cached = readFamilyCtxCache(user.id);
    setCachedFamilyId(cached?.familyId ?? null);
  }, [user]);

  // =========================================================
  // Leer MI rol desde BD (family_members)
  // =========================================================
  useEffect(() => {
    let alive = true;

    async function loadRole() {
      if (!user) {
        setMyRole("member");
        setDbFamilyId(null);
        setRoleError(null);
        return;
      }

      if (isOfflineNow()) {
        if (familyCtx?.ownerUserId === user.id || familyGroup?.owner_user_id === user.id) {
          setMyRole("owner");
        }
        setRoleError(null);
        return;
      }

      try {
        setRoleLoading(true);
        setRoleError(null);

        const res = await fetchMyMembership(user.id);

        if (!alive) return;

        if (res.error) {
          setMyRole("member");
          setDbFamilyId(null);
          setRoleError(friendlyFamilyError(res.error.message));
          return;
        }

        const row = res.data as
          | null
          | { family_id: string; role: "owner" | "admin" | "member"; status: string };

        if (!row) {
          setMyRole("member");
          setDbFamilyId(null);
          setRoleError(t.errors.noActiveMembership);
          return;
        }

        setMyRole(row.role);
        setDbFamilyId(row.family_id);
        setRoleError(null);
      } catch (err: any) {
        if (!alive) return;
        setMyRole("member");
        setDbFamilyId(null);
        setRoleError(friendlyFamilyError(err?.message));
      } finally {
        if (alive) setRoleLoading(false);
      }
    }

    loadRole();
    return () => {
      alive = false;
    };
  }, [user, user?.id, isOnline, familyCtx?.ownerUserId, familyGroup?.owner_user_id, t.errors.noActiveMembership]);

  // ✅ UI gating basado en BD (no en cache)
  const isFamilyOwnerUI =
    myRole === "owner" ||
    familyCtx?.ownerUserId === user?.id ||
    familyGroup?.owner_user_id === user?.id;
  const canManageInvitesUI = isFamilyOwnerUI || myRole === "admin";

  // ✅ leer preferencia de “ocultar aviso limpieza”
  useEffect(() => {
    if (!cleanupNudgeKey) {
      setHideCleanupNudge(false);
      return;
    }
    try {
      const raw = localStorage.getItem(cleanupNudgeKey);
      setHideCleanupNudge(raw === "1");
    } catch {
      setHideCleanupNudge(false);
    }
  }, [cleanupNudgeKey]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setFamilyGroup(null);
      setMembers([]);
      setInvites([]);
      setPendingOpsCount(0);
      setOptimisticFamilyId(null);
      setCachedFamilyId(null);
      setDbFamilyId(null);
      setMyRole("member");
      setRoleError(null);
    } catch (err) {
      console.error("Error cerrando sesión", err);
    }
  };

  // =========================================================
  // SYNC OFFLINE OPS — cuando vuelva internet
  // =========================================================
  const syncOfflineOps = async () => {
    if (!user) return;
    if (isOfflineNow()) return;
    if (syncInFlight.current) return;

    syncInFlight.current = true;
    try {
      const ops = readOps(user.id);
      setPendingOpsCount(ops.length);
      if (ops.length === 0) return;

      const remaining: OfflineOp[] = [];

      for (const op of ops) {
        try {
          if (op.kind === "create_family") {
            const { data: fg, error: fgErr } = await supabase
              .from("family_groups")
              .insert([{ name: op.payload.family_name, owner_user_id: op.payload.owner_user_id }])
              .select("id,name,owner_user_id,created_at")
              .single();

            if (fgErr) throw fgErr;

            const familyId = (fg as any).id as string;

            const { error: fmErr } = await supabase.from("family_members").insert([
              {
                family_id: familyId,
                user_id: user.id,
                full_name: user.email ?? "Owner",
                invited_email: user.email ?? null,
                role: "owner",
                status: "active",
              },
            ]);
            if (fmErr) throw fmErr;

            if (optimisticFamilyId && optimisticFamilyId === op.payload.local_family_id) {
              setOptimisticFamilyId(null);
            }
          }

          if (op.kind === "invite") {
            const { data: sess } = await supabase.auth.getSession();
            const accessToken = sess.session?.access_token;

            const res = await fetch("/api/family/invite", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
              },
              body: JSON.stringify({
                familyId: op.payload.family_id,
                email: op.payload.email,
                role: op.payload.role,
                inviterName: user.email ?? t.familyAdmin,
                message: op.payload.message ?? null,
                locale,
              }),
            });

            const json = await res.json().catch(() => ({}));

            if (!res.ok) {
              const msg = String(json?.error ?? "").toLowerCase();
              const isDuplicate =
                msg.includes("duplicate") || msg.includes("unique") || res.status === 409;

              if (!isDuplicate) throw new Error(json?.error || "Invite sync failed");
            }
          }

          if (op.kind === "revoke_invite") {
            const { error } = await supabase
              .from("family_invites")
              .update({ status: "revoked" })
              .eq("id", op.payload.invite_id);
            if (error) throw error;
          }

          if (op.kind === "remove_member") {
            const { error } = await supabase
              .from("family_members")
              .update({ status: "removed" })
              .eq("id", op.payload.member_id);
            if (error) throw error;
          }

          if (op.kind === "change_role") {
            const { error } = await supabase
              .from("family_members")
              .update({ role: op.payload.role })
              .eq("id", op.payload.member_id);
            if (error) throw error;
          }
        } catch {
          remaining.push(op);
        }
      }

      writeOps(user.id, remaining);
      setPendingOpsCount(remaining.length);

      setReloadTick((n) => n + 1);
    } finally {
      syncInFlight.current = false;
    }
  };

  useEffect(() => {
    if (!user) return;
    const onOnline = () => syncOfflineOps();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // =========================================================
  // LOAD DATA — OFFLINE SAFE + cache
  // =========================================================
  useEffect(() => {
    let alive = true;

    async function load() {
      if (!user) {
        setFamilyGroup(null);
        setMembers([]);
        setInvites([]);
        setPendingOpsCount(0);
        return;
      }

      const famId = effectiveFamilyId;
      const scope = { userId: user.id, familyId: famId };

      const groupK = cacheKey("family_group", scope);
      const membersK = cacheKey("family_members", scope);
      const invitesK = cacheKey("family_invites", scope);

      const ops = readOps(user.id);
      setPendingOpsCount(ops.length);

      // OFFLINE: solo cache
      if (isOfflineNow()) {
        setLoading(false);
        setDataError(null);

        setFamilyGroup(readCache<FamilyGroupRow | null>(groupK, null));
        setMembers(readCache<FamilyMemberRow[]>(membersK, []));
        setInvites(readCache<FamilyInviteRow[]>(invitesK, []));
        return;
      }

      // ONLINE
      try {
        setLoading(true);
        setDataError(null);

        if (!famId) {
          setFamilyGroup(null);
          setMembers([]);
          setInvites([]);

          writeCache(groupK, null);
          writeCache(membersK, []);
          writeCache(invitesK, []);

          await syncOfflineOps();
          return;
        }

        const groupRes = await supabase
          .from("family_groups")
          .select("id,name,owner_user_id,created_at")
          .eq("id", famId)
          .single();

        const membersRes = await supabase
          .from("family_members")
          .select("id,family_id,user_id,full_name,invited_email,role,status,created_at")
          .eq("family_id", famId)
          .order("created_at", { ascending: true });

        const invitesRes = await supabase
          .from("family_invites")
          .select("id,family_id,email,role,status,invited_by,token,created_at")
          .eq("family_id", famId)
          .order("created_at", { ascending: false });

        if (!alive) return;

        if (groupRes.error) console.warn("Error cargando family_groups", groupRes.error);
        if (membersRes.error) console.warn("Error cargando family_members", membersRes.error);
        if (invitesRes.error) console.warn("Error cargando family_invites", invitesRes.error);

        const cachedGroup = readCache<FamilyGroupRow | null>(groupK, null);
        const cachedMembers = readCache<FamilyMemberRow[]>(membersK, []);
        const cachedInvites = readCache<FamilyInviteRow[]>(invitesK, []);

        const group = (groupRes.data ?? null) as FamilyGroupRow | null;
        const mems = (membersRes.data ?? []) as FamilyMemberRow[];
        const invs = (invitesRes.data ?? []) as FamilyInviteRow[];

        setFamilyGroup(groupRes.error ? cachedGroup : group);
        setMembers((prev) => {
          if (membersRes.error) return cachedMembers.length ? cachedMembers : prev;
          if (mems.length === 0 && (cachedMembers.length > 0 || prev.length > 0)) {
            return cachedMembers.length ? cachedMembers : prev;
          }
          return mems;
        });

        // ✅ FIX: no borres invites si el query regresa vacío y tú ya tenías (optimista/cache)
        setInvites((prev) => {
          if (invitesRes.error) return cachedInvites.length ? cachedInvites : prev;
          if (invs.length === 0 && (cachedInvites.length > 0 || prev.length > 0)) {
            return cachedInvites.length ? cachedInvites : prev;
          }
          return invs;
        });

        if (!groupRes.error) writeCache(groupK, group);
        if (!membersRes.error) writeCache(membersK, mems);

        // cachea invites SOLO si no hubo error
        if (!invitesRes.error) writeCache(invitesK, invs);

        await syncOfflineOps();
      } catch (err: any) {
        if (!alive) return;

        const msg = String(err?.message ?? "").toLowerCase();
        const looksOffline =
          msg.includes("offline") || msg.includes("failed to fetch") || msg.includes("network");

        if (looksOffline) {
          setFamilyGroup(readCache<FamilyGroupRow | null>(groupK, null));
          setMembers(readCache<FamilyMemberRow[]>(membersK, []));
          setInvites(readCache<FamilyInviteRow[]>(invitesK, []));
          setDataError(null);
        } else {
          console.error("Error cargando módulo familia:", err);
          setDataError(t.errors.loadFamily);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, effectiveFamilyId, reloadTick]);

  // =========================================================
  // Stats
  // =========================================================
  const activeMembersFromList = useMemo(
    () => members.filter((m) => m.status === "active").length,
    [members]
  );

  const activeMembers = useMemo(() => {
    if (activeMembersFromList > 0) return activeMembersFromList;
    if (!isOfflineNow()) return activeMembersFromList;
    if (activeMembersFromList > 0) return activeMembersFromList;
    return familyCtx?.activeMembers ?? 0;
  }, [activeMembersFromList, familyCtx]);

  const pendingInvites = useMemo(
    () => invites.filter((i) => i.status === "pending").length,
    [invites]
  );

  const historicalInvitesCount = useMemo(
    () => invites.filter((i) => i.status !== "pending").length,
    [invites]
  );

  const shouldShowCleanupNudge = useMemo(() => {
    const THRESHOLD = 8;
    return (
      canManageInvitesUI &&
      !offline &&
      !!effectiveFamilyId &&
      !hideCleanupNudge &&
      historicalInvitesCount >= THRESHOLD
    );
  }, [canManageInvitesUI, offline, effectiveFamilyId, hideCleanupNudge, historicalInvitesCount]);

  // =========================================================
  // Create Family
  // =========================================================
  const handleCreateFamily = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return alert(t.errors.expired);
    if (!createFamilyForm.name.trim()) return alert(t.errors.familyNameRequired);
    if (familyCtx?.familyId) return;

    const localFamilyId = safeUUID();

    try {
      setSavingCreateFamily(true);

      if (isOfflineNow()) {
        setOptimisticFamilyId(localFamilyId);

        const scope = { userId: user.id, familyId: localFamilyId };
        const groupK = cacheKey("family_group", scope);
        const membersK = cacheKey("family_members", scope);
        const invitesK = cacheKey("family_invites", scope);

        const localGroup: FamilyGroupRow = {
          id: localFamilyId,
          name: createFamilyForm.name.trim(),
          owner_user_id: user.id,
          created_at: new Date().toISOString(),
        };

        const localMe: FamilyMemberRow = {
          id: safeUUID(),
          family_id: localFamilyId,
          user_id: user.id,
          full_name: user.email ?? t.owner,
          invited_email: user.email ?? null,
          role: "owner",
          status: "active",
          created_at: new Date().toISOString(),
        };

        writeCache(groupK, localGroup);
        writeCache(membersK, [localMe]);
        writeCache(invitesK, []);

        setFamilyGroup(localGroup);
        setMembers([localMe]);
        setInvites([]);

        const ops = readOps(user.id);
        const nextOps: OfflineOp[] = [
          ...ops,
          {
            kind: "create_family",
            id: safeUUID(),
            payload: {
              family_name: createFamilyForm.name.trim(),
              owner_user_id: user.id,
              local_family_id: localFamilyId,
            },
          },
        ];
        writeOps(user.id, nextOps);
        setPendingOpsCount(nextOps.length);

        setCreateFamilyForm({ name: "", notes: "" });
        return;
      }

      const { data: fg, error: fgErr } = await supabase
        .from("family_groups")
        .insert([{ name: createFamilyForm.name.trim(), owner_user_id: user.id }])
        .select("id,name,owner_user_id,created_at")
        .single();

      if (fgErr) throw fgErr;

      const familyId = (fg as any).id as string;

      const { error: fmErr } = await supabase.from("family_members").insert([
        {
          family_id: familyId,
          user_id: user.id,
          full_name: user.email ?? t.owner,
          invited_email: user.email ?? null,
          role: "owner",
          status: "active",
        },
      ]);
      if (fmErr) throw fmErr;

      setCreateFamilyForm({ name: "", notes: "" });
      setFamilyGroup(fg as any);
      setReloadTick((n) => n + 1);
    } catch (err) {
      console.error("Error creando familia:", err);
      alert(t.errors.createFamily);
    } finally {
      setSavingCreateFamily(false);
    }
  };

  // =========================================================
  // Invite (usa /api/family/invite -> SMTP)
  // =========================================================
  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return alert(t.errors.expired);

    const famId = effectiveFamilyId;
    if (!famId) return alert(t.errors.createFamilyFirst);
    if (!canManageInvitesUI) return alert(t.errors.invitePermission);

    const email = inviteForm.email.trim().toLowerCase();
    if (!email || !email.includes("@")) return alert(t.errors.validEmail);

    try {
      setSavingInvite(true);
      setInviteFeedback(null);

      if (offline) {
        alert(t.errors.inviteOnline);
        return;
      }

      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;

      const res = await fetch("/api/family/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          familyId: famId,
          email,
          role: inviteForm.role === "admin" ? "admin" : "member",
          inviterName: user.email ?? t.member,
          message: inviteForm.message || null,
          locale,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || json?.ok !== true) {
        throw new Error(json?.error || t.errors.inviteSend);
      }

      const optimistic: FamilyInviteRow = {
        id: json.token || safeUUID(),
        family_id: famId,
        email,
        role: inviteForm.role === "admin" ? "admin" : "member",
        status: "pending",
        invited_by: user.id,
        token: json.token ?? null,
        created_at: new Date().toISOString(),
        email_sent: json.email_sent ?? null,
        email_error: json.email_error ?? null,
      };

      setInvites((prev) => [optimistic, ...prev]);

      // ✅ cachear el optimistic para que no “desaparezca” si el load() trae []
      try {
        const scope = { userId: user.id, familyId: famId };
        const invitesK = cacheKey("family_invites", scope);
        const current = readCache<FamilyInviteRow[]>(invitesK, []);
        writeCache(invitesK, [optimistic, ...current]);
      } catch {}

      if (json.email_sent) {
        setInviteFeedback({
          tone: "success",
          message: pageT.inviteCreatedSent(email),
        });
      } else {
        const reason = String(json.email_error ?? "").trim();
        setInviteFeedback({
          tone: "warning",
          message: reason
            ? pageT.inviteCreatedNoEmailReason(reason)
            : pageT.inviteCreatedNoEmail,
        });
        console.warn("SMTP error:", json.email_error);
      }

      setInviteForm({ email: "", role: "member", message: "" });
      setReloadTick((n) => n + 1);
    } catch (err: any) {
      console.error("Error invitando:", err);
      setInviteFeedback({
        tone: "error",
        message: err?.message ?? t.errors.inviteSend,
      });
    } finally {
      setSavingInvite(false);
    }
  };

  // =========================================================
  // Members actions
  // =========================================================
  const handleRemoveMember = async (memberId: string) => {
    if (!user) return;
    if (!isFamilyOwnerUI) return alert(t.errors.removeMemberPermission);
    if (!window.confirm(t.confirms.removeMember)) return;

    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, status: "removed" } : m)));

    if (isOfflineNow()) {
      const ops = readOps(user.id);
      const nextOps: OfflineOp[] = [
        ...ops,
        { kind: "remove_member", id: safeUUID(), payload: { member_id: memberId } },
      ];
      writeOps(user.id, nextOps);
      setPendingOpsCount(nextOps.length);
      return;
    }

    try {
      const { error } = await supabase
        .from("family_members")
        .update({ status: "removed" })
        .eq("id", memberId);
      if (error) throw error;
      await syncOfflineOps();
      setReloadTick((n) => n + 1);
    } catch (err) {
      console.error("Error removiendo miembro:", err);
      alert(t.errors.removeMember);
    }
  };

  const handleChangeRole = async (memberId: string, role: "admin" | "member") => {
    if (!user) return;
    if (!canManageInvitesUI) return;

    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));

    if (isOfflineNow()) {
      const ops = readOps(user.id);
      const nextOps: OfflineOp[] = [
        ...ops,
        { kind: "change_role", id: safeUUID(), payload: { member_id: memberId, role } },
      ];
      writeOps(user.id, nextOps);
      setPendingOpsCount(nextOps.length);
      return;
    }

    try {
      const { error } = await supabase.from("family_members").update({ role }).eq("id", memberId);
      if (error) throw error;
      await syncOfflineOps();
      setReloadTick((n) => n + 1);
    } catch (err) {
      console.error("Error cambiando rol:", err);
      alert(t.errors.changeRole);
    }
  };

  // =========================================================
  // Invite actions
  // =========================================================
  const handleRevokeInvite = async (inviteId: string) => {
    if (!user) return;
    if (!canManageInvitesUI) return;
    if (!window.confirm(t.confirms.revokeInvite)) return;

    setInvites((prev) => prev.map((i) => (i.id === inviteId ? { ...i, status: "revoked" } : i)));

    if (isOfflineNow()) {
      const ops = readOps(user.id);
      const nextOps: OfflineOp[] = [
        ...ops,
        { kind: "revoke_invite", id: safeUUID(), payload: { invite_id: inviteId } },
      ];
      writeOps(user.id, nextOps);
      setPendingOpsCount(nextOps.length);
      return;
    }

    try {
      const { error } = await supabase
        .from("family_invites")
        .update({ status: "revoked" })
        .eq("id", inviteId);

      if (error) throw error;

      await syncOfflineOps();
      setReloadTick((n) => n + 1);
    } catch (err) {
      console.error("Error revocando invitación:", err);
      alert(t.errors.inviteSend);
    }
  };

  const handleDeleteInvite = async (inviteId: string) => {
    if (!user) return;
    if (!canManageInvitesUI) return;

    if (offline) {
      alert(t.errors.deleteInviteOnline);
      return;
    }

    if (!window.confirm(t.confirms.deleteInvite)) return;

    const prev = invites;
    setInvites((list) => list.filter((i) => i.id !== inviteId));

    try {
      const { data, error } = await supabase
        .from("family_invites")
        .delete()
        .eq("id", inviteId)
        .select("id");

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error(t.errors.deleteInviteMissing);
      }

      await syncOfflineOps();
      setReloadTick((n) => n + 1);
    } catch (err: any) {
      console.error("Error eliminando invitación:", err);
      setInvites(prev);
      alert(err?.message ?? t.errors.deleteInvite);
    }
  };

  const handlePurgeInviteHistory = async () => {
    if (!user) return;
    if (!isFamilyOwnerUI) return;
    if (!effectiveFamilyId) return;

    if (offline) {
      alert(t.errors.purgeOnline);
      return;
    }

    if (historicalInvitesCount === 0) {
      alert(t.errors.purgeNone);
      return;
    }

    const ok = window.confirm(t.confirms.purgeHistory(historicalInvitesCount));
    if (!ok) return;

    const prev = invites;
    const statusesToDelete: Array<FamilyInviteRow["status"]> = ["accepted", "revoked", "expired"];

    setInvites((list) => list.filter((i) => !statusesToDelete.includes(i.status)));

    try {
      setPurgeLoading(true);

      const { data, error } = await supabase
        .from("family_invites")
        .delete()
        .eq("family_id", effectiveFamilyId)
        .in("status", statusesToDelete)
        .select("id");

      if (error) throw error;

      const deletedCount = data?.length ?? 0;
      if (deletedCount === 0) throw new Error(t.errors.purgeEmpty);

      if (cleanupNudgeKey) {
        try {
          localStorage.setItem(cleanupNudgeKey, "1");
        } catch {}
      }
      setHideCleanupNudge(true);

      await syncOfflineOps();
      setReloadTick((n) => n + 1);

      alert(pageT.purgeDone(deletedCount));
    } catch (err: any) {
      console.error("Error limpiando historial:", err);
      setInvites(prev);
      alert(err?.message ?? t.errors.purgeHistory);
    } finally {
      setPurgeLoading(false);
    }
  };

  const handleHideCleanupNudge = () => {
    setHideCleanupNudge(true);
    if (!cleanupNudgeKey) return;
    try {
      localStorage.setItem(cleanupNudgeKey, "1");
    } catch {}
  };

  // =========================================================
  // Render AUTH
  // =========================================================
  if (authLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-sm text-slate-600 dark:text-slate-300">
        {t.loadingSession}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center text-sm text-slate-600 dark:text-slate-300">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-base font-semibold text-slate-950 dark:text-slate-50">{pageT.guestTitle}</h1>
          <p className="mt-2 leading-6">
            {pageT.guestBody}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <a href="/onboarding?mode=login&next=%2Ffamilia">
              <Button>{t.login}</Button>
            </a>
            <a href="/onboarding?mode=signup&next=%2Ffamilia">
              <LinkButton tone="info">{t.signup}</LinkButton>
            </a>
          </div>
        </div>
        {authError && <p className="mt-2 text-xs text-rose-500">{authError}</p>}
      </div>
    );
  }

  // =========================================================
  // Render PAGE
  // =========================================================
  const showSnapshotBadge =
    isOfflineNow() && (isUsingCachedFamily || members.length > 0 || !!cachedFamilyId);

  return (
    <PageShell>
      <AppHeader
        title={t.title}
        subtitle={pageT.subtitle}
        activeTab="familia"
        userName={(user.user_metadata as { full_name?: string } | undefined)?.full_name ?? null}
        userEmail={user.email ?? ""}
        userId={user.id}
        onSignOut={handleSignOut}
      />

      {(isOfflineNow() || pendingOpsCount > 0 || showSnapshotBadge) && (
        <section className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200">
          {isOfflineNow() ? (
            <div className="space-y-1">
              <div>
                {pageT.offline}
              </div>
              {showSnapshotBadge && (
                <div className="text-[11px] text-slate-600 dark:text-slate-300">
                  {pageT.snapshot}
                </div>
              )}
            </div>
          ) : pendingOpsCount > 0 ? (
            <div>
              {pageT.syncing}{" "}
              <span className="font-semibold">{pendingOpsCount}</span>
            </div>
          ) : null}
        </section>
      )}

      {!offline && roleError ? (
        <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="font-semibold">{pageT.roleConfirmTitle}</div>
          <div className="mt-1 text-[11px] opacity-90">
            {roleError}
          </div>
        </section>
      ) : null}

      {shouldShowCleanupNudge && (
        <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="font-semibold">{pageT.cleanupTitle}</div>
              <div className="text-[11px] opacity-90">
                {pageT.cleanupBody(historicalInvitesCount)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handlePurgeInviteHistory}
                disabled={purgeLoading || offline}
                title={offline ? t.errors.purgeOnline : undefined}
              >
                {purgeLoading ? pageT.cleaning : pageT.cleanHistory}
              </Button>
              <LinkButton tone="info" onClick={handleHideCleanupNudge}>
                {t.hide}
              </LinkButton>
            </div>
          </div>
        </section>
      )}

      {/* Resumen */}
      <section className="space-y-4">
        <Card>
          <Section
            title={pageT.summaryTitle}
            subtitle={pageT.summarySubtitle}
            right={
              familyCtx || familyGroup ? (
                <div className="text-right text-[11px] text-slate-500 dark:text-slate-400">
                  {t.familyLabel}:{" "}
                  <span className="font-semibold">
                    {familyCtx?.familyName ?? familyGroup?.name ?? pageT.fallbackFamilyName}
                  </span>{" "}
                  ·{" "}
                  {isFamilyOwnerUI ? (
                    <span className="font-semibold">{t.familyAdmin}</span>
                  ) : myRole === "admin" ? (
                    <span className="font-semibold">{t.admin}</span>
                  ) : (
                    <span className="font-semibold">{t.member}</span>
                  )}
                </div>
              ) : (
                <div className="text-right text-[11px] text-slate-500 dark:text-slate-400">
                  {t.noFamily}
                </div>
              )
            }
          >
            {familyLoading && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {pageT.updatingFamily}
              </div>
            )}
            {familyError && <p className="mt-2 text-[11px] text-rose-500">{familyError}</p>}
          </Section>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            label={t.activeMembers}
            value={String(activeMembers)}
            hint={pageT.activeMembersHint}
            tone="good"
          />
          <StatCard
            label={pageT.pendingInvites}
            value={String(pendingInvites)}
            hint={pageT.pendingInvitesHint}
            tone="neutral"
          />
          <StatCard
            label={pageT.yourRole}
            value={
              roleLoading ? "..." : isFamilyOwnerUI ? t.administrator : myRole === "admin" ? t.admin : t.member
            }
            hint={
              isFamilyOwnerUI
                ? pageT.ownerHint
                : myRole === "admin"
                ? pageT.adminHint
                : pageT.memberHint
            }
            tone={isFamilyOwnerUI ? "good" : "neutral"}
          />
        </div>
      </section>

      {/* Crear familia (si no existe) */}
      {!familyCtx && !familyGroup && (
        <section className="mt-4">
          <Card>
            <Section
              title={pageT.createFamilyTitle}
              subtitle={pageT.createFamilySubtitle}
            >
              <form onSubmit={handleCreateFamily} className="mt-2 space-y-3">
                <div>
                  <Label>{pageT.familyName}</Label>
                  <Input
                    value={createFamilyForm.name}
                    onChange={(e) => setCreateFamilyForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder={pageT.familyNamePlaceholder}
                    required
                  />
                </div>

                <div>
                  <Label>{pageT.notesOptional}</Label>
                  <Textarea
                    value={createFamilyForm.notes}
                    onChange={(e) => setCreateFamilyForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder={pageT.notesPlaceholder}
                  />
                  <Help>
                    {pageT.notesHelp}
                  </Help>
                </div>

                <Button type="submit" disabled={savingCreateFamily}>
                  {savingCreateFamily ? pageT.creating : pageT.createFamily}
                </Button>
              </form>
            </Section>
          </Card>
        </section>
      )}

      {/* Invitaciones */}
      <section className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <Section
            title={pageT.inviteMember}
            subtitle={
              isFamilyOwnerUI
                ? pageT.inviteOwnerSubtitle
                : myRole === "admin"
                ? pageT.inviteAdminSubtitle
                : pageT.inviteRestrictedSubtitle
            }
            right={
              !canManageInvitesUI ? (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {pageT.restrictedAction}
                </span>
              ) : offline ? (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {pageT.requiresInternet}
                </span>
              ) : null
            }
          >
            {offline && canManageInvitesUI ? (
              <div className="mt-2 rounded-2xl border p-3 text-[12px]">
                <div className="font-medium">{pageT.offlineInviteTitle}</div>
                <div className="opacity-80">{pageT.offlineInviteBody}</div>
              </div>
            ) : null}

            <form onSubmit={handleInvite} className="mt-2 space-y-3">
              <div>
                <Label>{t.email}</Label>
                <Input
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder={pageT.emailPlaceholder}
                  disabled={!canManageInvitesUI || offline}
                  required
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>{t.role}</Label>
                  <Select
                    value={inviteForm.role}
                    onChange={(e) =>
                      setInviteForm((p) => ({
                        ...p,
                        role: e.target.value === "admin" ? "admin" : "member",
                      }))
                    }
                    disabled={!canManageInvitesUI || offline}
                  >
                    <option value="member">{t.member}</option>
                    <option value="admin">{t.administrator}</option>
                  </Select>
                  <Help>
                    {pageT.inviteRoleHelp}
                  </Help>
                </div>

                <div>
                  <Label>{pageT.messageOptional}</Label>
                  <Input
                    value={inviteForm.message}
                    onChange={(e) => setInviteForm((p) => ({ ...p, message: e.target.value }))}
                    placeholder={pageT.messagePlaceholder}
                    disabled={!canManageInvitesUI || offline}
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={!canManageInvitesUI || savingInvite || !effectiveFamilyId || offline}
                title={offline ? t.errors.inviteOnline : undefined}
              >
                {savingInvite ? pageT.sending : pageT.sendInvite}
              </Button>

              {inviteFeedback ? (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    inviteFeedback.tone === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
                      : inviteFeedback.tone === "warning"
                      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
                      : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"
                  }`}
                >
                  {inviteFeedback.message}
                </div>
              ) : null}

              {!effectiveFamilyId && <Help>{pageT.createFamilyBeforeInvite}</Help>}
              {offline && canManageInvitesUI && <Help>{pageT.inviteRequiresInternet}</Help>}
            </form>
          </Section>
        </Card>

        <Card>
          <Section
            title={pageT.invitesTitle}
            right={
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {pageT.invitationsCount(invites.length)}
                </span>

                {canManageInvitesUI && historicalInvitesCount > 0 ? (
                  <Button
                    onClick={handlePurgeInviteHistory}
                    disabled={purgeLoading || offline}
                    title={offline ? t.errors.purgeOnline : undefined}
                  >
                    {purgeLoading ? pageT.cleaning : pageT.cleanHistory}
                  </Button>
                ) : null}
              </div>
            }
          >
            {loading ? (
              <EmptyState>{pageT.loadingInvites}</EmptyState>
            ) : invites.length === 0 ? (
              <EmptyState>{pageT.emptyInvites}</EmptyState>
            ) : (
              <ul className="space-y-2">
                {invites.map((i) => {
                  const canRevoke = canManageInvitesUI && i.status === "pending";
                  const canDelete = canManageInvitesUI && i.status !== "pending";
                  const canCopy = !!i.token;
                  const emailFailed = i.email_sent === false;
                  const emailDelivered = i.email_sent === true;

                  return (
                    <ListItem
                      key={i.id}
                      left={
                        <>
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {i.email}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {t.role}: {t.roleLabels[i.role] ?? i.role} · {t.status}: {t.statusLabels[i.status] ?? i.status}
                          </div>
                          {emailDelivered ? (
                            <div className="mt-1 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                              {pageT.emailSent}
                            </div>
                          ) : null}
                          {emailFailed ? (
                            <div className="mt-1 space-y-1">
                              <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                                {pageT.emailNotSent}
                              </div>
                              <div className="text-[11px] text-amber-700 dark:text-amber-200">
                                {i.email_error?.trim()
                                  ? `${pageT.reason} ${i.email_error}`
                                  : pageT.emailFallback}
                              </div>
                            </div>
                          ) : null}
                          {i.created_at && (
                            <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                              {formatDateDisplay(i.created_at)}
                            </div>
                          )}
                        </>
                      }
                      right={
                        <div className="flex items-center gap-2">
                          {canCopy ? (
                            <LinkButton tone="info" onClick={() => copyInviteLink(i.token)}>
                              {t.copyLink}
                            </LinkButton>
                          ) : null}

                          {canRevoke ? (
                            <LinkButton tone="danger" onClick={() => handleRevokeInvite(i.id)}>
                              {t.revoke}
                            </LinkButton>
                          ) : null}

                          {canDelete ? (
                            <LinkButton tone="danger" onClick={() => handleDeleteInvite(i.id)}>
                              {t.delete}
                            </LinkButton>
                          ) : null}

                          {!canCopy && !canRevoke && !canDelete ? (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">—</span>
                          ) : null}
                        </div>
                      }
                    />
                  );
                })}
              </ul>
            )}
          </Section>
        </Card>
      </section>

      {/* Miembros */}
      <section className="mt-4">
        <Card>
          <Section
            title={pageT.membersTitle}
            right={
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {pageT.invitationsCount(members.length)}
              </span>
            }
          >
            {loading ? (
              <EmptyState>{pageT.loadingMembers}</EmptyState>
            ) : members.length === 0 ? (
              <EmptyState>
                {isOfflineNow() && (familyCtx?.activeMembers ?? 0) > 0
                  ? pageT.emptyMembersOffline
                  : pageT.emptyMembers}
              </EmptyState>
            ) : (
              <ul className="space-y-2">
                {members.map((m) => {
                  const isMe = m.user_id === user.id;

                  const label =
                    m.full_name ||
                    m.invited_email ||
                    (m.user_id ? pageT.userFallback(m.user_id.slice(0, 8)) : t.member);

                  const canEditThis = isFamilyOwnerUI && !isMe && m.role !== "owner";

                  return (
                    <ListItem
                      key={m.id}
                      left={
                        <>
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {label}{" "}
                            {isMe ? (
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                ({t.you})
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {t.role}: {t.roleLabels[(m.role as "owner" | "admin" | "member") ?? "member"] ?? m.role} · {t.status}: {t.statusLabels[(m.status as keyof typeof t.statusLabels) ?? "active"] ?? m.status}
                          </div>
                          {m.created_at && (
                            <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                              {formatDateDisplay(m.created_at)}
                            </div>
                          )}
                        </>
                      }
                      right={
                        canEditThis ? (
                          <div className="flex flex-col items-end gap-2 md:flex-row md:items-center">
                            <Select
                              value={m.role === "admin" ? "admin" : "member"}
                              onChange={(e) =>
                                handleChangeRole(
                                  m.id,
                                  e.target.value === "admin" ? "admin" : "member"
                                )
                              }
                            >
                              <option value="member">{t.member}</option>
                              <option value="admin">{t.administrator}</option>
                            </Select>
                            <LinkButton tone="danger" onClick={() => handleRemoveMember(m.id)}>
                              {t.revoke}
                            </LinkButton>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">—</span>
                        )
                      }
                    />
                  );
                })}
              </ul>
            )}
          </Section>
        </Card>
      </section>

      {dataError && (
        <section className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          {dataError}
        </section>
      )}

      <section className="mt-4">
        <Card>
          <Section title={pageT.nextStepTitle} subtitle={pageT.nextStepSubtitle}>
            <div className="space-y-2 text-[12px] text-slate-600 dark:text-slate-300">
              {pageT.nextSteps.map((step, index) => (
                <p key={step}>
                  {index + 1}) <span className="font-semibold">{step}</span>
                </p>
              ))}
            </div>
          </Section>
        </Card>
      </section>
    </PageShell>
  );
}
