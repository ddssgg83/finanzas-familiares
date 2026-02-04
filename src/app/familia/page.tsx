"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";
import { PageShell } from "@/components/ui/PageShell";
import { formatDateDisplay } from "@/lib/format";
import { useFamilyContext, type FamilyContext } from "@/hooks/useFamilyContext";
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = typeof window !== "undefined" ? window : null;
  if (w?.crypto?.randomUUID) return w.crypto.randomUUID();
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
    if (
      typeof (parsed as any).familyId !== "string" ||
      typeof (parsed as any).familyName !== "string" ||
      typeof (parsed as any).ownerUserId !== "string"
    ) {
      return null;
    }
    return parsed as FamilyContext;
  } catch {
    return null;
  }
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
        message?: string | null; // ✅ NUEVO
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

// =========================================================
// Página
// =========================================================
export default function FamiliaPage() {
  // -------- AUTH --------
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // -------- FAMILY CTX --------
  const { familyCtx, familyLoading, familyError, isFamilyOwner, isUsingCachedFamily } =
    useFamilyContext(user);

  // ✅ NUEVO: familyId cacheado para evitar que effectiveFamilyId sea null offline
  const [cachedFamilyId, setCachedFamilyId] = useState<string | null>(null);

  // ✅ si el usuario crea familia OFFLINE, guardamos un id "optimista"
  const [optimisticFamilyId, setOptimisticFamilyId] = useState<string | null>(null);

  // ✅ ORDEN: (online ctx) -> (optimistic) -> (cached from LS)
  const effectiveFamilyId = familyCtx?.familyId ?? optimisticFamilyId ?? cachedFamilyId ?? null;

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
          setAuthError("Hubo un problema al cargar tu sesión.");
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
  }, []);

  // ✅ NUEVO: cuando ya conozcamos user, leemos familyId del cache inmediato (evita “0 miembros” offline)
  useEffect(() => {
    if (!user) {
      setCachedFamilyId(null);
      return;
    }
    const cached = readFamilyCtxCache(user.id);
    setCachedFamilyId(cached?.familyId ?? null);
  }, [user?.id]);

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
  // ✅ Cuando vuelve internet: mandamos la invitación por nuestro API (SMTP)
  // Nota: el API genera token real nuevo. Después hacemos reloadTick para refrescar lista real.

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
      inviterName: user.email ?? "Jefe de familia",
      message: op.payload.message ?? null, // ✅ NUEVO: mensaje offline->online
    }),
  });

  const json = await res.json().catch(() => ({}));

  // Si ya existe una invitación pendiente, lo tratamos como ok y seguimos
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

        const group = (groupRes.data ?? null) as FamilyGroupRow | null;
        const mems = (membersRes.data ?? []) as FamilyMemberRow[];
        const invs = (invitesRes.data ?? []) as FamilyInviteRow[];

        setFamilyGroup(group);
        setMembers(mems);
        setInvites(invs);

        writeCache(groupK, group);
        writeCache(membersK, mems);
        writeCache(invitesK, invs);

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
          setDataError("No se pudo cargar el módulo Familia. Intenta de nuevo más tarde.");
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

  // ✅ NUEVO: si offline y members todavía no están, usa familyCtx.activeMembers como fallback
  const activeMembers = useMemo(() => {
    if (!isOfflineNow()) return activeMembersFromList;
    if (activeMembersFromList > 0) return activeMembersFromList;
    return familyCtx?.activeMembers ?? 0;
  }, [activeMembersFromList, familyCtx]);

  const pendingInvites = useMemo(
    () => invites.filter((i) => i.status === "pending").length,
    [invites]
  );

  // =========================================================
  // Create Family
  // =========================================================
  const handleCreateFamily = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return alert("Tu sesión expiró. Vuelve a iniciar sesión.");
    if (!createFamilyForm.name.trim()) return alert("Ponle un nombre a tu familia.");
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
          full_name: user.email ?? "Owner",
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
          full_name: user.email ?? "Owner",
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
      alert("No se pudo crear la familia. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setSavingCreateFamily(false);
    }
  };

