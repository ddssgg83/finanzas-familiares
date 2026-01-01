// src/lib/offline.ts
import { supabase } from "@/lib/supabase";

export type OfflineTx = {
  id: string;
  date: string;
  type: "ingreso" | "gasto";
  category: string;
  amount: number;
  method: string;
  notes?: string | null;

  // 👇 IMPORTANTES para filtrar por usuario
  user_id: string;

  owner_user_id?: string | null;
  spender_user_id?: string | null;
  spender_label?: string | null;
  created_by?: string | null;
  card_id?: string | null;
  family_group_id?: string | null;
  goal_id?: string | null;

  created_at?: string | null;
};

const KEY = "ff-offline-txs-v1";

function readLocal(): OfflineTx[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as OfflineTx[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: OfflineTx[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

export async function saveOfflineTx(tx: Omit<OfflineTx, "user_id"> & { user_id?: string }) {
  // ✅ si por accidente te mandan tx sin user_id, no la guardamos “huérfana”
  const userId = tx.user_id;
  if (!userId) throw new Error("saveOfflineTx: falta user_id");

  const prev = readLocal();
  const normalized: OfflineTx = {
    ...tx,
    user_id: userId,
    notes: tx.notes ?? null,
  };

  const next = [normalized, ...prev.filter((p) => p.id !== normalized.id)];
  writeLocal(next);
}

export async function getOfflineTxs(userId: string): Promise<OfflineTx[]> {
  const all = readLocal();
  return all.filter((t) => t.user_id === userId);
}

export async function syncOfflineTxs(userId: string) {
  if (typeof window === "undefined") return [];
  if (!navigator.onLine) return [];

  const pending = await getOfflineTxs(userId);
  if (!pending.length) return [];

  // ✅ si aún no hay sesión, no intentes sync
  let sessionData: any = null;
  try {
    sessionData = await supabase.auth.getSession();
  } catch {
    return [];
  }
  if (!sessionData?.data?.session) return [];

  // ✅ payload SOLO de las pendientes (no de “todas”)
  const payload = pending.map((t) => ({
    id: t.id,
    date: t.date,
    type: t.type,
    category: t.category,
    amount: t.amount,
    method: t.method,
    notes: t.notes ?? null,

    user_id: userId,
    owner_user_id: t.owner_user_id ?? userId,
    spender_user_id: t.spender_user_id ?? userId,
    created_by: t.created_by ?? userId,

    spender_label: t.spender_label ?? "Yo",
    card_id: t.card_id ?? null,
    family_group_id: t.family_group_id ?? null,
    goal_id: t.goal_id ?? null,
  }));

  const { data, error } = await supabase
    .from("transactions")
    .upsert(payload, { onConflict: "id" })
    .select("id");

  if (error) {
    console.error("syncOfflineTxs error:", {
      message: (error as any)?.message,
      details: (error as any)?.details,
      hint: (error as any)?.hint,
      code: (error as any)?.code,
      raw: error,
    });
    throw error;
  }

  const syncedIds = new Set((data ?? []).map((r: any) => r.id));

  // ✅ borra SOLO las que sí se sincronizaron y SOLO de este user
  const all = readLocal();
  const remaining = all.filter((t) => !(t.user_id === userId && syncedIds.has(t.id)));
  writeLocal(remaining);

  return data ?? [];
}

export async function clearOfflineTxs(userId?: string) {
  if (!userId) {
    writeLocal([]);
    return;
  }
  const all = readLocal();
  writeLocal(all.filter((t) => t.user_id !== userId));
}
