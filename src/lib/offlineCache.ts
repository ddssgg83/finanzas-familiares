// src/lib/offlineCache.ts
export function cacheSet<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify({ v: value, ts: Date.now() }));
  } catch {}
}

export function cacheGet<T>(key: string): { v: T; ts: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as { v: T; ts: number };
  } catch {
    return null;
  }
}