// =========================================================
// Invite (AHORA usa /api/family/invite -> SMTP A2)
// =========================================================
const handleInvite = async (e: FormEvent) => {
  e.preventDefault();
  if (!user) return alert("Tu sesión expiró. Vuelve a iniciar sesión.");

  const famId = effectiveFamilyId;
  if (!famId) return alert("Primero crea tu familia.");
  if (!isFamilyOwner) return alert("Sólo el jefe de familia puede invitar miembros.");

  const email = inviteForm.email.trim().toLowerCase();
  if (!email || !email.includes("@")) return alert("Escribe un email válido.");

  try {
    setSavingInvite(true);

    // ✅ OFFLINE: guardamos op y UI optimista (sin mandar correo)
    if (isOfflineNow()) {
      const localToken = safeUUID();
      const localInvite: FamilyInviteRow = {
        id: `local_${localToken}`,
        family_id: famId,
        email,
        role: inviteForm.role === "admin" ? "admin" : "member",
        status: "pending",
        invited_by: user.id,
        token: localToken,
        created_at: new Date().toISOString(),
      };

      setInvites((prev) => [localInvite, ...prev]);

      const ops = readOps(user.id);
      const nextOps: OfflineOp[] = [
        ...ops,
        {
          kind: "invite",
          id: safeUUID(),
          payload: {
            family_id: famId,
            email,
            role: inviteForm.role === "admin" ? "admin" : "member",
            token: localToken,
          },
        },
      ];
      writeOps(user.id, nextOps);
      setPendingOpsCount(nextOps.length);

      alert("Invitación guardada ✅ (se enviará cuando vuelva el internet).");
      setInviteForm({ email: "", role: "member", message: "" });
      return;
    }

    // ✅ ONLINE: llamar a nuestro API (SMTP)
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
        inviterName: user.email ?? "Un familiar",
        message: inviteForm.message || null,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || json?.ok !== true) {
      throw new Error(json?.error || "No se pudo enviar la invitación.");
    }

    // ✅ Si quieres UI inmediata: creamos un row “optimista” con token devuelto
    const optimistic: FamilyInviteRow = {
      id: json.token || safeUUID(),
      family_id: famId,
      email,
      role: inviteForm.role === "admin" ? "admin" : "member",
      status: "pending",
      invited_by: user.id,
      token: json.token ?? null,
      created_at: new Date().toISOString(),
    };
    setInvites((prev) => [optimistic, ...prev]);

    if (json.email_sent) {
      alert("Invitación enviada ✅");
    } else {
      alert("Invitación creada ✅ (pero el correo falló). Usa 'Copiar link' por ahora.");
      console.warn("SMTP error:", json.email_error);
    }

    setInviteForm({ email: "", role: "member", message: "" });
    setReloadTick((n) => n + 1);
  } catch (err: any) {
    console.error("Error invitando:", err);
    alert(err?.message ?? "No se pudo enviar la invitación.");
  } finally {
    setSavingInvite(false);
  }
};

// =========================================================
// Members actions
// =========================================================
const handleRemoveMember = async (memberId: string) => {
  if (!user) return;
  if (!isFamilyOwner) return alert("Sólo el jefe de familia puede remover miembros.");
  if (!window.confirm("¿Remover miembro de la familia?")) return;

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
    alert("No se pudo remover el miembro.");
  }
};

const handleChangeRole = async (memberId: string, role: "admin" | "member") => {
  if (!user) return;
  if (!isFamilyOwner) return;

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
    alert("No se pudo cambiar el rol.");
  }
};
// =========================================================
// Invite actions
// =========================================================
const handleRevokeInvite = async (inviteId: string) => {
  if (!user) return;
  if (!isFamilyOwner) return;
  if (!window.confirm("¿Revocar invitación?")) return;

  // UI optimista
  setInvites((prev) =>
    prev.map((i) => (i.id === inviteId ? { ...i, status: "revoked" } : i))
  );

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
    alert("No se pudo revocar la invitación.");
  }
};
// =========================================================
// Render AUTH
// =========================================================
if (authLoading) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-sm text-slate-600 dark:text-slate-300">
      Cargando sesión...
    </div>
  );
}

