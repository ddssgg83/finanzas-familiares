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

// 🔹 Devuelve todas las transacciones offline
export async function getOfflineTxs(): Promise<OfflineTx[]> {
  return readAll();
}

// 🔹 Sincroniza con Supabase y regresa las transacciones insertadas.
//    Limpia el storage SOLO si todo salió bien.
export async function syncOfflineTxs(): Promise<OfflineTx[]> {
  const list = await readAll();
  if (!list.length) return [];

  const { data, error } = await supabase
    .from("transactions")
    .insert(
      list.map((t) => ({
        id: t.id,
        date: t.date,
        type: t.type,
        category: t.category,
        amount: t.amount,
        method: t.method,
        notes: t.notes,
      }))
    )
    .select("*");

  if (error) {
    console.error("Error sincronizando transacciones offline:", error);
    // NO borramos localStorage si falla
    return [];
  }

  if (isBrowser()) {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  // Normalizamos lo que regresa Supabase
  return (data ?? []).map((t: any) => ({
    id: t.id,
    date: String(t.date),
    type: t.type === "ingreso" ? "ingreso" : "gasto",
    category: String(t.category ?? "OTROS"),
    amount: Number(t.amount) || 0,
    method: String(t.method ?? "EFECTIVO"),
    notes: t.notes ?? null,
  }));
}
