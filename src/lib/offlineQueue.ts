import { supabase } from "@/lib/supabase";

/**
 * Offline Queue para Patrimonio (assets/debts)
 * Guarda ops en localStorage y las sincroniza cuando vuelve el internet.
 */

type AssetRow = {
  id: string;
  user_id?: string | null;
  family_id?: string | null;
  name: string;
  category: string | null;
  current_value: number | null;
  owner: string | null;
  notes: string | null;
};

type DebtRow = {
  id: string;
  user_id?: string | null;
  family_id?: string | null;
  name: string;
  type: string;
  total_amount: number;
  current_balance: number | null;
  notes: string | null;
};

export type OfflineOp =
  | {
      kind: "asset_upsert";
      id: string;
      payload: AssetRow;
    }
  | {
      kind: "asset_delete";
      id: string;
      payload: { id: string };
    }
  | {
      kind: "debt_upsert";
      id: string;
      payload: DebtRow;
    }
  | {
      kind: "debt_delete";
      id: string;
      payload: { id: string };
    };

function opsKey(userId: string) {
  return `ff-patrimonio-ops-v1:${userId}`;
}

export function getPendingOfflineOps(userId: string): OfflineOp[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(opsKey(userId));
    if (!raw) return [];
    return JSON.parse(raw) as OfflineOp[];
  } catch {
    return [];
  }
}

export function getPendingOfflineOpsCount(userId: string) {
  return getPendingOfflineOps(userId).length;
}

export function setPendingOfflineOps(userId: string, ops: OfflineOp[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(opsKey(userId), JSON.stringify(ops));
  } catch {
    // ignore
  }
}

/**
 * Sincroniza ops pendientes de Patrimonio (assets/debts).
 * - Si algo falla, se queda en cola para reintentar.
 * - Si todo OK, se elimina de la cola.
 */
export async function syncOfflineOps(userId: string) {
  if (!userId) return { ok: true, synced: 0, remaining: 0 };
  if (typeof window !== "undefined" && !navigator.onLine) {
    const remaining = getPendingOfflineOpsCount(userId);
    return { ok: true, synced: 0, remaining };
  }

  const ops = getPendingOfflineOps(userId);
  if (ops.length === 0) return { ok: true, synced: 0, remaining: 0 };

  const remaining: OfflineOp[] = [];
  let synced = 0;

  for (const op of ops) {
    try {
      if (op.kind === "asset_upsert") {
        const a = op.payload;
        const { error } = await supabase.from("assets").upsert(
          [
            {
              id: a.id,
              user_id: a.user_id ?? userId,
              family_id: a.family_id ?? null,
              name: a.name,
              category: a.category ?? null,
              current_value: a.current_value ?? 0,
              owner: a.owner ?? null,
              notes: a.notes ?? null,
            },
          ],
          { onConflict: "id" }
        );
        if (error) throw error;
      }

      if (op.kind === "asset_delete") {
        const { error } = await supabase.from("assets").delete().eq("id", op.payload.id);
        if (error) throw error;
      }

      if (op.kind === "debt_upsert") {
        const d = op.payload;
        const { error } = await supabase.from("debts").upsert(
          [
            {
              id: d.id,
              user_id: d.user_id ?? userId,
              family_id: d.family_id ?? null,
              name: d.name,
              type: d.type,
              total_amount: d.total_amount ?? 0,
              current_balance: d.current_balance ?? null,
              notes: d.notes ?? null,
            },
          ],
          { onConflict: "id" }
        );
        if (error) throw error;
      }

      if (op.kind === "debt_delete") {
        const { error } = await supabase.from("debts").delete().eq("id", op.payload.id);
        if (error) throw error;
      }

      synced += 1;
    } catch {
      // reintentar después
      remaining.push(op);
    }
  }

  setPendingOfflineOps(userId, remaining);
  return { ok: true, synced, remaining: remaining.length };
}
