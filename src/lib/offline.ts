// src/lib/offline.ts
import { supabase } from "./supabase";

export type TxType = "ingreso" | "gasto";

export type OfflineTx = {
  id: string;
  date: string; // yyyy-mm-dd
  type: TxType;
  category: string;
  amount: number;
  method: string;
  notes: string | null;
};

const STORAGE_KEY = "ff-offline-txs-v1";

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

async function readAll(): Promise<OfflineTx[]> {
  if (!isBrowser()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((t: any) => ({
      id:
        t.id ??
        (typeof crypto !== "undefined"
          ? crypto.randomUUID()
          : String(Date.now())),
      date: String(t.date),
      type: t.type === "ingreso" ? "ingreso" : "gasto",
      category: String(t.category ?? "OTROS"),
      amount: Number(t.amount) || 0,
      method: String(t.method ?? "EFECTIVO"),
      notes: t.notes ?? null,
    }));
  } catch (err) {
    console.error("Error leyendo transacciones offline:", err);
    return [];
  }
}

// 🔹 Guarda una transacción offline
export async function saveOfflineTx(tx: OfflineTx): Promise<void> {
  if (!isBrowser()) return;

  try {
    const list = await readAll();
    list.push(tx);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("Error guardando transacción offline:", err);
  }
}

// 🔹 Devuelve TODAS las transacciones offline
export async function getOfflineTxs(): Promise<OfflineTx[]> {
  return readAll();
}

// 🔹 Manda todo a Supabase y limpia el storage.
//    IMPORTANTE: ahora regresa un ARREGLO con los movimientos insertados.
export async function syncOfflineTxs(
  userId: string
): Promise<OfflineTx[]> {
  const list = await readAll();
  if (!list.length) return [];

  const payload = list.map((t) => ({
    id: t.id,
    user_id: userId, // 👈 muy importante para las RLS
    date: t.date,
    type: t.type,
    category: t.category,
    amount: t.amount,
    method: t.method,
    notes: t.notes,
  }));

  const { data, error } = await supabase
    .from("transactions")
    .insert(payload)
    .select("*");

  if (error) {
    console.error("Error sincronizando transacciones offline:", error);
    throw error;
  }

  if (isBrowser()) {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  // devolvemos los registros realmente insertados
  return (data ?? []).map((t: any) => ({
    id: t.id,
    date: t.date,
    type: t.type,
    category: t.category,
    amount: Number(t.amount),
    method: t.method,
    notes: t.notes ?? null,
  }));
}