if (!user) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-sm text-slate-600 dark:text-slate-300">
      Necesitas iniciar sesión para ver y gestionar tu familia.
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
      title="Familia"
      subtitle="Invita miembros, define roles y mantén control del dashboard familiar."
      activeTab="familia"
      userEmail={user.email ?? ""}
      userId={user.id}
      onSignOut={handleSignOut}
    />

    {(isOfflineNow() || pendingOpsCount > 0 || showSnapshotBadge) && (
      <section className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200">
        {isOfflineNow() ? (
          <div className="space-y-1">
            <div>
              Estás en <span className="font-semibold">modo offline</span>. Puedes invitar/remover/cambiar roles y se sincroniza al volver el internet.
            </div>
            {showSnapshotBadge && (
              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                Mostrando <span className="font-semibold">último estado guardado</span>.
              </div>
            )}
          </div>
        ) : pendingOpsCount > 0 ? (
          <div>
            Sincronizando… Cambios pendientes: <span className="font-semibold">{pendingOpsCount}</span>
          </div>
        ) : null}
      </section>
    )}

    {/* Resumen */}
    <section className="space-y-4">
      <Card>
        <Section
          title="Resumen"
          subtitle="Tu grupo familiar y su estado."
          right={
            familyCtx || familyGroup ? (
              <div className="text-right text-[11px] text-slate-500 dark:text-slate-400">
                Familia:{" "}
                <span className="font-semibold">
                  {familyCtx?.familyName ?? familyGroup?.name ?? "Mi familia"}
                </span>{" "}
                ·{" "}
                {isFamilyOwner ? (
                  <span className="font-semibold">Jefe de familia</span>
                ) : (
                  <span className="font-semibold">Miembro</span>
                )}
              </div>
            ) : (
              <div className="text-right text-[11px] text-slate-500 dark:text-slate-400">
                Aún no tienes familia configurada.
              </div>
            )
          }
        >
          {familyLoading && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Actualizando información de familia…
            </div>
          )}
          {familyError && <p className="mt-2 text-[11px] text-rose-500">{familyError}</p>}
        </Section>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Miembros activos"
          value={String(activeMembers)}
          hint="Personas que cuentan en el dashboard familiar."
          tone="good"
        />
        <StatCard
          label="Invitaciones pendientes"
          value={String(pendingInvites)}
          hint="Invitaciones enviadas que aún no aceptan."
          tone="neutral"
        />
        <StatCard
          label="Tu rol"
          value={isFamilyOwner ? "Owner" : "Member"}
          hint={
            isFamilyOwner
              ? "Controlas invitaciones y roles."
              : "Tu jefe de familia controla invitaciones y roles."
          }
          tone={isFamilyOwner ? "good" : "neutral"}
        />
      </div>
    </section>

    {/* Crear familia (si no existe) */}
    {!familyCtx && !familyGroup && (
      <section className="mt-4">
        <Card>
          <Section
            title="Crear familia"
            subtitle="Crea tu grupo familiar para invitar miembros y habilitar el Dashboard familiar."
          >
            <form onSubmit={handleCreateFamily} className="mt-2 space-y-3">
              <div>
                <Label>Nombre de la familia</Label>
                <Input
                  value={createFamilyForm.name}
                  onChange={(e) => setCreateFamilyForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ej. Familia Sloane"
                  required
                />
              </div>

              <div>
                <Label>Notas (opcional)</Label>
                <Textarea
                  value={createFamilyForm.notes}
                  onChange={(e) => setCreateFamilyForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Ej. Reglas internas, propósito, etc."
                />
                <Help>
                  Estas notas son solo informativas (si luego quieres guardarlas en BD, lo conectamos).
                </Help>
              </div>

              <Button type="submit" disabled={savingCreateFamily}>
                {savingCreateFamily ? "Creando..." : "Crear familia"}
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
          title="Invitar miembro"
          subtitle={
            isFamilyOwner
              ? "Invita por email y define el rol."
              : "Sólo el jefe de familia puede invitar miembros."
          }
          right={
            !isFamilyOwner ? (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Acción restringida
              </span>
            ) : null
          }
        >
          <form onSubmit={handleInvite} className="mt-2 space-y-3">
            <div>
              <Label>Email</Label>
              <Input
                value={inviteForm.email}
                onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="ej. familiar@email.com"
                disabled={!isFamilyOwner}
                required
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Rol</Label>
                <Select
                  value={inviteForm.role}
                  onChange={(e) =>
                    setInviteForm((p) => ({
                      ...p,
                      role: e.target.value === "admin" ? "admin" : "member",
                    }))
                  }
                  disabled={!isFamilyOwner}
                >
                  <option value="member">Miembro</option>
                  <option value="admin">Admin</option>
                </Select>
                <Help>
                  Admin: puede ver/gestionar más pantallas (si lo habilitas). Por ahora Owner controla todo.
                </Help>
              </div>

              <div>
                <Label>Mensaje (opcional)</Label>
                <Input
                  value={inviteForm.message}
                  onChange={(e) => setInviteForm((p) => ({ ...p, message: e.target.value }))}
                  placeholder="Ej. Te agrego a la familia…"
                  disabled={!isFamilyOwner}
                />
              </div>
            </div>

            <Button type="submit" disabled={!isFamilyOwner || savingInvite || !effectiveFamilyId}>
              {savingInvite ? "Enviando..." : "Enviar invitación"}
            </Button>

            {!effectiveFamilyId && <Help>Primero crea tu familia para poder invitar miembros.</Help>}
          </form>
        </Section>
      </Card>

     <Card>
  <Section
    title="Invitaciones"
    right={
      <span className="text-[11px] text-slate-500 dark:text-slate-400">
        {invites.length} total
      </span>
    }
  >
    {loading ? (
      <EmptyState>Cargando invitaciones...</EmptyState>
    ) : invites.length === 0 ? (
      <EmptyState>Aún no tienes invitaciones.</EmptyState>
    ) : (
      <ul className="space-y-2">
        {invites.map((i) => {
          const canRevoke = isFamilyOwner && i.status === "pending";

          const inviteLink =
            typeof window !== "undefined"
              ? `${window.location.origin}/familia/aceptar?token=${i.token}`
              : `/familia/aceptar?token=${i.token}`;

          return (
            <ListItem
              key={i.id}
              left={
                <>
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {i.email}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Rol: {i.role.toUpperCase()} · Estado: {i.status}
                  </div>
                  {i.created_at && (
                    <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                      {formatDateDisplay(i.created_at)}
                    </div>
                  )}
                </>
              }
              right={
                canRevoke ? (
  <div className="flex items-center gap-2">
    <LinkButton
      tone="info"
      onClick={async () => {
        try {
          if (!i.token) {
            alert("Esta invitación no tiene token.");
            return;
          }

          await navigator.clipboard.writeText(inviteLink);
          alert("Link copiado ✅");
        } catch (err) {
          console.error("Error copiando link:", err);
          alert("No se pudo copiar el link.");
        }
      }}
    >
      Copiar link
    </LinkButton>

    <LinkButton tone="danger" onClick={() => handleRevokeInvite(i.id)}>
      Revocar
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


      {/* Miembros */}
      <section className="mt-4">
        <Card>
          <Section
            title="Miembros"
            right={
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {members.length} total
              </span>
            }
          >
            {loading ? (
              <EmptyState>Cargando miembros...</EmptyState>
            ) : members.length === 0 ? (
              <EmptyState>
                {isOfflineNow() && (familyCtx?.activeMembers ?? 0) > 0
                  ? "No pude leer la lista completa sin internet, pero tu familia existe (snapshot guardado)."
                  : "No hay miembros cargados todavía (o aún no existe la familia)."}
              </EmptyState>
            ) : (
              <ul className="space-y-2">
                {members.map((m) => {
                  const isMe = m.user_id === user.id;

                  const label =
                    m.full_name ||
                    m.invited_email ||
                    (m.user_id ? `Usuario ${m.user_id.slice(0, 8)}` : "Miembro");

                  const canEditThis = isFamilyOwner && !isMe && m.role !== "owner";

                  return (
                    <ListItem
                      key={m.id}
                      left={
                        <>
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {label}{" "}
                            {isMe ? (
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">(Tú)</span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            Rol: {m.role.toUpperCase()} · Estado: {m.status}
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
                                handleChangeRole(m.id, e.target.value === "admin" ? "admin" : "member")
                              }
                            >
                              <option value="member">Miembro</option>
                              <option value="admin">Admin</option>
                            </Select>
                            <LinkButton tone="danger" onClick={() => handleRemoveMember(m.id)}>
                              Remover
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
          <Section title="Siguiente paso" subtitle="Para completar el módulo Familia al 100%">
            <div className="space-y-2 text-[12px] text-slate-600 dark:text-slate-300">
              <p>
                1) <span className="font-semibold">Aceptar invitación</span>: creamos pantalla/flujo con token para que el invitado se una a la familia.
              </p>
              <p>
                2) <span className="font-semibold">Tarjetas compartidas</span>: tabla puente (ej.{" "}
                <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">card_members</code>) para asignar tarjetas a miembros.
              </p>
              <p>
                3) <span className="font-semibold">Permisos/RLS</span>: asegurar que sólo owner/admin vean lo familiar y cada quien lo personal.
              </p>
              <Help>
                Si ya tienes nombres exactos de tablas/columnas en Supabase, te lo ajusto 1:1 para que quede perfecto.
              </Help>
            </div>
          </Section>
        </Card>
      </section>
    </PageShell>
  );
}
