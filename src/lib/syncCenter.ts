"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getOfflineTxs, syncOfflineTxs } from "@/lib/offline";
import { getPendingOfflineOpsCount, syncOfflineOps } from "@/lib/offlineQueue";

type SyncState = {
  isOnline: boolean;
  userId: string | null;

  // Gastos (transactions offline)
  pendingTx: number;

  // Patrimonio (assets/debts ops offline)
  pendingOps: number;

  // Familia (roles/invitaciones/familia ops offline)
  pendingFamilyOps: number;

  isSyncing: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
};

function getOnline(): boolean {
  if (typeof window === "undefined") return true;
  return navigator.onLine;
}

function getPendingFamilyOpsCount(userId: string) {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(`ff-familia-ops-v1:${userId}`);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function useSyncCenter() {
  const [state, setState] = useState<SyncState>({
    isOnline: getOnline(),
    userId: null,
    pendingTx: 0,
    pendingOps: 0,
    pendingFamilyOps: 0,
    isSyncing: false,
    lastSyncAt: null,
    lastError: null,
  });

  // =========================================================
  // USER
  // =========================================================
  useEffect(() => {
    let alive = true;

    async function loadUser() {
      try {
        const { data } = await supabase.auth.getSession();
        const uid = data.session?.user?.id ?? null;
        if (!alive) return;
        setState((s) => ({ ...s, userId: uid }));
      } catch {
        // ignore
      }
    }

    loadUser();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      setState((s) => ({ ...s, userId: uid }));
    });

    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // =========================================================
  // ONLINE/OFFLINE LISTENERS
  // =========================================================
  useEffect(() => {
    const onOnline = () => setState((s) => ({ ...s, isOnline: true }));
    const onOffline = () => setState((s) => ({ ...s, isOnline: false }));

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // =========================================================
  // PENDING COUNTS (async)
  // =========================================================
  useEffect(() => {
    let alive = true;

    async function refreshCounts() {
      if (!state.userId) {
        if (!alive) return;
        setState((s) => ({ ...s, pendingTx: 0, pendingOps: 0, pendingFamilyOps: 0 }));
        return;
      }

      try {
        // ✅ getOfflineTxs ahora es async y pide userId
        const txs = await getOfflineTxs(state.userId);
        const pendingTx = txs?.length ?? 0;

        // ✅ ops de patrimonio
        const pendingOps = getPendingOfflineOpsCount(state.userId);
        const pendingFamilyOps = getPendingFamilyOpsCount(state.userId);

        if (!alive) return;
        setState((s) => ({ ...s, pendingTx, pendingOps, pendingFamilyOps }));
      } catch {
        if (!alive) return;
        // en caso de error, no tronar UI
        const pendingOps = getPendingOfflineOpsCount(state.userId);
        const pendingFamilyOps = getPendingFamilyOpsCount(state.userId);
        setState((s) => ({ ...s, pendingTx: 0, pendingOps, pendingFamilyOps }));
      }
    }

    refreshCounts();

    return () => {
      alive = false;
    };
  }, [state.userId, state.isOnline, state.lastSyncAt]);

  // =========================================================
  // SYNC NOW
  // =========================================================
  const syncNow = async () => {
    const userId = state.userId;
    if (!userId) return; // ✅ evita string|null
    if (!getOnline()) return;

    setState((s) => ({ ...s, isSyncing: true, lastError: null }));

    try {
      // 1) sync gastos offline tx (pide userId)
      await syncOfflineTxs(userId);

      // 2) sync patrimonio/familia offline ops
      await syncOfflineOps(userId);

      setState((s) => ({
        ...s,
        isSyncing: false,
        lastSyncAt: Date.now(),
      }));
    } catch (err: any) {
      setState((s) => ({
        ...s,
        isSyncing: false,
        lastError: err?.message ?? "Error al sincronizar",
      }));
    }
  };

  // Auto-sync al volver online
  useEffect(() => {
    if (!state.isOnline) return;
    if (!state.userId) return;
    syncNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isOnline, state.userId]);

  const summary = useMemo(() => {
    const pendingSyncable = (state.pendingTx ?? 0) + (state.pendingOps ?? 0);
    const pendingTotal = pendingSyncable + (state.pendingFamilyOps ?? 0);
    return {
      pendingTotal,
      pendingSyncable,
      canSync: state.isOnline && !!state.userId && pendingSyncable > 0,
      details: {
        gastos: state.pendingTx ?? 0,
        patrimonio: state.pendingOps ?? 0,
        familia: state.pendingFamilyOps ?? 0,
      },
    };
  }, [state.isOnline, state.userId, state.pendingTx, state.pendingOps, state.pendingFamilyOps]);

  return { state, summary, syncNow };
}
