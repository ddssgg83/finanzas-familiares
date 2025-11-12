export type PendingTx = {
  id: string;             // id local
  date: string;
  type: 'gasto' | 'ingreso';
  category: string;
  amount: number;
  method: string;
  notes?: string;
  createdAt: number;      // timestamp para ordenar
};

const KEY = 'pending-transactions';

function readAll(): PendingTx[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as PendingTx[] : [];
  } catch {
    return [];
  }
}

function writeAll(list: PendingTx[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function savePending(tx: Omit<PendingTx, 'id'|'createdAt'>) {
  const list = readAll();
  const item: PendingTx = {
    ...tx,
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    createdAt: Date.now(),
  };
  list.push(item);
  writeAll(list);
  return item.id;
}

export function getPending(): PendingTx[] {
  return readAll().sort((a, b) => a.createdAt - b.createdAt);
}

export function clearPending() {
  writeAll([]);
}

export async function flushPending(insertFn: (tx: PendingTx) => Promise<void>) {
  const list = getPending();
  if (!list.length) return;
  const remaining: PendingTx[] = [];
  for (const tx of list) {
    try {
      await insertFn(tx);
      // ok, no lo volvemos a guardar
    } catch {
      // si falla seguimos dejando el item en la cola
      remaining.push(tx);
    }
  }
  writeAll(remaining);
}
