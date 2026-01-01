"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";
import { PageShell } from "@/components/ui/PageShell";
import { formatDateDisplay, formatMoney as fmtMoney, toNumberSafe } from "@/lib/format";
import { useFamilyContext } from "@/hooks/useFamilyContext";
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
  SegmentedControl,
  Select,
  StatCard,
  Textarea,
} from "@/components/ui/kit";

export const dynamic = "force-dynamic";

// =========================================================
// Tipos
// =========================================================
type Asset = {
  id: string;
  name: string;
  category: string | null;
  current_value: number | null;
  owner: string | null;
  notes: string | null;
  created_at?: string;
  user_id?: string | null;
  family_id?: string | null;
};

type Debt = {
  id: string;
  name: string;
  type: string;
  total_amount: number;
  current_balance: number | null;
  notes: string | null;
  created_at?: string;
  user_id?: string | null;
  family_id?: string | null;
};

type TxRow = {
  id: string;
  date: string;
  type: "ingreso" | "gasto";
  amount: number;
  family_group_id?: string | null;
  user_id?: string | null;
  owner_user_id?: string | null;
  spender_user_id?: string | null;
};

type AssetForm = {
  name: string;
  category: string;
  current_value: string;
  owner: string;
  notes: string;
};

type DebtForm = {
  name: string;
  type: string;
  total_amount: string;
  current_balance: string;
  notes: string;
};

type ViewScope = "personal" | "family";

// =========================================================
// Constantes
// =========================================================
const ASSET_CATEGORIES = [
  "Cuenta bancaria",
  "Inversión",
  "Casa / Departamento",
  "Terreno",
  "Automóvil",
  "Negocio",
  "Ahorro niños",
  "Otro",
];

const DEBT_TYPES = [
  "Tarjeta de crédito",
  "Crédito hipotecario",
  "Crédito automotriz",
  "Préstamo personal",
  "Préstamo familiar",
  "Crédito negocio",
  "Otro",
];

function getCurrentMonthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getMonthRange(monthKey: string) {
  const [yearStr, monthStr] = monthKey.split("-");
  const y = Number(yearStr);
  const m = Number(monthStr);
  const from = `${monthKey}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

// =========================================================
// OFFLINE helpers (cache + cola de sync) — Patrimonio
// =========================================================
function isOfflineNow() {
  if (typeof window === "undefined") return false;
  return !navigator.onLine;
}

function cacheKey(base: string, scope: { userId: string; familyId?: string | null; view: "personal" | "family" }) {
  const fam = scope.view === "family" && scope.familyId ? `fam:${scope.familyId}` : "personal";
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

function safeUUID() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = typeof window !== "undefined" ? window : null;
  if (w?.crypto?.randomUUID) return w.crypto.randomUUID();
  return `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

type OfflineOp =
  | {
      kind: "asset_upsert";
      id: string;
      payload: Omit<Asset, "created_at"> & { created_at?: string };
    }
  | {
      kind: "asset_delete";
      id: string;
      payload: { id: string; family_id?: string | null; user_id?: string | null };
    }
  | {
      kind: "debt_upsert";
      id: string;
      payload: Omit<Debt, "created_at"> & { created_at?: string };
    }
  | {
      kind: "debt_delete";
      id: string;
      payload: { id: string; family_id?: string | null; user_id?: string | null };
    };

function opsKey(userId: string) {
  return `ff-patrimonio-ops-v1:${userId}`;
}

function readOps(userId: string): OfflineOp[] {
  return readCache<OfflineOp[]>(opsKey(userId), []);
}

function writeOps(userId: string, ops: OfflineOp[]) {
  writeCache(opsKey(userId), ops);
}

function applyOpsToState(baseAssets: Asset[], baseDebts: Debt[], ops: OfflineOp[]) {
  let assets = [...baseAssets];
  let debts = [...baseDebts];

  for (const op of ops) {
    if (op.kind === "asset_upsert") {
      const next = op.payload as Asset;
      const idx = assets.findIndex((a) => a.id === next.id);
      if (idx >= 0) assets[idx] = { ...assets[idx], ...next };
      else assets = [next, ...assets];
    }
    if (op.kind === "asset_delete") {
      assets = assets.filter((a) => a.id !== op.payload.id);
    }
    if (op.kind === "debt_upsert") {
      const next = op.payload as Debt;
      const idx = debts.findIndex((d) => d.id === next.id);
      if (idx >= 0) debts[idx] = { ...debts[idx], ...next };
      else debts = [next, ...debts];
    }
    if (op.kind === "debt_delete") {
      debts = debts.filter((d) => d.id !== op.payload.id);
    }
  }

  return { assets, debts };
}

export default function PatrimonioPage() {
  const formatMoney = (n: number) => fmtMoney(n, "MXN");

  // -------- AUTH --------
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // -------- FAMILY --------
  const { familyCtx, familyLoading, familyError, isFamilyOwner } = useFamilyContext(user);

  // Vista: sólo yo vs familia (para jefes de familia)
  const [viewScope, setViewScope] = useState<ViewScope>("personal");
  const effectiveScope: ViewScope = familyCtx && isFamilyOwner ? viewScope : "personal";
  const isFamilyView = effectiveScope === "family";

  // -------- DATA --------
  const [assets, setAssets] = useState<Asset[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // ✅ Conexión Gastos → Patrimonio: flujo del mes
  const [month, setMonth] = useState<string>(() => getCurrentMonthKey());
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [monthIngresos, setMonthIngresos] = useState(0);
  const [monthGastos, setMonthGastos] = useState(0);

  // Formularios
  const [assetForm, setAssetForm] = useState<AssetForm>({
    name: "",
    category: ASSET_CATEGORIES[0],
    current_value: "",
    owner: "",
    notes: "",
  });

  const [debtForm, setDebtForm] = useState<DebtForm>({
    name: "",
    type: DEBT_TYPES[0],
    total_amount: "",
    current_balance: "",
    notes: "",
  });

  const [savingAsset, setSavingAsset] = useState(false);
  const [savingDebt, setSavingDebt] = useState(false);

  // Edición
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);

  // Cola offline
  const [pendingOpsCount, setPendingOpsCount] = useState(0);
  const syncInFlight = useRef(false);

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

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setAssets([]);
      setDebts([]);
      setMonthIngresos(0);
      setMonthGastos(0);
      setPendingOpsCount(0);
    } catch (err) {
      console.error("Error cerrando sesión", err);
    }
  };

  // =========================================================
  // Helpers: cache actual (por scope) después de cambios locales
  // =========================================================
  const writeCurrentScopeCache = useCallback(
    (nextAssets: Asset[], nextDebts: Debt[]) => {
      if (!user) return;
      const scope = {
        userId: user.id,
        familyId: familyCtx?.familyId ?? null,
        view: isFamilyView ? ("family" as const) : ("personal" as const),
      };
      writeCache(cacheKey("assets", scope), nextAssets);
      writeCache(cacheKey("debts", scope), nextDebts);
    },
    [user, familyCtx?.familyId, isFamilyView]
  );

  // =========================================================
  // SYNC OFFLINE OPS (assets/debts) — cuando vuelva internet
  // =========================================================
  const syncOfflineOps = useCallback(async () => {
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
          if (op.kind === "asset_upsert") {
            const a = op.payload;
            const { error } = await supabase.from("assets").upsert(
              [
                {
                  id: a.id,
                  user_id: a.user_id ?? user.id,
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
                  user_id: d.user_id ?? user.id,
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
        } catch {
          remaining.push(op);
        }
      }

      writeOps(user.id, remaining);
      setPendingOpsCount(remaining.length);
    } finally {
      syncInFlight.current = false;
    }
  }, [user]);

  // Sync al volver online
  useEffect(() => {
    if (!user) return;

    const onOnline = () => {
      syncOfflineOps();
    };

    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [user, syncOfflineOps]);

  // =========================================================
  // LOAD DATA (assets/debts) — OFFLINE SAFE + cache + overlay ops
  // =========================================================
  useEffect(() => {
    let alive = true;

    async function load() {
      if (!user) {
        setAssets([]);
        setDebts([]);
        setPendingOpsCount(0);
        return;
      }

      const scope = {
        userId: user.id,
        familyId: familyCtx?.familyId ?? null,
        view: isFamilyView ? ("family" as const) : ("personal" as const),
      };

      const assetsK = cacheKey("assets", scope);
      const debtsK = cacheKey("debts", scope);

      const ops = readOps(user.id);
      setPendingOpsCount(ops.length);

      // ✅ OFFLINE: cache + ops
      if (isOfflineNow()) {
        setLoading(false);
        setDataError(null);

        const cachedAssets = readCache<Asset[]>(assetsK, []);
        const cachedDebts = readCache<Debt[]>(debtsK, []);

        const patched = applyOpsToState(cachedAssets, cachedDebts, ops);
        setAssets(patched.assets);
        setDebts(patched.debts);
        return;
      }

      // ✅ ONLINE
      try {
        setLoading(true);
        setDataError(null);

        const [assetsRes, debtsRes] = await Promise.all([
          supabase
            .from("assets")
            .select("id,name,category,current_value,owner,notes,created_at,family_id,user_id")
            .match(isFamilyView ? { family_id: familyCtx?.familyId } : { user_id: user.id })
            .order("created_at", { ascending: false }),

          supabase
            .from("debts")
            .select("id,name,type,total_amount,current_balance,notes,created_at,family_id,user_id")
            .match(isFamilyView ? { family_id: familyCtx?.familyId } : { user_id: user.id })
            .order("created_at", { ascending: false }),
        ]);

        if (!alive) return;

        if (assetsRes.error) console.warn("Error cargando activos", assetsRes.error);
        if (debtsRes.error) console.warn("Error cargando deudas", debtsRes.error);

        const nextAssets = (assetsRes.data ?? []) as Asset[];
        const nextDebts = (debtsRes.data ?? []) as Debt[];

        writeCache(assetsK, nextAssets);
        writeCache(debtsK, nextDebts);

        const patched = applyOpsToState(nextAssets, nextDebts, ops);
        setAssets(patched.assets);
        setDebts(patched.debts);

        syncOfflineOps();
      } catch (err: any) {
        if (!alive) return;

        const msg = String(err?.message ?? "").toLowerCase();
        const looksOffline = msg.includes("offline") || msg.includes("failed to fetch") || msg.includes("network");

        if (looksOffline) {
          const cachedAssets = readCache<Asset[]>(assetsK, []);
          const cachedDebts = readCache<Debt[]>(debtsK, []);
          const patched = applyOpsToState(cachedAssets, cachedDebts, ops);
          setAssets(patched.assets);
          setDebts(patched.debts);
          setDataError(null);
        } else {
          console.error("Error cargando patrimonio:", err);
          setDataError("No se pudo cargar el patrimonio. Intenta de nuevo más tarde.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [user, familyCtx?.familyId, isFamilyView, syncOfflineOps]);

  // =========================================================
  // LOAD FLUJO DEL MES (transactions) — OFFLINE SAFE (cache)
  // =========================================================
  useEffect(() => {
    let alive = true;

    async function loadTx() {
      if (!user) {
        setMonthIngresos(0);
        setMonthGastos(0);
        return;
      }

      setTxLoading(true);
      setTxError(null);

      const scope = {
        userId: user.id,
        familyId: familyCtx?.familyId ?? null,
        view: isFamilyView ? ("family" as const) : ("personal" as const),
      };
      const flowK = cacheKey(`flow:${month}`, scope);

      // ✅ OFFLINE
      if (isOfflineNow()) {
        const cached = readCache<{ ingresos: number; gastos: number }>(flowK, { ingresos: 0, gastos: 0 });
        setMonthIngresos(cached.ingresos ?? 0);
        setMonthGastos(cached.gastos ?? 0);
        setTxLoading(false);
        setTxError(null);
        return;
      }

      try {
        const { from, to } = getMonthRange(month);

        let query = supabase
          .from("transactions")
          .select("id,date,type,amount,family_group_id,user_id,owner_user_id,spender_user_id")
          .gte("date", from)
          .lte("date", to);

        if (familyCtx?.familyId) {
          query = query.eq("family_group_id", familyCtx.familyId);

          if (!isFamilyView) {
            query = query.or(`spender_user_id.eq.${user.id},user_id.eq.${user.id},owner_user_id.eq.${user.id}`);
          }
        } else {
          query = query.or(`spender_user_id.eq.${user.id},user_id.eq.${user.id},owner_user_id.eq.${user.id}`);
        }

        const { data, error } = await query;
        if (error) throw error;

        let ingresos = 0;
        let gastos = 0;
        (data as TxRow[] | null | undefined)?.forEach((t) => {
          const amt = Number(t.amount) || 0;
          if (t.type === "ingreso") ingresos += amt;
          else gastos += amt;
        });

        if (!alive) return;

        setMonthIngresos(ingresos);
        setMonthGastos(gastos);
        writeCache(flowK, { ingresos, gastos });
      } catch (err: any) {
        if (!alive) return;

        const cached = readCache<{ ingresos: number; gastos: number }>(flowK, { ingresos: 0, gastos: 0 });
        setMonthIngresos(cached.ingresos ?? 0);
        setMonthGastos(cached.gastos ?? 0);

        const msg = String(err?.message ?? "").toLowerCase();
        const looksOffline = msg.includes("offline") || msg.includes("failed to fetch") || msg.includes("network");

        if (looksOffline) setTxError(null);
        else {
          console.error("Error cargando flujo del mes:", err);
          setTxError("No se pudo calcular el flujo del mes desde Gastos.");
        }
      } finally {
        if (alive) setTxLoading(false);
      }
    }

    loadTx();
    return () => {
      alive = false;
    };
  }, [user, month, familyCtx?.familyId, isFamilyView]);

  // =========================================================
  // Cálculos (patrimonio)
  // =========================================================
  const totalActivos = useMemo(() => assets.reduce((sum, a) => sum + (a.current_value ?? 0), 0), [assets]);
  const totalDeudas = useMemo(() => debts.reduce((sum, d) => sum + Number(d.current_balance ?? d.total_amount ?? 0), 0), [debts]);
  const patrimonioNeto = totalActivos - totalDeudas;

  const flujoMes = monthIngresos - monthGastos;

  const monthLabel = useMemo(() => {
    const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const [y, m] = month.split("-");
    const mi = Math.max(1, Math.min(12, Number(m))) - 1;
    return `${meses[mi]} ${y}`;
  }, [month]);

  // =========================================================
  // Form helpers
  // =========================================================
  const resetAssetForm = () => {
    setAssetForm({
      name: "",
      category: ASSET_CATEGORIES[0],
      current_value: "",
      owner: "",
      notes: "",
    });
    setEditingAssetId(null);
  };

  const resetDebtForm = () => {
    setDebtForm({
      name: "",
      type: DEBT_TYPES[0],
      total_amount: "",
      current_balance: "",
      notes: "",
    });
    setEditingDebtId(null);
  };

  // =========================================================
  // Submit Asset — ONLINE + OFFLINE (optimistic + cola)
  // =========================================================
  const handleSubmitAsset = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return alert("Tu sesión expiró. Vuelve a iniciar sesión.");

    const val = toNumberSafe(assetForm.current_value);
    if (!assetForm.name.trim() || !Number.isFinite(val) || val < 0) {
      return alert("Revisa el nombre y el valor del activo.");
    }

    const familyIdToUse = familyCtx?.familyId ?? null;

    try {
      setSavingAsset(true);

      // OFFLINE (o se cae red)
      if (isOfflineNow()) {
        const id = editingAssetId ?? safeUUID();
        const local: Asset = {
          id,
          user_id: user.id,
          family_id: familyIdToUse,
          name: assetForm.name.trim(),
          category: assetForm.category || null,
          current_value: val,
          owner: assetForm.owner.trim() || null,
          notes: assetForm.notes.trim() || null,
          created_at: new Date().toISOString(),
        };

        setAssets((prev) => {
          const next = editingAssetId ? prev.map((a) => (a.id === id ? { ...a, ...local } : a)) : [local, ...prev];
          writeCurrentScopeCache(next, debts);
          return next;
        });

        const ops = readOps(user.id);
        const nextOps: OfflineOp[] = [
          ...ops.filter((o) => !(o.kind === "asset_upsert" && o.id === id)),
          { kind: "asset_upsert", id, payload: local },
        ];
        writeOps(user.id, nextOps);
        setPendingOpsCount(nextOps.length);

        resetAssetForm();
        return;
      }

      // ONLINE
      if (editingAssetId) {
        const { data, error } = await supabase
          .from("assets")
          .update({
            name: assetForm.name.trim(),
            category: assetForm.category || null,
            current_value: val,
            owner: assetForm.owner.trim() || null,
            notes: assetForm.notes.trim() || null,
          })
          .eq("id", editingAssetId)
          .select("id,user_id,family_id,name,category,current_value,owner,notes,created_at")
          .single();

        if (error) throw error;

        setAssets((prev) => {
          const next = prev.map((a) => (a.id === editingAssetId ? (data as Asset) : a));
          writeCurrentScopeCache(next, debts);
          return next;
        });

        resetAssetForm();
        return;
      }

      const { data, error } = await supabase
        .from("assets")
        .insert([
          {
            user_id: user.id,
            family_id: familyIdToUse,
            name: assetForm.name.trim(),
            category: assetForm.category || null,
            current_value: val,
            owner: assetForm.owner.trim() || null,
            notes: assetForm.notes.trim() || null,
          },
        ])
        .select("id,user_id,family_id,name,category,current_value,owner,notes,created_at")
        .single();

      if (error) throw error;

      setAssets((prev) => {
        const next = [data as Asset, ...prev];
        writeCurrentScopeCache(next, debts);
        return next;
      });

      resetAssetForm();
    } catch (err: any) {
      const msg = String(err?.message ?? "").toLowerCase();
      const looksOffline = msg.includes("offline") || msg.includes("failed to fetch") || msg.includes("network");

      if (looksOffline) {
        const id = editingAssetId ?? safeUUID();
        const local: Asset = {
          id,
          user_id: user.id,
          family_id: familyCtx?.familyId ?? null,
          name: assetForm.name.trim(),
          category: assetForm.category || null,
          current_value: val,
          owner: assetForm.owner.trim() || null,
          notes: assetForm.notes.trim() || null,
          created_at: new Date().toISOString(),
        };

        setAssets((prev) => {
          const next = editingAssetId ? prev.map((a) => (a.id === id ? { ...a, ...local } : a)) : [local, ...prev];
          writeCurrentScopeCache(next, debts);
          return next;
        });

        const ops = readOps(user.id);
        const nextOps: OfflineOp[] = [
          ...ops.filter((o) => !(o.kind === "asset_upsert" && o.id === id)),
          { kind: "asset_upsert", id, payload: local },
        ];
        writeOps(user.id, nextOps);
        setPendingOpsCount(nextOps.length);

        resetAssetForm();
      } else {
        console.error("Error guardando activo:", err);
        alert("No se pudo guardar el activo. Intenta de nuevo.");
      }
    } finally {
      setSavingAsset(false);
    }
  };

  // =========================================================
  // Submit Debt — ONLINE + OFFLINE (optimistic + cola)
  // =========================================================
  const handleSubmitDebt = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return alert("Tu sesión expiró. Vuelve a iniciar sesión.");

    const total = toNumberSafe(debtForm.total_amount);
    if (!debtForm.name.trim() || !Number.isFinite(total) || total < 0) {
      return alert("Revisa el nombre y el monto total de la deuda.");
    }

    const currentBalance = debtForm.current_balance?.trim() ? toNumberSafe(debtForm.current_balance) : total;
    if (!Number.isFinite(currentBalance) || currentBalance < 0) {
      return alert("Revisa el saldo actual de la deuda.");
    }

    const debtType = DEBT_TYPES.includes(debtForm.type) ? debtForm.type : "Otro";
    const familyIdToUse = familyCtx?.familyId ?? null;

    try {
      setSavingDebt(true);

      // OFFLINE
      if (isOfflineNow()) {
        const id = editingDebtId ?? safeUUID();
        const local: Debt = {
          id,
          user_id: user.id,
          family_id: familyIdToUse,
          name: debtForm.name.trim(),
          type: debtType,
          total_amount: total,
          current_balance: currentBalance,
          notes: debtForm.notes.trim() || null,
          created_at: new Date().toISOString(),
        };

        setDebts((prev) => {
          const next = editingDebtId ? prev.map((d) => (d.id === id ? { ...d, ...local } : d)) : [local, ...prev];
          writeCurrentScopeCache(assets, next);
          return next;
        });

        const ops = readOps(user.id);
        const nextOps: OfflineOp[] = [
          ...ops.filter((o) => !(o.kind === "debt_upsert" && o.id === id)),
          { kind: "debt_upsert", id, payload: local },
        ];
        writeOps(user.id, nextOps);
        setPendingOpsCount(nextOps.length);

        resetDebtForm();
        return;
      }

      // ONLINE
      if (editingDebtId) {
        const { data, error } = await supabase
          .from("debts")
          .update({
            name: debtForm.name.trim(),
            type: debtType,
            total_amount: total,
            current_balance: currentBalance,
            notes: debtForm.notes.trim() || null,
          })
          .eq("id", editingDebtId)
          .select("id,user_id,family_id,name,type,total_amount,current_balance,notes,created_at")
          .single();

        if (error) throw error;

        setDebts((prev) => {
          const next = prev.map((d) => (d.id === editingDebtId ? (data as Debt) : d));
          writeCurrentScopeCache(assets, next);
          return next;
        });

        resetDebtForm();
        return;
      }

      const { data, error } = await supabase
        .from("debts")
        .insert([
          {
            user_id: user.id,
            family_id: familyIdToUse,
            name: debtForm.name.trim(),
            type: debtType,
            total_amount: total,
            current_balance: currentBalance,
            notes: debtForm.notes.trim() || null,
          },
        ])
        .select("id,user_id,family_id,name,type,total_amount,current_balance,notes,created_at")
        .single();

      if (error) throw error;

      setDebts((prev) => {
        const next = [data as Debt, ...prev];
        writeCurrentScopeCache(assets, next);
        return next;
      });

      resetDebtForm();
    } catch (err: any) {
      const msg = String(err?.message ?? "").toLowerCase();
      const looksOffline = msg.includes("offline") || msg.includes("failed to fetch") || msg.includes("network");

      if (looksOffline) {
        const id = editingDebtId ?? safeUUID();
        const local: Debt = {
          id,
          user_id: user.id,
          family_id: familyCtx?.familyId ?? null,
          name: debtForm.name.trim(),
          type: debtType,
          total_amount: total,
          current_balance: currentBalance,
          notes: debtForm.notes.trim() || null,
          created_at: new Date().toISOString(),
        };

        setDebts((prev) => {
          const next = editingDebtId ? prev.map((d) => (d.id === id ? { ...d, ...local } : d)) : [local, ...prev];
          writeCurrentScopeCache(assets, next);
          return next;
        });

        const ops = readOps(user.id);
        const nextOps: OfflineOp[] = [
          ...ops.filter((o) => !(o.kind === "debt_upsert" && o.id === id)),
          { kind: "debt_upsert", id, payload: local },
        ];
        writeOps(user.id, nextOps);
        setPendingOpsCount(nextOps.length);

        resetDebtForm();
      } else {
        console.error("Error guardando deuda:", err);
        alert("No se pudo guardar la deuda.");
      }
    } finally {
      setSavingDebt(false);
    }
  };

  // =========================================================
  // Delete — ONLINE + OFFLINE (optimistic + cola)
  // =========================================================
  const handleDeleteAsset = async (id: string) => {
    if (!window.confirm("¿Seguro que quieres eliminar este activo?")) return;
    if (!user) return;

    setAssets((prev) => {
      const next = prev.filter((a) => a.id !== id);
      writeCurrentScopeCache(next, debts);
      return next;
    });
    if (editingAssetId === id) resetAssetForm();

    if (isOfflineNow()) {
      const ops = readOps(user.id);
      const nextOps: OfflineOp[] = [
        ...ops.filter((o) => !(o.kind === "asset_upsert" && o.id === id)),
        { kind: "asset_delete", id, payload: { id } },
      ];
      writeOps(user.id, nextOps);
      setPendingOpsCount(nextOps.length);
      return;
    }

    try {
      const { error } = await supabase.from("assets").delete().eq("id", id);
      if (error) throw error;
      syncOfflineOps();
    } catch (err: any) {
      const msg = String(err?.message ?? "").toLowerCase();
      const looksOffline = msg.includes("offline") || msg.includes("failed to fetch") || msg.includes("network");
      if (looksOffline) {
        const ops = readOps(user.id);
        const nextOps: OfflineOp[] = [
          ...ops.filter((o) => !(o.kind === "asset_upsert" && o.id === id)),
          { kind: "asset_delete", id, payload: { id } },
        ];
        writeOps(user.id, nextOps);
        setPendingOpsCount(nextOps.length);
      } else {
        console.error("Error eliminando activo:", err);
        alert("No se pudo eliminar el activo.");
      }
    }
  };

  const handleDeleteDebt = async (id: string) => {
    if (!window.confirm("¿Seguro que quieres eliminar esta deuda?")) return;
    if (!user) return;

    setDebts((prev) => {
      const next = prev.filter((d) => d.id !== id);
      writeCurrentScopeCache(assets, next);
      return next;
    });
    if (editingDebtId === id) resetDebtForm();

    if (isOfflineNow()) {
      const ops = readOps(user.id);
      const nextOps: OfflineOp[] = [
        ...ops.filter((o) => !(o.kind === "debt_upsert" && o.id === id)),
        { kind: "debt_delete", id, payload: { id } },
      ];
      writeOps(user.id, nextOps);
      setPendingOpsCount(nextOps.length);
      return;
    }

    try {
      const { error } = await supabase.from("debts").delete().eq("id", id);
      if (error) throw error;
      syncOfflineOps();
    } catch (err: any) {
      const msg = String(err?.message ?? "").toLowerCase();
      const looksOffline = msg.includes("offline") || msg.includes("failed to fetch") || msg.includes("network");
      if (looksOffline) {
        const ops = readOps(user.id);
        const nextOps: OfflineOp[] = [
          ...ops.filter((o) => !(o.kind === "debt_upsert" && o.id === id)),
          { kind: "debt_delete", id, payload: { id } },
        ];
        writeOps(user.id, nextOps);
        setPendingOpsCount(nextOps.length);
      } else {
        console.error("Error eliminando deuda:", err);
        alert("No se pudo eliminar la deuda.");
      }
    }
  };

  // =========================================================
  // Edit
  // =========================================================
  const startEditAsset = (asset: Asset) => {
    setEditingAssetId(asset.id);
    setAssetForm({
      name: asset.name ?? "",
      category: asset.category || ASSET_CATEGORIES[0],
      current_value: asset.current_value?.toString() ?? "",
      owner: asset.owner ?? "",
      notes: asset.notes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startEditDebt = (debt: Debt) => {
    setEditingDebtId(debt.id);
    setDebtForm({
      name: debt.name ?? "",
      type: DEBT_TYPES.includes(debt.type) ? debt.type : DEBT_TYPES[0],
      total_amount: debt.total_amount?.toString() ?? "",
      current_balance: debt.current_balance != null ? debt.current_balance.toString() : "",
      notes: debt.notes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
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
        Necesitas iniciar sesión para ver y editar tu patrimonio.
        {authError && <p className="mt-2 text-xs text-rose-500">{authError}</p>}
      </div>
    );
  }

  // =========================================================
  // Render PAGE
  // =========================================================
  return (
    <PageShell>
      <AppHeader
        title="Patrimonio (activos y deudas)"
        subtitle="Foto completa de lo que tienes y lo que debes. Conectado a tu flujo mensual."
        activeTab="patrimonio"
        userEmail={user.email}
        userId={user.id}
        onSignOut={handleSignOut}
      />

      {/* Banner offline/sync */}
      {(isOfflineNow() || pendingOpsCount > 0) && (
        <section className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200">
          {isOfflineNow() ? (
            <div>
              Estás en <span className="font-semibold">modo offline</span>. Puedes agregar/editar/eliminar y se sincroniza al volver el internet.
            </div>
          ) : (
            <div>
              Sincronizando… Cambios pendientes: <span className="font-semibold">{pendingOpsCount}</span>
            </div>
          )}
        </section>
      )}

      {/* Resumen */}
      <section className="space-y-4">
        <Card>
          <Section
            title="Resumen"
            subtitle="Aquí ves tus activos, deudas y patrimonio neto. Si eres jefe de familia, puedes cambiar la vista a patrimonio familiar."
            right={
              familyCtx && isFamilyOwner ? (
                <SegmentedControl<ViewScope>
                  value={effectiveScope}
                  onChange={(v) => setViewScope(v)}
                  label="Vista"
                  help="En modo familiar se suman activos y deudas de miembros activos."
                  options={[
                    { value: "personal", label: "Sólo yo" },
                    { value: "family", label: "Familiar" },
                  ]}
                />
              ) : (
                <div className="text-right text-[11px] text-slate-500 dark:text-slate-400">
                  Vista actual: <span className="font-semibold">Sólo tu patrimonio.</span>
                  {familyCtx && !isFamilyOwner && <> El modo familiar sólo está disponible para el jefe de familia.</>}
                </div>
              )
            }
          >
            {familyCtx && (
              <div className="mt-2 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                <div>
                  Familia: <span className="font-semibold">{familyCtx.familyName}</span>{" "}
                  {isFamilyOwner ? "(jefe de familia)" : "(miembro)"}
                </div>
                <div>
                  Miembros activos: <span className="font-semibold">{familyCtx.activeMembers}</span>
                </div>
                {familyLoading && <div className="text-[10px] text-slate-400">Actualizando información de familia...</div>}
              </div>
            )}
            {familyError && <p className="mt-2 text-[11px] text-rose-500">{familyError}</p>}
          </Section>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Activos" value={formatMoney(totalActivos)} hint="Todo lo que tienes a valor aproximado actual." tone="good" />
          <StatCard label="Deudas" value={formatMoney(totalDeudas)} hint="Saldo pendiente considerando tarjetas, créditos y préstamos." tone="bad" />
          <StatCard
            label="Neto"
            value={formatMoney(patrimonioNeto)}
            hint="Activos – Deudas. Número clave para ver crecer."
            tone={patrimonioNeto >= 0 ? "good" : "bad"}
          />
        </div>

        <Card>
          <Section
            title="Conexión con Gastos"
            subtitle="Tu flujo mensual (ingresos - gastos) debería reflejarse con el tiempo en tu patrimonio."
            right={
              <div className="w-full max-w-[220px]">
                <Label>Mes</Label>
                <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              </div>
            }
          >
            {txError && (
              <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                {txError}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <StatCard label={`Ingresos (${monthLabel})`} value={formatMoney(monthIngresos)} tone="good" />
              <StatCard label={`Gastos (${monthLabel})`} value={formatMoney(monthGastos)} tone="bad" />
              <StatCard
                label={`Flujo neto (${monthLabel})`}
                value={formatMoney(flujoMes)}
                tone={flujoMes >= 0 ? "good" : "bad"}
                hint={txLoading ? "Calculando…" : "Dato calculado desde tu módulo de Gastos (con cache offline)."}
              />
            </div>

            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              Tip: si el flujo es positivo pero tu patrimonio no sube, normalmente significa que falta registrar el destino (ahorro/inversión) en Activos.
            </p>
          </Section>
        </Card>
      </section>

      {/* Formularios */}
      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <Section
            title={editingAssetId ? "Editar activo" : "Agregar activo"}
            subtitle="Cuentas bancarias, inversiones, propiedades, autos, negocios, etc."
            right={editingAssetId ? <LinkButton onClick={resetAssetForm}>Cancelar</LinkButton> : null}
          >
            <form onSubmit={handleSubmitAsset} className="mt-2 space-y-3">
              <div>
                <Label>Nombre</Label>
                <Input
                  value={assetForm.name}
                  onChange={(e) => setAssetForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ej. Cuenta BBVA, Casa Monterrey, Tesla…"
                  required
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Categoría</Label>
                  <Select value={assetForm.category} onChange={(e) => setAssetForm((p) => ({ ...p, category: e.target.value }))}>
                    {ASSET_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label>Valor aproximado</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={assetForm.current_value}
                    onChange={(e) => setAssetForm((p) => ({ ...p, current_value: e.target.value }))}
                    placeholder="Ej. 250000"
                    required
                  />
                </div>
              </div>

              <div>
                <Label>A nombre de</Label>
                <Input
                  value={assetForm.owner}
                  onChange={(e) => setAssetForm((p) => ({ ...p, owner: e.target.value }))}
                  placeholder="Ej. David, Dibri, Empresa…"
                />
              </div>

              <div>
                <Label>Notas (opcional)</Label>
                <Textarea
                  value={assetForm.notes}
                  onChange={(e) => setAssetForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Ej. Emergencias, valuación aproximada, etc."
                />
              </div>

              <Button type="submit" disabled={savingAsset}>
                {savingAsset ? (editingAssetId ? "Actualizando..." : "Guardando...") : editingAssetId ? "Guardar cambios" : "Guardar activo"}
              </Button>
            </form>
          </Section>
        </Card>

        <Card>
          <Section
            title={editingDebtId ? "Editar deuda" : "Agregar deuda"}
            subtitle="Tarjetas, préstamos, créditos de auto/casa. Lo importante es el saldo actual."
            right={editingDebtId ? <LinkButton onClick={resetDebtForm}>Cancelar</LinkButton> : null}
          >
            <form onSubmit={handleSubmitDebt} className="mt-2 space-y-3">
              <div>
                <Label>Nombre</Label>
                <Input
                  value={debtForm.name}
                  onChange={(e) => setDebtForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ej. Tarjeta BBVA Azul, Crédito casa…"
                  required
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Tipo</Label>
                  <Select value={debtForm.type} onChange={(e) => setDebtForm((p) => ({ ...p, type: e.target.value }))}>
                    {DEBT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label>Monto total</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={debtForm.total_amount}
                    onChange={(e) => setDebtForm((p) => ({ ...p, total_amount: e.target.value }))}
                    placeholder="Ej. 100000"
                    required
                  />
                </div>
              </div>

              <div>
                <Label>Saldo actual (opcional)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={debtForm.current_balance}
                  onChange={(e) => setDebtForm((p) => ({ ...p, current_balance: e.target.value }))}
                  placeholder="Ej. 45000"
                />
                <Help>Si lo dejas vacío, se tomará el monto total como saldo.</Help>
              </div>

              <div>
                <Label>Notas (opcional)</Label>
                <Textarea
                  value={debtForm.notes}
                  onChange={(e) => setDebtForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Ej. Se paga el 5 de cada mes, tasa, plazo, etc."
                />
              </div>

              <Button type="submit" disabled={savingDebt}>
                {savingDebt ? (editingDebtId ? "Actualizando..." : "Guardando...") : editingDebtId ? "Guardar cambios" : "Guardar deuda"}
              </Button>
            </form>
          </Section>
        </Card>
      </section>

      {/* Listas */}
      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <Section title="Activos" right={<span className="text-[11px] text-slate-500 dark:text-slate-400">{assets.length} activos</span>}>
            {loading ? (
              <EmptyState>Cargando activos...</EmptyState>
            ) : assets.length === 0 ? (
              <EmptyState>Aún no has registrado activos en esta vista.</EmptyState>
            ) : (
              <ul className="space-y-2">
                {assets.map((a) => (
                  <ListItem
                    key={a.id}
                    left={
                      <>
                        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{a.name}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {(a.category || "Sin categoría") + " · "}
                          {a.owner ? `A nombre de: ${a.owner}` : "Propietario: N/D"}
                        </div>

                        {(a.created_at || isFamilyView || a.notes) && (
                          <div className="mt-1 space-y-1">
                            {a.created_at && <div className="text-[10px] text-slate-400 dark:text-slate-500">{formatDateDisplay(a.created_at)}</div>}
                            {isFamilyView && (
                              <div className="text-[10px] text-slate-400 dark:text-slate-500">
                                Registrado por: {a.user_id === user.id ? "Tú" : "Otro miembro"}
                              </div>
                            )}
                            {a.notes && <div className="text-[11px] text-slate-600 dark:text-slate-300">{a.notes}</div>}
                          </div>
                        )}
                      </>
                    }
                    right={
                      <>
                        <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatMoney(a.current_value ?? 0)}</div>

                        {a.user_id === user.id && (
                          <div className="flex items-center gap-3">
                            <LinkButton onClick={() => startEditAsset(a)}>Editar</LinkButton>
                            <LinkButton tone="danger" onClick={() => handleDeleteAsset(a.id)}>
                              Eliminar
                            </LinkButton>
                          </div>
                        )}
                      </>
                    }
                  />
                ))}
              </ul>
            )}
          </Section>
        </Card>

        <Card>
          <Section title="Deudas" right={<span className="text-[11px] text-slate-500 dark:text-slate-400">{debts.length} deudas</span>}>
            {loading ? (
              <EmptyState>Cargando deudas...</EmptyState>
            ) : debts.length === 0 ? (
              <EmptyState>Aún no has registrado deudas en esta vista.</EmptyState>
            ) : (
              <ul className="space-y-2">
                {debts.map((d) => (
                  <ListItem
                    key={d.id}
                    left={
                      <>
                        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{d.name}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {(d.type || "Sin tipo") + " · Total: "} {formatMoney(d.total_amount ?? 0)}
                        </div>

                        {(d.created_at || isFamilyView || d.notes) && (
                          <div className="mt-1 space-y-1">
                            {d.created_at && <div className="text-[10px] text-slate-400 dark:text-slate-500">{formatDateDisplay(d.created_at)}</div>}
                            {isFamilyView && (
                              <div className="text-[10px] text-slate-400 dark:text-slate-500">
                                Registrada por: {d.user_id === user.id ? "Tú" : "Otro miembro"}
                              </div>
                            )}
                            {d.notes && <div className="text-[11px] text-slate-600 dark:text-slate-300">{d.notes}</div>}
                          </div>
                        )}
                      </>
                    }
                    right={
                      <>
                        <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                          {formatMoney(Number(d.current_balance ?? d.total_amount ?? 0))}
                        </div>

                        {d.user_id === user.id && (
                          <div className="flex items-center gap-3">
                            <LinkButton onClick={() => startEditDebt(d)}>Editar</LinkButton>
                            <LinkButton tone="danger" onClick={() => handleDeleteDebt(d.id)}>
                              Eliminar
                            </LinkButton>
                          </div>
                        )}
                      </>
                    }
                  />
                ))}
              </ul>
            )}
          </Section>
        </Card>
      </section>

      {dataError && (
        <section className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          {dataError}
        </section>
      )}
    </PageShell>
  );
}
