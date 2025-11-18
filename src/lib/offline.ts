// src/lib/offline.ts

export type OfflineTx = {
  id: string;
  date: string; // YYYY-MM-DD
  type: "gasto" | "ingreso";
  category: string;
  amount: number;
  method: string;
  notes?: string | null;
};

const DB_NAME = "finanzas-familiares-db";
const STORE_NAME = "offline_transactions";
const DB_VERSION = 1;

// Abre (o crea) la base de datos de IndexedDB
function openDB(): Promise<IDBDatabase | null> {
  // En el servidor (build de Next) no existe indexedDB
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      console.error("Error abriendo IndexedDB", request.error);
      reject(request.error);
    };
  });
}

// Guarda / actualiza un movimiento offline
export async function saveOfflineTx(tx: OfflineTx): Promise<void> {
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.put(tx);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      console.error("Error guardando movimiento offline", transaction.error);
      reject(transaction.error);
    };
  });
}

// Obtiene todos los movimientos offline guardados
export async function getOfflineTxs(): Promise<OfflineTx[]> {
  const db = await openDB();
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve((request.result || []) as OfflineTx[]);
    };

    request.onerror = () => {
      console.error("Error leyendo movimientos offline", request.error);
      reject(request.error);
    };
  });
}

// (Opcional) Limpiar todos los movimientos offline
export async function clearOfflineTxs(): Promise<void> {
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.error("Error limpiando movimientos offline", request.error);
      reject(request.error);
    };
  });
}
