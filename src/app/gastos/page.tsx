"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import nextDynamic from "next/dynamic";
import type { User } from "@supabase/supabase-js";
import { useTheme } from "next-themes";

import { supabase } from "@/lib/supabase";
import { saveOfflineTx, getOfflineTxs, syncOfflineTxs } from "@/lib/offline";

import { ThemeToggle } from "@/components/ThemeToggle";
import { AppHeader } from "@/components/AppHeader";
import { PageShell } from "@/components/ui/PageShell";

// ✅ Para ref (evita depender de si kit Input tiene forwardRef o no)
import { Input as RefInput } from "@/components/ui/input";

import { formatMoney as fmtMoney, formatDateDisplay, toNumberSafe } from "@/lib/format";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

import {
  Button,
  Card,
  EmptyState,
  Help,
  Input as UIInput,
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

// ✅ Charts (Recharts) CLIENT-ONLY para evitar errores de types/SSR
const GastosCharts = nextDynamic(() => import("./GastosCharts"), { ssr: false });


type TxType = "ingreso" | "gasto";
type ExportType = "todos" | "ingresos" | "gastos";

type Tx = {
  id: string;
  date: string; // yyyy-mm-dd
  type: TxType;
  category: string;
  amount: number;
  method: string;
  notes?: string | null;

  user_id?: string | null; // legacy/compat (en tu DB existe)
  created_by?: string | null;
  card_id?: string | null;

  owner_user_id?: string | null;
  spender_user_id?: string | null;
  spender_label?: string | null;

  family_group_id?: string | null;
  goal_id?: string | null;

  localOnly?: boolean;
  created_at?: string | null;
};

type FormState = {
  date: string;
  type: TxType;
  category: string;
  amount: string;
  method: string;
  notes: string;
  spenderLabel: string;
  goalId: string;
};

type Option = { label: string; value: string };

type FamilyGoal = {
  id: string;
  family_group_id?: string | null;
  owner_user_id?: string | null;
  name: string;
  description?: string | null;
  target_amount?: number | null;
  due_date?: string | null;
  category?: string | null;
  auto_track?: boolean | null;
  track_direction?: "ingresos" | "ahorros" | "gastos_reducidos" | null;
  track_category?: string | null;
};

type CardType = {
  id: string;
  name: string;
  default_method: string | null;
  owner_id: string;
  family_id: string | null;
  shared_with_family: boolean;
};

const DEFAULT_CATEGORIES: Option[] = [
  { label: "Sueldo", value: "SUELDO" },
  { label: "Comisión", value: "COMISION" },
  { label: "Super / Despensa", value: "SUPER" },
  { label: "Escuela", value: "ESCUELA" },
  { label: "Renta", value: "RENTA" },
  { label: "Servicios", value: "SERVICIOS" },
  { label: "Gasolina", value: "GASOLINA" },
  { label: "Entretenimiento", value: "ENTRETENIMIENTO" },
  { label: "Otros", value: "OTROS" },
];

const DEFAULT_METHODS: Option[] = [
  { label: "Efectivo", value: "EFECTIVO" },
  { label: "Transferencia / SPEI", value: "TRANSFERENCIA" },
  { label: "Tarjeta (crédito/débito)", value: "TARJETA" },
  { label: "Domiciliado", value: "DOMICILIADO" },
  { label: "Otro", value: "OTRO" },
];

const SPENDER_OPTIONS: Option[] = [
  { label: "Yo", value: "Yo" },
  { label: "Esposa", value: "Esposa" },
  { label: "Hijo / Hija", value: "Hijo / Hija" },
  { label: "Otro", value: "Otro" },
];

const CUSTOM_CATEGORIES_KEY = "ff-custom-categories";
const CUSTOM_METHODS_KEY = "ff-custom-methods";

const DRAFT_KEY = "ff-gastos-draft-v1";
const PREFS_KEY = "ff-gastos-prefs-v1";

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
  const lastDay = new Date(y, m, 0).getDate(); // m ya es 1..12
  const to = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

type QuickTemplate = {
  id: string;
  label: string;
  type: TxType;
  category: string;
  method?: string;
  amount?: number;
  notes?: string;
};

const QUICK_TEMPLATES: QuickTemplate[] = [
  { id: "gasolina", label: "Gasolina", type: "gasto", category: "GASOLINA", amount: 800, method: "TARJETA" },
  { id: "super", label: "Super", type: "gasto", category: "SUPER", amount: 1500, method: "TARJETA" },
  { id: "servicios", label: "Servicios", type: "gasto", category: "SERVICIOS", amount: 1200, method: "DOMICILIADO" },
  { id: "renta", label: "Renta", type: "gasto", category: "RENTA", amount: 20000, method: "TRANSFERENCIA" },
  { id: "sueldo", label: "Sueldo", type: "ingreso", category: "SUELDO", amount: 50000, method: "TRANSFERENCIA" },
];

function inferFromNotes(raw: string): { category?: string; method?: string } {
  const t = (raw || "").toLowerCase();

  if (/(gasolina|pemex|shell|bp|mobil)/.test(t)) return { category: "GASOLINA" };
  if (/(super|walmart|heb|costco|sams|soriana)/.test(t)) return { category: "SUPER" };
  if (/(colegiatura|escuela|inscrip|uniforme|libros)/.test(t)) return { category: "ESCUELA" };
  if (/(renta|arrend|cas(a|ita))/i.test(t)) return { category: "RENTA" };
  if (/(luz|cfe|agua|aydm|gas|internet|izzi|totalplay|telmex|netflix|spotify)/.test(t)) return { category: "SERVICIOS" };
  if (/(cine|rest|restaurant|bar|uber eats|rappi|didifood)/.test(t)) return { category: "ENTRETENIMIENTO" };

  if (/(spei|transfer|tranferencia|bbva|banorte|hsbc)/.test(t)) return { method: "TRANSFERENCIA" };
  if (/(efectivo|cash)/.test(t)) return { method: "EFECTIVO" };
  if (/(domiciliad|auto ?pago)/.test(t)) return { method: "DOMICILIADO" };
  if (/(tarjeta|tdc|tdd|amex|visa|mastercard)/.test(t)) return { method: "TARJETA" };

  return {};
}

// =========================================================
// Helpers (dedupe / merge / sort) - (UNA SOLA VEZ)
// =========================================================
function sortTxs(list: Tx[]): Tx[] {
  const arr = [...list];
  arr.sort((a, b) => {
    if (a.date !== b.date) return a.date > b.date ? -1 : 1;
    const aCreated = a.created_at ?? "";
    const bCreated = b.created_at ?? "";
    if (aCreated && bCreated && aCreated !== bCreated) return aCreated > bCreated ? -1 : 1;
    return 0;
  });
  return arr;
}

function dedupeAndSortTx(list: Tx[]): Tx[] {
  const byId = new Map<string, Tx>();
  for (const tx of list) byId.set(tx.id, tx); // último gana
  return sortTxs(Array.from(byId.values()));
}

function mergeKeepLocalOnly(prev: Tx[], server: Tx[]): Tx[] {
  const localOnly = prev.filter((t) => t.localOnly);
  const byId = new Map<string, Tx>();
  for (const t of localOnly) byId.set(t.id, t);
  for (const t of server) byId.set(t.id, t);
  return sortTxs(Array.from(byId.values()));
}

function upsertAndSortTx(prev: Tx[], incoming: Tx): Tx[] {
  const byId = new Map<string, Tx>();
  byId.set(incoming.id, incoming);
  for (const t of prev) if (!byId.has(t.id)) byId.set(t.id, t);
  return sortTxs(Array.from(byId.values()));
}

export default function GastosPage() {
  // 🔐 AUTH
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  // 🌙 Tema (solo para colores de recharts)
  const { theme, systemTheme } = useTheme();
  const [mountedTheme, setMountedTheme] = useState(false);
  useEffect(() => setMountedTheme(true), []);
  const currentTheme = theme === "system" ? systemTheme : theme;
  const isDark = mountedTheme && currentTheme === "dark";

  // 👨‍👩‍👧‍👦 Familia (CAPA A)
  const { familyCtx, familyLoading, familyError, isFamilyOwner } = useFamilyContext(user);
  const canUseFamilyScope = Boolean(familyCtx && isFamilyOwner);
  const [viewScope, setViewScope] = useState<"mine" | "family">("mine");

  // miembros para labels bonitos
  const [membersByUserId, setMembersByUserId] = useState<
    Record<string, { userId: string; fullName: string; shortLabel: string }>
  >({});

  useEffect(() => {
    if (!familyCtx) {
      setMembersByUserId({});
      return;
    }

    let cancelled = false;
    const loadMembers = async () => {
      try {
        const { data, error } = await supabase
          .from("family_members")
          .select("user_id, full_name, short_label, status")
          .eq("family_id", familyCtx.familyId)
          .eq("status", "active");

        if (error) throw error;

        const map: Record<string, { userId: string; fullName: string; shortLabel: string }> = {};
        (data ?? []).forEach((m: any) => {
          if (!m.user_id) return;
          const fullName = m.full_name ?? "Miembro";
          const autoShort = (fullName.split(" ")[0] ?? fullName).trim();
          const shortLabel = (m.short_label ?? autoShort).trim();
          map[m.user_id] = { userId: m.user_id, fullName, shortLabel };
        });

        if (!cancelled) setMembersByUserId(map);
      } catch (err) {
        console.warn("No se pudieron cargar miembros:", err);
      }
    };

    loadMembers();
    return () => {
      cancelled = true;
    };
  }, [familyCtx?.familyId]);

  // 📶 Online status (CAPA A)
  const isOnline = useOnlineStatus();

  // 💰 Movimientos
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cat / methods
  const [categories, setCategories] = useState<Option[]>(DEFAULT_CATEGORIES);
  const [methods, setMethods] = useState<Option[]>(DEFAULT_METHODS);
  const [newCategory, setNewCategory] = useState("");
  const [newMethod, setNewMethod] = useState("");

  // Mes + form
  const [month, setMonth] = useState<string>(() => getCurrentMonthKey());
  const [form, setForm] = useState<FormState>({
    date: "",
    type: "gasto",
    category: DEFAULT_CATEGORIES[0]?.value ?? "",
    amount: "",
    method: DEFAULT_METHODS[0]?.value ?? "",
    notes: "",
    spenderLabel: SPENDER_OPTIONS[0]?.value ?? "Yo",
    goalId: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  // Presupuesto
  const [budgetInput, setBudgetInput] = useState("");
  const [budget, setBudget] = useState<number | null>(null);

  // Export
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [exportType, setExportType] = useState<ExportType>("todos");
  const [exportIncludeCategorySummary, setExportIncludeCategorySummary] = useState(true);

  // UI collapsibles
  const [showCardsList, setShowCardsList] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const [showGastosPorPersona, setShowGastosPorPersona] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Filtros
  const [filterType, setFilterType] = useState<"todos" | "ingreso" | "gasto">("todos");
  const [filterCategory, setFilterCategory] = useState<string>("TODAS");
  const [filterMethod, setFilterMethod] = useState<string>("TODOS");
  const [searchText, setSearchText] = useState<string>("");

  // 💳 Tarjetas
  const [cards, setCards] = useState<CardType[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  // Tarjeta nueva
  const [newCardName, setNewCardName] = useState("");
  const [savingCard, setSavingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [newCardShared, setNewCardShared] = useState(false);

  // Metas
  const [goals, setGoals] = useState<FamilyGoal[]>([]);

  // search ref
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const draftTimer = useRef<number | null>(null);

  const formatMoney = (n: number) => fmtMoney(n, "MXN");

  // =========================================================
  // AUTH
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
        if (!ignore) setUser(null);
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

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (error) {
        setAuthError(error.message);
        return;
      }
      setAuthEmail("");
      setAuthPassword("");
    } catch {
      setAuthError("No se pudo iniciar sesión.");
    }
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signUp({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (error) {
        setAuthError(error.message);
        return;
      }
      alert("Cuenta creada. Revisa tu correo si tienes verificación activada.");
      setAuthMode("login");
      setAuthPassword("");
    } catch {
      setAuthError("No se pudo crear la cuenta.");
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setTransactions([]);
      setBudget(null);
      setBudgetInput("");
      setCards([]);
      setGoals([]);
    } catch (err) {
      console.error("Error cerrando sesión", err);
    }
  };

  // =========================================================
  // Helpers UI/labels
  // =========================================================
  const getSpenderLabel = (tx: Tx): string => {
    if (!user) return "—";

    if (tx.spender_user_id && membersByUserId[tx.spender_user_id]) {
      if (tx.spender_user_id === user.id) return "Yo";
      const m = membersByUserId[tx.spender_user_id];
      return m.shortLabel || m.fullName || "Miembro";
    }

    if (tx.spender_user_id === user.id) return "Yo";
    if (tx.spender_label && tx.spender_label !== "Yo") return tx.spender_label;
    return "Miembro";
  };

  // =========================================================
  // Cargar categorías/métodos personalizados
  // =========================================================
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const catsRaw = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
      if (catsRaw) {
        const parsed = JSON.parse(catsRaw);
        if (Array.isArray(parsed) && parsed.length) setCategories(parsed);
      }
    } catch {}

    try {
      const methodsRaw = localStorage.getItem(CUSTOM_METHODS_KEY);
      if (methodsRaw) {
        const parsed = JSON.parse(methodsRaw);
        if (Array.isArray(parsed) && parsed.length) setMethods(parsed);
      }
    } catch {}
  }, []);

  // =========================================================
  // Cargar movimientos (Supabase / Cache / Offline)
  // =========================================================
  useEffect(() => {
    const currentUser = user;
    if (!currentUser) {
      setTransactions([]);
      return;
    }

    const userId = currentUser.id;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const { from, to } = getMonthRange(month);

      const mapRows = (rows: any[]): Tx[] =>
        (rows ?? []).map((t: any) => ({
          id: t.id,
          date: t.date,
          type: t.type,
          category: t.category,
          amount: Number(t.amount),
          method: t.method,
          notes: t.notes,
          owner_user_id: t.owner_user_id ?? null,
          spender_user_id: t.spender_user_id ?? null,
          spender_label: t.spender_label ?? null,
          created_by: t.created_by ?? null,
          card_id: t.card_id ?? null,
          family_group_id: t.family_group_id ?? null,
          goal_id: t.goal_id ?? null,
          created_at: t.created_at ?? null,
          user_id: t.user_id ?? null,
        }));

      try {
        // =========================
        // 🚫 OFFLINE: NO SUPABASE
        // =========================
        if (typeof window !== "undefined" && !navigator.onLine) {
          const cacheRaw = localStorage.getItem(`ff-cache-${month}`);
          const cached = cacheRaw ? JSON.parse(cacheRaw) : [];
          const cachedMapped = mapRows(cached);

          // 👇 IMPORTANTE: si no hay user todavía, no intentes leer offline por usuario
const uid = user?.id ?? null;
const offline = uid ? await getOfflineTxs(uid) : [];

const offlineMapped: Tx[] = offline.map((t) => ({
  id: t.id,
  date: t.date,
  type: t.type,
  category: t.category,
  amount: Number(t.amount),
  method: t.method,
  notes: t.notes ?? null,
  owner_user_id: t.owner_user_id ?? null,
  spender_user_id: t.spender_user_id ?? null,
  spender_label: t.spender_label ?? "Yo",
  created_by: t.created_by ?? null,
  card_id: t.card_id ?? null,
  family_group_id: t.family_group_id ?? null,
  goal_id: t.goal_id ?? null,
  created_at: null,
  localOnly: true,
}));

          if (!cancelled) {
            setTransactions(dedupeAndSortTx([...offlineMapped, ...cachedMapped]));
          }
          return;
        }

        // =========================
        // 🌐 ONLINE: SUPABASE
        // =========================
        let query = supabase
          .from("transactions")
          .select("*")
          .gte("date", from)
          .lte("date", to)
          .order("date", { ascending: false })
          .order("created_at", { ascending: false });

        if (familyCtx?.familyId) {
          query = query.eq("family_group_id", familyCtx.familyId);

          if (canUseFamilyScope) {
            if (viewScope === "mine") {
              query = query.eq("owner_user_id", userId);
            } else {
              const ids = familyCtx.activeMemberUserIds?.length ? familyCtx.activeMemberUserIds : [userId];
              query = query.or(
                `spender_user_id.in.(${ids.join(",")}),owner_user_id.in.(${ids.join(",")}),user_id.in.(${ids.join(",")})`
              );
            }
          } else {
            query = query.or(`spender_user_id.eq.${userId},user_id.eq.${userId},owner_user_id.eq.${userId}`);
          }
        } else {
          query = query.or(`spender_user_id.eq.${userId},user_id.eq.${userId},owner_user_id.eq.${userId}`);
        }

        const { data, error } = await query;
        if (error) throw error;

        const mapped = mapRows(data ?? []);

        if (!cancelled) {
          setTransactions((prev) => mergeKeepLocalOnly(prev, mapped));
        }

        localStorage.setItem(`ff-cache-${month}`, JSON.stringify(data ?? []));
      } catch (err) {
        if (!cancelled) setError("No se pudieron cargar los movimientos.");

        try {
          const cache = localStorage.getItem(`ff-cache-${month}`);
          const parsed = cache ? JSON.parse(cache) : [];
          setTransactions((prev) => mergeKeepLocalOnly(prev, mapRows(parsed)));
        } catch {}
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [month, user, viewScope, canUseFamilyScope, familyCtx?.familyId, familyCtx?.activeMemberUserIds]);

  // =========================================================
  // Sync offline al volver internet
  // =========================================================
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user) return;

    let cancelled = false;

    const syncAndMark = async () => {
      if (cancelled) return;
      if (!navigator.onLine) return;

      try {
        const synced = await syncOfflineTxs(user.id);
        if (!synced?.length) return;

        alert(`Se sincronizaron ${synced.length} movimientos que estaban guardados sin conexión.`);
        const syncedIds = new Set(synced.map((t: any) => t.id));

        setTransactions((prev) => prev.map((tx) => (tx.localOnly && syncedIds.has(tx.id) ? { ...tx, localOnly: false } : tx)));
      } catch (err) {
        console.error("Error al sincronizar movimientos offline", err);
      }
    };

    if (navigator.onLine) syncAndMark();

    const handleOnline = () => syncAndMark();
    window.addEventListener("online", handleOnline);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
    };
  }, [user]);

  // =========================================================
  // Presupuesto mensual (localStorage)
  // =========================================================
  useEffect(() => {
    const key = `ff-budget-${month}`;
    const raw = typeof window !== "undefined" ? localStorage.getItem(key) : null;

    if (raw) {
      const val = Number(raw);
      const valid = Number.isFinite(val) ? val : null;
      setBudget(valid);
      setBudgetInput(valid != null ? String(valid) : "");
    } else {
      setBudget(null);
      setBudgetInput("");
    }
  }, [month]);

  const handleSaveBudget = () => {
    const val = toNumberSafe(budgetInput);
    if (!Number.isFinite(val) || val <= 0) {
      alert("Ingresa un presupuesto válido mayor a 0.");
      return;
    }
    setBudget(val);
    if (typeof window !== "undefined") localStorage.setItem(`ff-budget-${month}`, String(val));
  };

  // =========================================================
  // Tarjetas (Supabase)
  // =========================================================
  useEffect(() => {
    if (!user) {
      setCards([]);
      return;
    }

    const loadCards = async () => {
      const ownerId = familyCtx?.ownerUserId ?? user.id;

      try {
        let query = supabase
          .from("cards")
          .select("id,name,default_method,owner_id,family_id,shared_with_family")
          .eq("owner_id", ownerId)
          .order("name", { ascending: true });

        if (familyCtx && !canUseFamilyScope) {
          query = query.eq("shared_with_family", true);
        }

        const { data, error } = await query;
        if (error) {
          console.warn("Error al cargar tarjetas", error);
          return;
        }

        setCards(
          (data ?? []).map((row: any) => ({
            id: row.id,
            name: row.name,
            default_method: row.default_method ?? null,
            owner_id: row.owner_id,
            family_id: row.family_id ?? null,
            shared_with_family: row.shared_with_family ?? false,
          }))
        );
      } catch (err) {
        console.warn("Error inesperado al cargar tarjetas", err);
      }
    };

    loadCards();
  }, [user, familyCtx?.ownerUserId, familyCtx?.familyId, canUseFamilyScope]);

  const handleChangeCard = (cardId: string | null) => {
    setSelectedCardId(cardId);

    if (!cardId) return;
    const found = cards.find((c) => c.id === cardId);
    if (!found) return;

    const methodValue = found.default_method ?? found.name.toUpperCase().replace(/\s+/g, "_");
    setForm((prev) => ({ ...prev, method: methodValue }));

    setMethods((prev) => {
      if (prev.some((m) => m.value === methodValue)) return prev;
      const updated = [...prev, { label: found.name, value: methodValue }];
      if (typeof window !== "undefined") localStorage.setItem(CUSTOM_METHODS_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // =========================================================
  // Metas familiares (Supabase)
  // =========================================================
  useEffect(() => {
    if (!user) {
      setGoals([]);
      return;
    }

    const loadGoals = async () => {
      try {
        let query = supabase.from("family_goals").select("*");
        if (familyCtx) query = query.eq("family_group_id", familyCtx.familyId);
        else query = query.eq("owner_user_id", user.id);

        const { data, error } = await query;
        if (error) {
          console.warn("Error cargando metas familiares:", error);
          return;
        }

        setGoals((data ?? []) as FamilyGoal[]);
      } catch (err) {
        console.error("Error inesperado cargando metas familiares:", err);
      }
    };

    loadGoals();
  }, [user, familyCtx?.familyId]);

  // =========================================================
  // Form: change + reset
  // =========================================================
  const handleChangeForm = (field: keyof FormState, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };

      if (!editingId && field === "notes") {
        const inferred = inferFromNotes(value);
        if (inferred.category) next.category = inferred.category;
        if (inferred.method) next.method = inferred.method;
      }

      return next;
    });
  };

  const clearDraft = () => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  };

  const resetForm = () => {
    setForm({
      date: "",
      type: "gasto",
      category: categories[0]?.value ?? "",
      amount: "",
      method: methods[0]?.value ?? "",
      notes: "",
      spenderLabel: SPENDER_OPTIONS[0]?.value ?? "Yo",
      goalId: "",
    });
    setSelectedCardId(null);
    setEditingId(null);
  };

  // =========================================================
  // Draft + prefs load/save
  // =========================================================
  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;

    try {
      const prefsRaw = localStorage.getItem(PREFS_KEY);
      if (prefsRaw) {
        const prefs = JSON.parse(prefsRaw) as Partial<{
          type: TxType;
          category: string;
          method: string;
          spenderLabel: string;
          goalId: string;
          selectedCardId: string | null;
        }>;

        if (prefs.type) handleChangeForm("type", prefs.type);
        if (prefs.category) handleChangeForm("category", prefs.category);
        if (prefs.method) handleChangeForm("method", prefs.method);
        if (prefs.spenderLabel) handleChangeForm("spenderLabel", prefs.spenderLabel);
        if (typeof prefs.goalId === "string") handleChangeForm("goalId", prefs.goalId);
        if (typeof prefs.selectedCardId !== "undefined") setSelectedCardId(prefs.selectedCardId);
      }
    } catch {}

    try {
      const draftRaw = localStorage.getItem(DRAFT_KEY);
      if (draftRaw && !editingId) {
        const draft = JSON.parse(draftRaw) as Partial<FormState> & { selectedCardId?: string | null };

        if (typeof draft.date === "string") handleChangeForm("date", draft.date);
        if (draft.type) handleChangeForm("type", draft.type);
        if (typeof draft.category === "string") handleChangeForm("category", draft.category);
        if (typeof draft.amount === "string") handleChangeForm("amount", draft.amount);
        if (typeof draft.method === "string") handleChangeForm("method", draft.method);
        if (typeof draft.notes === "string") handleChangeForm("notes", draft.notes);
        if (typeof draft.spenderLabel === "string") handleChangeForm("spenderLabel", draft.spenderLabel);
        if (typeof draft.goalId === "string") handleChangeForm("goalId", draft.goalId);
        if (typeof draft.selectedCardId !== "undefined") setSelectedCardId(draft.selectedCardId);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;

    const prefs = {
      type: form.type,
      category: form.category,
      method: form.method,
      spenderLabel: form.spenderLabel,
      goalId: form.goalId,
      selectedCardId,
    };

    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {}
  }, [user, form.type, form.category, form.method, form.spenderLabel, form.goalId, selectedCardId]);

  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;
    if (editingId) return;

    if (draftTimer.current) window.clearTimeout(draftTimer.current);

    draftTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...form, selectedCardId }));
      } catch {}
    }, 350);

    return () => {
      if (draftTimer.current) window.clearTimeout(draftTimer.current);
    };
  }, [user, form, selectedCardId, editingId]);

  // =========================================================
  // Atajos teclado
  // =========================================================
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onKeyDown = (e: KeyboardEvent) => {
      const key = (e as KeyboardEvent)?.key?.toLowerCase?.() ?? "";
if (!key) return;
      const isMeta = e.metaKey || e.ctrlKey;

      const active = document.activeElement as HTMLElement | null;
      const tag = (active?.tagName || "").toLowerCase();
      const isTyping = tag === "input" || tag === "textarea" || (active as any)?.isContentEditable;

      if (isMeta && key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (key === "escape") {
        if (editingId) {
          e.preventDefault();
          resetForm();
        } else {
          if (!isTyping) {
            e.preventDefault();
            clearDraft();
            resetForm();
          }
        }
        return;
      }

      if (isMeta && key === "enter") {
        e.preventDefault();
        const formEl = document.getElementById("ff-gastos-form") as HTMLFormElement | null;
        formEl?.requestSubmit?.();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingId]);

  // =========================================================
  // Templates
  // =========================================================
  const applyTemplate = (tpl: QuickTemplate) => {
    if (editingId) return;
    setForm((prev) => ({
      ...prev,
      date: prev.date || todayYMD(),
      type: tpl.type,
      category: tpl.category,
      method: tpl.method ?? prev.method,
      amount: tpl.amount != null ? String(tpl.amount) : prev.amount,
      notes: tpl.notes ?? prev.notes,
    }));
  };

  // =========================================================
  // KPIs + cálculos
  // =========================================================
  const { totalIngresos, totalGastos } = useMemo(() => {
    let ingresos = 0;
    let gastos = 0;
    for (const t of transactions) {
      if (t.type === "ingreso") ingresos += t.amount;
      else gastos += t.amount;
    }
    return { totalIngresos: ingresos, totalGastos: gastos };
  }, [transactions]);

  const flujo = totalIngresos - totalGastos;
  const disponible = budget != null ? budget - totalGastos : null;

  const gastosPorCategoria = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== "gasto") continue;
      const key = t.category || "SIN_CATEGORIA";
      map.set(key, (map.get(key) ?? 0) + t.amount);
    }
    const entries = Array.from(map.entries()).map(([category, total]) => ({ category, total }));
    entries.sort((a, b) => b.total - a.total);
    const totalGastosMes = entries.reduce((sum, e) => sum + e.total, 0);

    return entries.map((e) => ({
      ...e,
      percent: totalGastosMes ? (e.total * 100) / totalGastosMes : 0,
    }));
  }, [transactions]);

  const gastosPorPersona = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== "gasto") continue;
      const label = getSpenderLabel(t);
      map.set(label, (map.get(label) ?? 0) + t.amount);
    }
    const arr = Array.from(map.entries()).map(([label, total]) => ({ label, total }));
    const total = arr.reduce((s, x) => s + x.total, 0);

    return arr
      .map((x) => ({ ...x, percent: total ? (x.total * 100) / total : 0 }))
      .sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, user?.id, membersByUserId]);

  const goalsById = useMemo(() => {
    const map = new Map<string, FamilyGoal>();
    goals.forEach((g) => g.id && map.set(g.id, g));
    return map;
  }, [goals]);

  const filteredTransactions = useMemo(() => {
    const filtered = transactions.filter((t) => {
      if (filterType !== "todos" && t.type !== filterType) return false;
      if (filterCategory !== "TODAS" && t.category !== filterCategory) return false;
      if (filterMethod !== "TODOS" && t.method !== filterMethod) return false;

      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        const haystack = [t.category, t.method, t.notes ?? "", formatDateDisplay(t.date)].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    return sortTxs(filtered);
  }, [transactions, filterType, filterCategory, filterMethod, searchText]);

  const { filteredIngresos, filteredGastos, filteredFlujo } = useMemo(() => {
    let ingresos = 0;
    let gastos = 0;
    for (const t of filteredTransactions) {
      if (t.type === "ingreso") ingresos += t.amount;
      else gastos += t.amount;
    }
    return { filteredIngresos: ingresos, filteredGastos: gastos, filteredFlujo: ingresos - gastos };
  }, [filteredTransactions]);

  const chartDataCategorias = useMemo(
    () => gastosPorCategoria.map((g) => ({ category: g.category, total: g.total })),
    [gastosPorCategoria]
  );

  const chartDataLinea = useMemo(() => {
    const map = new Map<string, { date: string; ingresos: number; gastos: number }>();
    for (const t of transactions) {
      const key = (t.date ?? "").slice(0, 10);
      if (!map.has(key)) map.set(key, { date: key, ingresos: 0, gastos: 0 });
      const item = map.get(key)!;
      if (t.type === "ingreso") item.ingresos += t.amount;
      else item.gastos += t.amount;
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => (a.date < b.date ? -1 : 1));
    return arr.map((d) => ({ ...d, dateLabel: formatDateDisplay(d.date) }));
  }, [transactions]);

  const smartSummary = useMemo(() => {
    const lines: string[] = [];

    if (!transactions.length) {
      lines.push("Aún no tienes movimientos en este mes. Empieza registrando ingresos y gastos para ver tu resumen.");
      return lines;
    }

    if (totalIngresos === 0 && totalGastos > 0) {
      lines.push("Este mes sólo has registrado gastos, pero ningún ingreso. Revisa si falta capturar tu sueldo o ingresos principales.");
    }

    if (totalIngresos > 0) {
      const ratio = (totalGastos / totalIngresos) * 100;
      lines.push(`Has gastado aproximadamente el ${ratio.toFixed(1)}% de tus ingresos del mes.`);

      if (ratio > 90) lines.push("Estás muy cerca de gastar todo lo que ingresaste. Sería bueno frenar un poco los gastos en lo que resta del mes.");
      else if (ratio > 70) lines.push("Tu nivel de gasto es elevado, pero aún tienes margen. Vale la pena revisar en qué se está yendo la mayor parte.");
      else if (ratio < 50) lines.push("Vas muy bien. Estás gastando menos de la mitad de lo que ingresaste este mes.");
    }

    if (budget != null) {
      if (disponible != null && disponible < 0) {
        lines.push(`Ya sobrepasaste tu presupuesto de ${formatMoney(budget)}. Estás por encima en ${formatMoney(Math.abs(disponible))}.`);
      } else if (disponible != null && disponible > 0) {
        lines.push(`Todavía te quedan ${formatMoney(disponible)} disponibles dentro de tu presupuesto de este mes.`);
      }
    }

    if (gastosPorCategoria.length > 0) {
      const top1 = gastosPorCategoria[0];
      lines.push(`Tu categoría con más gasto este mes es "${top1.category}" con ${formatMoney(top1.total)} (${top1.percent.toFixed(1)}% del total).`);
      if (gastosPorCategoria.length > 1) {
        const top2 = gastosPorCategoria[1];
        lines.push(`La segunda categoría con más peso es "${top2.category}" con ${formatMoney(top2.total)}.`);
      }
    }

    lines.push(`Impacto estimado en tu patrimonio este mes: ${formatMoney(flujo)} (flujo neto del mes).`);

    return lines;
  }, [transactions, totalIngresos, totalGastos, budget, disponible, gastosPorCategoria, flujo]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-");
    const date = new Date(Number(y), Number(m) - 1, 1);
    const raw = date.toLocaleDateString("es-MX", { year: "numeric", month: "long" });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [month]);

  // =========================================================
  // Export CSV/PDF
  // =========================================================
  const handleExportCsv = () => {
    let data = transactions;
    if (exportType === "ingresos") data = transactions.filter((t) => t.type === "ingreso");
    else if (exportType === "gastos") data = transactions.filter((t) => t.type === "gasto");

    if (!data.length) {
      alert("No hay movimientos en este mes con ese filtro para exportar.");
      return;
    }

    const header = ["Fecha", "Tipo", "Categoría", "Monto", "Método", "Notas", "Offline"];
    const rows = data.map((t) => [t.date, t.type, t.category, t.amount, t.method, t.notes ?? "", t.localOnly ? "sí" : "no"]);
    const csvLines = [header.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))];

    if (exportIncludeCategorySummary && gastosPorCategoria.length > 0 && exportType !== "ingresos") {
      csvLines.push("");
      csvLines.push("Resumen de gastos por categoría");
      csvLines.push("Categoría,Total,Porcentaje");
      gastosPorCategoria.forEach((item) => {
        csvLines.push([csvEscape(item.category), csvEscape(item.total), csvEscape(`${item.percent.toFixed(1)}%`)].join(","));
      });
    }

    const csvContent = csvLines.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const fileMonth = month.replace("-", "_");
    const exportLabel = exportType === "todos" ? "todos" : exportType === "ingresos" ? "ingresos" : "gastos";
    const fileName = `finanzas_${fileMonth}_${exportLabel}.csv`;

    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = async () => {
    if (!transactions.length) {
      alert("No hay movimientos en este mes para generar el PDF.");
      return;
    }

    const jsPDFmod = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default as any;
    const doc = new jsPDFmod.jsPDF();

    const now = new Date();
    const generatedAt = now.toLocaleString("es-MX");

    doc.setFontSize(14);
    doc.text("Finanzas familiares - Reporte mensual", 14, 18);
    doc.setFontSize(11);
    doc.text(`Mes: ${monthLabel}`, 14, 26);
    doc.text(`Generado: ${generatedAt}`, 14, 32);

    let y = 42;
    doc.setFontSize(10);
    doc.text(`Ingresos del mes: ${formatMoney(totalIngresos)}`, 14, y);
    y += 6;
    doc.text(`Gastos del mes: ${formatMoney(totalGastos)}`, 14, y);
    y += 6;
    doc.text(`Flujo (Ingresos - Gastos): ${formatMoney(flujo)}`, 14, y);
    y += 6;

    if (budget != null) {
      doc.text(
        `Presupuesto definido: ${formatMoney(budget)} · Disponible: ${disponible != null ? formatMoney(disponible) : "-"}`,
        14,
        y
      );
      y += 6;
    }

    const txForPdf = filteredTransactions.slice(0, 80);
    const body = txForPdf.map((t) => [
      formatDateDisplay(t.date),
      t.type === "ingreso" ? "Ingreso" : "Gasto",
      t.category,
      formatMoney(t.amount),
      t.method,
      t.notes ?? "",
    ]);

    autoTable(doc, {
      head: [["Fecha", "Tipo", "Categoría", "Monto", "Método", "Notas"]],
      body,
      startY: y,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      columnStyles: { 3: { halign: "right" } },
      theme: "grid",
    });

    const fileMonth = month.replace("-", "_");
    doc.save(`reporte_finanzas_${fileMonth}.pdf`);
  };

  // =========================================================
  // CRUD movimientos
  // =========================================================
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) {
      alert("Debes iniciar sesión para guardar movimientos.");
      return;
    }

    const amountNumber = toNumberSafe(form.amount);
    if (!form.date) return alert("Selecciona una fecha.");
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) return alert("Ingresa un monto válido mayor a 0.");

    const spenderLabel = form.spenderLabel || "Yo";
    const goalId = form.goalId || "";

    const basePayload = {
      date: form.date,
      type: form.type,
      category: form.category,
      amount: amountNumber,
      method: form.method,
      notes: form.notes || null,
      spender_label: spenderLabel,
      goal_id: goalId || null,
      family_group_id: familyCtx?.familyId ?? null,
    };

    const selectedCard = selectedCardId ? cards.find((c) => c.id === selectedCardId) : undefined;
    const ownerUserId = selectedCard?.owner_id ?? user.id;
    const spenderUserId = user.id;

    setSaving(true);

    try {
      // Offline
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`) as string;

        const localTx: Tx = {
          id,
          ...basePayload,
          owner_user_id: ownerUserId,
          spender_user_id: spenderUserId,
          created_by: user.id,
          card_id: selectedCardId ?? null,
          localOnly: true,
        };

        setTransactions((prev) => upsertAndSortTx(prev, localTx));

        try {
          await saveOfflineTx({
  id: localTx.id,
  date: localTx.date,
  type: localTx.type,
  category: localTx.category,
  amount: localTx.amount,
  method: localTx.method,
  notes: localTx.notes ?? null,

  // ✅ CLAVE: para que getOfflineTxs(uid) funcione
  user_id: user.id,

  owner_user_id: ownerUserId ?? user.id,
  spender_user_id: spenderUserId ?? user.id,
  spender_label: spenderLabel ?? "Yo",
  created_by: user.id,

  card_id: selectedCardId ?? null,
  family_group_id: familyCtx?.familyId ?? null,
  goal_id: goalId || null,
});

        } catch (err) {
          console.error("Error guardando movimiento offline", err);
        }

        alert("Estás sin conexión. El movimiento se guardó en este dispositivo y se sincronizará cuando vuelva internet.");
        clearDraft();
        resetForm();
        return;
      }

      // Online
      if (editingId) {
        const { error } = await supabase
          .from("transactions")
          .update({
            ...basePayload,
            user_id: user.id,
            owner_user_id: ownerUserId,
            spender_user_id: spenderUserId,
            card_id: selectedCardId ?? null,
            created_by: user.id,
          })
          .eq("id", editingId);

        if (error) throw error;

        setTransactions((prev) => {
          const next = prev.map((t) =>
            t.id === editingId
              ? {
                  ...t,
                  ...basePayload,
                  owner_user_id: ownerUserId,
                  spender_user_id: spenderUserId,
                  created_by: user.id,
                  card_id: selectedCardId ?? null,
                }
              : t
          );
          return sortTxs(next);
        });
      } else {
        const { data, error } = await supabase
          .from("transactions")
          .insert({
            ...basePayload,
            user_id: user.id,
            owner_user_id: ownerUserId,
            spender_user_id: spenderUserId,
            spender_label: spenderLabel,
            created_by: user.id,
            card_id: selectedCardId ?? null,
          })
          .select(
            "id,date,type,category,amount,method,notes,user_id,owner_user_id,spender_user_id,spender_label,created_by,card_id,family_group_id,goal_id,created_at"
          )
          .single();

        if (error) throw error;

        const newTx: Tx = {
          id: data.id,
          date: data.date,
          type: data.type,
          category: data.category,
          amount: Number(data.amount),
          method: data.method,
          notes: data.notes,
          user_id: data.user_id ?? null,
          owner_user_id: data.owner_user_id ?? null,
          spender_user_id: data.spender_user_id ?? null,
          spender_label: data.spender_label ?? null,
          created_by: data.created_by ?? null,
          card_id: data.card_id ?? null,
          family_group_id: data.family_group_id ?? null,
          goal_id: data.goal_id ?? null,
          created_at: data.created_at ?? null,
        };

        setTransactions((prev) => upsertAndSortTx(prev, newTx));
      }

      clearDraft();
      resetForm();
      setShowAdvanced(false);
    } catch (err) {
      console.error("Error en handleSubmit:", err);
      setError("No se pudo guardar el movimiento.");
      alert("No se pudo guardar el movimiento.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (tx: Tx) => {
    const inferredSpender = tx.spender_label ?? (tx.spender_user_id === user?.id ? "Yo" : "Otro");

    setForm({
      date: tx.date,
      type: tx.type,
      category: tx.category,
      amount: String(tx.amount),
      method: tx.method,
      notes: tx.notes ?? "",
      spenderLabel: inferredSpender,
      goalId: tx.goal_id ?? "",
    });

    setSelectedCardId(tx.card_id ?? null);
    setEditingId(tx.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDuplicate = (tx: Tx) => {
    setForm({
      date: tx.date || todayYMD(),
      type: tx.type,
      category: tx.category,
      amount: String(tx.amount),
      method: tx.method,
      notes: tx.notes ?? "",
      spenderLabel: tx.spender_label ?? (tx.spender_user_id === user?.id ? "Yo" : "Otro"),
      goalId: tx.goal_id ?? "",
    });
    setSelectedCardId(tx.card_id ?? null);
    setEditingId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (tx: Tx) => {
    if (!isOnline) return alert("No puedes eliminar movimientos mientras estás sin conexión.");
    if (!user) return alert("Debes iniciar sesión para eliminar movimientos.");

    try {
      // Nota: deja que RLS valide permisos; no amarremos a user_id porque puede ser legacy/NULL
      const { error } = await supabase.from("transactions").delete().eq("id", tx.id);
      if (error) throw error;
      setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
    } catch (err) {
      console.error(err);
      alert("No se pudo eliminar el movimiento.");
    }
  };

  // =========================================================
  // Custom cat/method
  // =========================================================
  const handleAddCategory = () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;

    const value = trimmed.toUpperCase().replace(/\s+/g, "_");
    if (categories.some((c) => c.value === value)) return alert("Esa categoría ya existe.");

    const updated = [...categories, { label: trimmed, value }];
    setCategories(updated);
    setNewCategory("");
    if (typeof window !== "undefined") localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(updated));
  };

  const handleAddMethod = () => {
    const trimmed = newMethod.trim();
    if (!trimmed) return;

    const value = trimmed.toUpperCase().replace(/\s+/g, "_");
    if (methods.some((m) => m.value === value)) return alert("Ese método ya existe.");

    const updated = [...methods, { label: trimmed, value }];
    setMethods(updated);
    setNewMethod("");
    if (typeof window !== "undefined") localStorage.setItem(CUSTOM_METHODS_KEY, JSON.stringify(updated));
  };

  // =========================================================
  // Tarjetas CRUD
  // =========================================================
  const handleAddCard = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const trimmed = newCardName.trim();
    if (!trimmed) return alert("Escribe un nombre para la tarjeta (ej. BBVA Negra David).");

    setSavingCard(true);
    setCardError(null);

    const ownerId = familyCtx?.ownerUserId ?? user.id;
    const familyId = familyCtx?.familyId ?? null;

    try {
      const { data, error } = await supabase
        .from("cards")
        .insert({
          owner_id: ownerId,
          family_id: familyId,
          name: trimmed,
          default_method: null,
          shared_with_family: newCardShared,
        })
        .select("id,name,default_method,owner_id,family_id,shared_with_family")
        .single();

      if (error || !data) throw error;

      const newCard: CardType = {
        id: data.id,
        name: data.name,
        default_method: data.default_method ?? null,
        owner_id: data.owner_id,
        family_id: data.family_id ?? null,
        shared_with_family: data.shared_with_family ?? false,
      };

      setCards((prev) => [...prev, newCard]);
      setNewCardName("");
      setNewCardShared(false);
    } catch (err) {
      console.error("Error creando tarjeta:", err);
      setCardError("No se pudo crear la tarjeta.");
    } finally {
      setSavingCard(false);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!user) return;
    const ok = confirm("¿Seguro que quieres eliminar esta tarjeta? No se borran tus movimientos, sólo la etiqueta.");
    if (!ok) return;

    const ownerId = familyCtx?.ownerUserId ?? user.id;

    try {
      const { error } = await supabase.from("cards").delete().eq("id", cardId).eq("owner_id", ownerId);
      if (error) throw error;
      setCards((prev) => prev.filter((c) => c.id !== cardId));
      if (selectedCardId === cardId) setSelectedCardId(null);
    } catch (err) {
      console.error("Error eliminando tarjeta", err);
      alert("No se pudo eliminar la tarjeta.");
    }
  };

  const handleToggleCardSharing = async (cardId: string, current: boolean | null | undefined) => {
    if (!user || !familyCtx) return;
    if (!canUseFamilyScope) return alert("Sólo el jefe de familia puede cambiar si una tarjeta se comparte o no.");

    const newValue = !current;
    const ownerId = familyCtx?.ownerUserId ?? user.id;

    try {
      const { error } = await supabase.from("cards").update({ shared_with_family: newValue }).eq("id", cardId).eq("owner_id", ownerId);
      if (error) throw error;
      setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, shared_with_family: newValue } : c)));
    } catch (err) {
      console.error("Error actualizando tarjeta compartida:", err);
      alert("No se pudo actualizar si la tarjeta está compartida con la familia.");
    }
  };

  // =========================================================
  // Auto UX: al entrar en scope familia, abrir por persona
  // =========================================================
  useEffect(() => {
    if (viewScope === "family" && canUseFamilyScope) setShowGastosPorPersona(true);
  }, [viewScope, canUseFamilyScope]);

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
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">Finanzas familiares</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Registra tus ingresos y gastos en un solo lugar.</p>
            </div>
            <ThemeToggle />
          </div>

          <h2 className="text-sm font-medium">{authMode === "login" ? "Inicia sesión" : "Crea tu cuenta"}</h2>

          <form onSubmit={authMode === "login" ? handleSignIn : handleSignUp} className="space-y-3 text-sm">
            <div>
              <Label>Correo electrónico</Label>
              <UIInput type="email" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" />
            </div>

            <div>
              <Label>Contraseña</Label>
              <UIInput type="password" required value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
            </div>

            {authError && <p className="text-xs text-rose-500">{authError}</p>}

            <Button type="submit">{authMode === "login" ? "Entrar" : "Crear cuenta"}</Button>
          </form>

          <div className="text-center text-xs text-slate-600 dark:text-slate-300">
            {authMode === "login" ? (
              <>
                ¿No tienes cuenta?{" "}
                <button className="text-sky-600 underline" onClick={() => { setAuthMode("signup"); setAuthError(null); }}>
                  Crear una nueva
                </button>
              </>
            ) : (
              <>
                ¿Ya tienes cuenta?{" "}
                <button className="text-sky-600 underline" onClick={() => { setAuthMode("login"); setAuthError(null); }}>
                  Inicia sesión
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================
  // Render APP
  // =========================================================
  return (
    <PageShell>
      <AppHeader
        title="Gastos e ingresos"
        subtitle="Aquí capturas todos los movimientos del día a día."
        activeTab="gastos"
        userEmail={user.email}
        userId={user.id}
        onSignOut={handleSignOut}
      />

      {/* Controles mes + export + scope + conexión */}
      <Card>
        <Section
          title="Mes"
          subtitle="Elige el mes, exporta y (si eres jefe) alterna entre Solo yo / Familia."
          right={
            <div className="flex flex-col items-end gap-2">
              <div
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
                  isOnline
                    ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                    : "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-green-500" : "bg-yellow-500"}`} />
                {isOnline ? "Conectado" : "Sin conexión (modo local)"}
              </div>

              {familyCtx && canUseFamilyScope ? (
                <SegmentedControl<"mine" | "family">
                  value={viewScope}
                  onChange={(v) => setViewScope(v)}
                  label="Vista"
                  help="Familia suma movimientos de miembros activos."
                  options={[
                    { value: "mine", label: "Solo yo" },
                    { value: "family", label: "Familia" },
                  ]}
                />
              ) : familyCtx ? (
                <div className="text-right text-[11px] text-slate-500 dark:text-slate-400">
                  Vista “Familia” sólo para el jefe de familia.
                </div>
              ) : null}
            </div>
          }
        >
          <div className="grid gap-3 md:grid-cols-3 md:items-end">
            <div>
              <Label>Mes</Label>
              <UIInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label={`Mes: ${monthLabel}`} />
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowExportOptions((v) => !v)}>
                {showExportOptions ? "Cerrar exportar" : "Exportar"}
              </Button>

              <Button type="button" onClick={() => (window.location.href = "/patrimonio")} title="Ir a Patrimonio">
                Ver Patrimonio
              </Button>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {familyLoading ? "Cargando familia…" : familyError ? familyError : familyCtx ? `Familia: ${familyCtx.familyName}` : "Sin familia vinculada"}
            </div>
          </div>

          {showExportOptions && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-950">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Exportar movimientos
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {(["todos", "ingresos", "gastos"] as ExportType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setExportType(t)}
                      className={`rounded-full border px-3 py-1 text-[11px] ${
                        exportType === t
                          ? "border-slate-900 bg-slate-900 text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900"
                          : "border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      }`}
                    >
                      {t === "todos" ? "Todos" : t === "ingresos" ? "Sólo ingresos" : "Sólo gastos"}
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border border-slate-300 dark:border-slate-600"
                    checked={exportIncludeCategorySummary}
                    onChange={(e) => setExportIncludeCategorySummary(e.target.checked)}
                  />
                  <span className="text-[11px] text-slate-700 dark:text-slate-200">
                    Incluir resumen de gastos por categoría al final
                  </span>
                </label>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleExportCsv} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700">
                    Descargar CSV
                  </button>
                  <button type="button" onClick={handleExportPdf} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-black dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white">
                    Descargar PDF del mes
                  </button>
                </div>
              </div>
            </div>
          )}
        </Section>
      </Card>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ingresos del mes" value={formatMoney(totalIngresos)} tone="good" />
        <StatCard label="Gastos del mes" value={formatMoney(totalGastos)} tone="bad" />
        <StatCard label="Flujo (Ingresos - Gastos)" value={formatMoney(flujo)} tone={flujo >= 0 ? "good" : "bad"} />
        <Card>
          <Section title="Presupuesto del mes" subtitle="Guarda tu tope mensual (local en este dispositivo).">
            <div className="flex gap-2">
              <UIInput type="number" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} placeholder="Ej. 50000" />
              {String(budget ?? "") !== budgetInput && (
                <Button type="button" onClick={handleSaveBudget} className="w-auto px-4">
                  Guardar
                </Button>
              )}
            </div>
            {budget != null && (
              <div className={`mt-2 text-xs ${disponible != null && disponible < 0 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                Disponible: {disponible != null ? formatMoney(disponible) : "-"}
              </div>
            )}
          </Section>
        </Card>
      </div>

      {/* Resumen inteligente */}
      <Card>
        <Section title="Resumen inteligente del mes" subtitle="Incluye impacto estimado a Patrimonio (flujo neto).">
          {smartSummary.length === 0 ? (
            <EmptyState>Aún no hay suficiente información para generar un resumen.</EmptyState>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-xs text-slate-700 dark:text-slate-200">
              {smartSummary.map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
          )}
        </Section>
      </Card>

      {/* Tarjetas */}
      <Card>
        <Section
          title="Tarjetas ligadas"
          subtitle="Si las compartes, los gastos de tu familia con esa tarjeta también se reflejan en tu resumen."
          right={
            <Button type="button" variant="secondary" onClick={() => setShowCardsList((v) => !v)} className="w-auto">
              {showCardsList ? "Ocultar" : `Ver (${cards.length})`}
            </Button>
          }
        >
          <form onSubmit={handleAddCard} className="mt-2 grid gap-3 md:grid-cols-3 md:items-end">
            <div className="md:col-span-2">
              <Label>Nombre de la tarjeta</Label>
              <UIInput value={newCardName} onChange={(e) => setNewCardName(e.target.value)} placeholder="Ej. BBVA Negra David, Amex Platino…" />
              {familyCtx && canUseFamilyScope && (
                <label className="mt-2 flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border border-slate-300 dark:border-slate-600"
                    checked={newCardShared}
                    onChange={(e) => setNewCardShared(e.target.checked)}
                  />
                  <span className="text-[11px] text-slate-600 dark:text-slate-300">
                    Compartir esta tarjeta con mi familia
                  </span>
                </label>
              )}
              {cardError && <p className="mt-2 text-xs text-rose-500">{cardError}</p>}
            </div>

            <Button type="submit" disabled={savingCard}>
              {savingCard ? "Guardando..." : "Agregar tarjeta"}
            </Button>
          </form>

          <div className="mt-4">
            {!showCardsList ? (
              <EmptyState>Lista oculta para mantener la pantalla limpia.</EmptyState>
            ) : cards.length === 0 ? (
              <EmptyState>Aún no tienes tarjetas registradas.</EmptyState>
            ) : (
              <ul className="space-y-2">
                {cards.map((c) => (
                  <ListItem
                    key={c.id}
                    left={
                      <>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{c.name}</div>
                        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          Estado: {c.shared_with_family ? "Compartida" : "Sólo tú"}
                        </div>
                      </>
                    }
                    right={
                      <div className="flex flex-col items-end gap-2">
                        {canUseFamilyScope && (
                          <button
                            type="button"
                            onClick={() => handleToggleCardSharing(c.id, c.shared_with_family)}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          >
                            {c.shared_with_family ? "Dejar de compartir" : "Compartir con familia"}
                          </button>
                        )}
                        <LinkButton tone="danger" onClick={() => handleDeleteCard(c.id)}>
                          Eliminar
                        </LinkButton>
                      </div>
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        </Section>
      </Card>

      {/* Gráficas */}
<Card>
  <Section
    title="Gráficas"
    subtitle="Visualiza categorías y tendencia por día."
    right={
      <button
        type="button"
        onClick={() => setShowCharts((v) => !v)}
        className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-medium text-white hover:bg-sky-600"
      >
        {showCharts ? "Ocultar" : "Ver"}
      </button>
    }
  >
    {!showCharts ? (
      <EmptyState>Gráficas ocultas. Ábrelas cuando quieras revisar tendencias.</EmptyState>
    ) : (
      <GastosCharts
        isDark={isDark}
        chartDataCategorias={chartDataCategorias}
        chartDataLinea={chartDataLinea}
      />
    )}
  </Section>
</Card>

      {/* Formulario */}
      <Card>
        <Section
          title={editingId ? "Editar movimiento" : "Agregar movimiento"}
          subtitle="Atajos: ⌘/Ctrl+Enter guardar · Esc cancelar · ⌘/Ctrl+K buscar"
          right={editingId ? <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Editando</span> : null}
        >
          {!editingId && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-slate-400 dark:text-slate-500">Plantillas:</span>
              {QUICK_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {tpl.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  clearDraft();
                  resetForm();
                }}
                className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-medium text-white hover:bg-black dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
              >
                Limpiar
              </button>
            </div>
          )}

          <form id="ff-gastos-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-7">
              <div className="md:col-span-2">
                <Label>Tarjeta</Label>
                <Select value={selectedCardId ?? ""} onChange={(e) => handleChangeCard(e.target.value ? e.target.value : null)}>
                  <option value="">Sin tarjeta específica</option>
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="md:col-span-2">
                <SegmentedControl<TxType>
                  value={form.type}
                  onChange={(v) => handleChangeForm("type", v)}
                  label="Tipo"
                  options={[
                    { value: "ingreso", label: "Ingreso" },
                    { value: "gasto", label: "Gasto" },
                  ]}
                />
              </div>

              <div>
                <Label>Fecha</Label>
                <UIInput type="date" value={form.date} onChange={(e) => handleChangeForm("date", e.target.value)} />
              </div>

              <div>
                <Label>Categoría</Label>
                <Select value={form.category} onChange={(e) => handleChangeForm("category", e.target.value)}>
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>Monto</Label>
                <UIInput type="number" step="0.01" value={form.amount} onChange={(e) => handleChangeForm("amount", e.target.value)} placeholder="0.00" />
              </div>

              <div>
                <Label>Método</Label>
                <Select value={form.method} onChange={(e) => handleChangeForm("method", e.target.value)}>
                  {methods.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>Quién generó</Label>
                <Select value={form.spenderLabel} onChange={(e) => handleChangeForm("spenderLabel", e.target.value)}>
                  {SPENDER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Opciones avanzadas</div>
              <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400">
                {showAdvanced ? "Ocultar" : "Mostrar"}
              </button>
            </div>

            {showAdvanced && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Objetivo familiar (opcional)</Label>
                    <Select value={form.goalId} onChange={(e) => handleChangeForm("goalId", e.target.value)}>
                      <option value="">Sin objetivo</option>
                      {goals.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </Select>
                    <Help>Si eliges una meta, este movimiento contará para el avance del dashboard familiar.</Help>
                  </div>

                  <div>
                    <Label>Notas</Label>
                    <Textarea value={form.notes} onChange={(e) => handleChangeForm("notes", e.target.value)} placeholder="Descripción, quién pagó, folio, etc." />
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Nueva categoría</Label>
                    <div className="flex gap-2">
                      <UIInput value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Ej. Vacaciones…" />
                      <Button type="button" className="w-auto px-4" onClick={handleAddCategory}>
                        +
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label>Nuevo método</Label>
                    <div className="flex gap-2">
                      <UIInput value={newMethod} onChange={(e) => setNewMethod(e.target.value)} placeholder="Ej. Tarjeta Amazon…" />
                      <Button type="button" className="w-auto px-4" onClick={handleAddMethod}>
                        +
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Agregar"}
              </Button>

              {editingId && (
                <Button type="button" variant="secondary" onClick={() => { resetForm(); setShowAdvanced(false); }}>
                  Cancelar edición
                </Button>
              )}

              {error && <span className="text-xs text-rose-600 dark:text-rose-400">{error}</span>}
            </div>
          </form>
        </Section>
      </Card>

      {/* Filtros */}
      <Card>
        <Section title="Filtros de movimientos" subtitle="Los totales se calculan con los movimientos filtrados.">
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Ingresos filtrados" value={formatMoney(filteredIngresos)} tone="good" />
            <StatCard label="Gastos filtrados" value={formatMoney(filteredGastos)} tone="bad" />
            <StatCard label="Flujo filtrado" value={formatMoney(filteredFlujo)} tone={filteredFlujo >= 0 ? "good" : "bad"} />
          </div>

          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            Calculados con <span className="font-semibold">{filteredTransactions.length}</span> movimientos.
          </p>

          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <div>
              <Label>Tipo</Label>
              <Select value={filterType} onChange={(e) => setFilterType(e.target.value as any)}>
                <option value="todos">Todos</option>
                <option value="ingreso">Ingresos</option>
                <option value="gasto">Gastos</option>
              </Select>
            </div>

            <div>
              <Label>Categoría</Label>
              <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                <option value="TODAS">Todas</option>
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Método</Label>
              <Select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)}>
                <option value="TODOS">Todos</option>
                {methods.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Buscar</Label>
              <RefInput
                ref={searchInputRef}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Notas, categoría, fecha..."
              />
            </div>
          </div>
        </Section>
      </Card>

      {/* Visor por categoría */}
      <Card>
        <Section title="Gastos por categoría" subtitle="Distribución del mes actual.">
          {gastosPorCategoria.length === 0 ? (
            <EmptyState>Aún no hay gastos registrados en este mes.</EmptyState>
          ) : (
            <div className="space-y-2">
              {gastosPorCategoria.map((item) => (
                <div key={item.category} className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-700 dark:text-slate-200">
                    <span>{item.category}</span>
                    <span>
                      {formatMoney(item.total)}{" "}
                      <span className="text-slate-400 dark:text-slate-500">({item.percent.toFixed(1)}%)</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
                    <div className="h-2 rounded bg-sky-500" style={{ width: `${Math.max(item.percent, 2)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </Card>

      {/* Gastos por persona (familia) */}
      {viewScope === "family" && canUseFamilyScope && familyCtx && (
        <Card>
          <Section
            title="Gastos por persona (familia)"
            subtitle="Sólo gastos del mes actual, por quién generó."
            right={
              <button type="button" onClick={() => setShowGastosPorPersona((v) => !v)} className="text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400">
                {showGastosPorPersona ? "Ocultar" : "Ver"}
              </button>
            }
          >
            {!showGastosPorPersona ? (
              <EmptyState>Oculto. Ábrelo cuando quieras revisar distribución por persona.</EmptyState>
            ) : gastosPorPersona.length === 0 ? (
              <EmptyState>Aún no hay gastos por persona en este mes.</EmptyState>
            ) : (
              <div className="space-y-2">
                {gastosPorPersona.map((item) => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-700 dark:text-slate-200">
                      <span>{item.label}</span>
                      <span>
                        {formatMoney(item.total)}{" "}
                        <span className="text-slate-400 dark:text-slate-500">({item.percent.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
                      <div className="h-2 rounded bg-emerald-500" style={{ width: `${Math.max(item.percent, 2)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </Card>
      )}

      {/* Tabla */}
      <Card>
        <Section title={`Movimientos de ${month}`} subtitle={`Mostrando ${filteredTransactions.length} de ${transactions.length} movimientos`}>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border border-slate-200 text-left text-xs dark:border-slate-700 md:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Fecha</th>
                  <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Tipo</th>
                  <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Categoría</th>
                  <th className="border-b border-slate-200 px-2 py-2 text-right dark:border-slate-700">Monto</th>
                  <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Método</th>
                  <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Tarjeta</th>
                  <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Generó</th>
                  <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Notas</th>
                  <th className="border-b border-slate-200 px-2 py-2 text-center dark:border-slate-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={9} className="py-4 text-center text-slate-500 dark:text-slate-400">
                      Cargando movimientos...
                    </td>
                  </tr>
                )}

                {!loading && filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-4 text-center text-slate-500 dark:text-slate-400">
                      Sin movimientos registrados con esos filtros.
                    </td>
                  </tr>
                )}

                {!loading &&
                  filteredTransactions.map((t) => {
                    const goal = t.goal_id ? goalsById.get(t.goal_id) : undefined;
                    const cardName = t.card_id ? cards.find((c) => c.id === t.card_id)?.name : undefined;

                    return (
                      <tr
                        key={t.id}
                        className={`odd:bg-white even:bg-slate-50 dark:odd:bg-slate-800 dark:even:bg-slate-900 hover:bg-sky-50 dark:hover:bg-slate-800/80 transition-colors ${
                          t.localOnly ? "opacity-80" : ""
                        } ${t.type === "ingreso" ? "border-l-4 border-l-emerald-400" : "border-l-4 border-l-rose-400"}`}
                      >
                        <td className="border-t border-slate-200 px-2 py-2 dark:border-slate-700">{formatDateDisplay(t.date)}</td>

                        <td className="border-t border-slate-200 px-2 py-2 dark:border-slate-700">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              t.type === "ingreso"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                                : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200"
                            }`}
                          >
                            {t.type === "ingreso" ? "Ingreso" : "Gasto"}
                          </span>
                        </td>

                        <td className="border-t border-slate-200 px-2 py-2 dark:border-slate-700">{t.category}</td>

                        <td className="border-t border-slate-200 px-2 py-2 text-right dark:border-slate-700">
                          <div className="inline-flex items-center gap-2 justify-end">
                            <span className={`font-semibold ${t.type === "ingreso" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                              {formatMoney(t.amount)}
                            </span>
                            {t.localOnly && (
                              <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200">
                                Offline
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="border-t border-slate-200 px-2 py-2 dark:border-slate-700">
                          <span className="inline-flex max-w-[160px] items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            <span className="truncate">{t.method}</span>
                          </span>
                        </td>

                        <td className="border-t border-slate-200 px-2 py-2 dark:border-slate-700">
                          {cardName ? (
                            <span className="inline-flex max-w-[160px] items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                              <span className="truncate">{cardName}</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>

                        <td className="border-t border-slate-200 px-2 py-2 dark:border-slate-700">
                          <span className="text-xs text-slate-700 dark:text-slate-200">{getSpenderLabel(t)}</span>
                        </td>

                        <td className="border-t border-slate-200 px-2 py-2 dark:border-slate-700">
                          {goal && (
                            <span className="mb-0.5 mr-1 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                              Meta: {goal.name}
                            </span>
                          )}

                          {t.notes ? (
                            <span className="mt-0.5 block max-w-xs truncate text-xs text-slate-600 dark:text-slate-300" title={t.notes}>
                              {t.notes}
                            </span>
                          ) : (
                            !goal && <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>

                        <td className="border-t border-slate-200 px-2 py-2 text-center dark:border-slate-700">
                          <button type="button" onClick={() => handleEdit(t)} className="mr-2 text-xs text-sky-600 hover:underline">
                            Editar
                          </button>

                          <button type="button" onClick={() => handleDuplicate(t)} className="mr-2 text-xs text-slate-600 hover:underline dark:text-slate-300">
                            Duplicar
                          </button>

                          <button type="button" onClick={() => handleDelete(t)} className="text-xs text-rose-600 hover:underline">
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Section>
      </Card>
    </PageShell>
  );
}
