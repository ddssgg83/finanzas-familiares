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

  owner_user_id?: string | null;
  spender_user_id?: string | null;
  spender_label?: string | null;
  created_by?: string | null;
  card_id?: string | null;
  family_group_id?: string | null;
  goal_id?: string | null;
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

export async function saveOfflineTx(tx: OfflineTx) {
  const prev = readLocal();
  const next = [tx, ...prev.filter((p) => p.id !== tx.id)];
  writeLocal(next);
}

export async function getOfflineTxs(): Promise<OfflineTx[]> {
  return readLocal();
}

export async function syncOfflineTxs(userId: string) {
  // ✅ si no hay window o no hay internet: NO intentes supabase
  if (typeof window === "undefined") return [];
  if (!navigator.onLine) return [];

  const offline = readLocal();
  if (!offline.length) return [];

  // ✅ Si aún no hay sesión (o falla la red en el intento), no sincronices
  let sessionData: any = null;
  try {
    sessionData = await supabase.auth.getSession();
  } catch (e) {
    // típico tras hard refresh/recuperación de sesión
    return [];
  }
  if (!sessionData?.data?.session) {
    return [];
  }

  const payload = offline.map((t) => ({
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
    // ✅ log útil
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
  const remaining = offline.filter((t) => !syncedIds.has(t.id));
  writeLocal(remaining);

  return data ?? [];
}

export async function clearOfflineTxs() {
  writeLocal([]);
}
