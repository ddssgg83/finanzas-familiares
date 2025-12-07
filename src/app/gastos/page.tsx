"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { saveOfflineTx, getOfflineTxs, syncOfflineTxs } from "@/lib/offline";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { useTheme } from "next-themes";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

type TxType = "ingreso" | "gasto";

type Tx = {
  id: string;
  date: string; // yyyy-mm-dd
  type: TxType;
  category: string;
  amount: number;
  method: string;
  notes?: string | null;
  created_by?: string | null;
  card_id?: string | null;

  // NUEVO (opcionales, para compatibilidad con datos viejos y offline)
  owner_user_id?: string | null; // quién paga realmente (dueño de la familia)
  spender_user_id?: string | null; // quién lo registró (normalmente user.id)
  spender_label?: string | null; // "Yo", "Esposa", "Hijo", etc.

  localOnly?: boolean;
};

type FormState = {
  date: string;
  type: TxType;
  category: string;
  amount: string;
  method: string;
  notes: string;
  spenderLabel: string; // NUEVO: quién generó
};

type Option = { label: string; value: string };
type ExportType = "todos" | "ingresos" | "gastos";

type FamilyContext = {
  familyId: string;
  familyName: string;
  ownerUserId: string;
  memberId: string;
  role: "owner" | "member";
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

// NUEVO: opciones para "Quién generó"
const SPENDER_OPTIONS: Option[] = [
  { label: "Yo", value: "Yo" },
  { label: "Esposa", value: "Esposa" },
  { label: "Hijo / Hija", value: "Hijo / Hija" },
  { label: "Otro", value: "Otro" },
];

const CUSTOM_CATEGORIES_KEY = "ff-custom-categories";
const CUSTOM_METHODS_KEY = "ff-custom-methods";

function getCurrentMonthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`; // 2025-11
}

function formatMoney(num: number) {
  return num.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  });
}

// 📅 Mostrar fecha sin problema de zona horaria
function formatDateDisplay(ymd: string) {
  const s = (ymd ?? "").slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default function GastosPage() {
  // 🔐 AUTH
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  // 💰 Movimientos
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<Option[]>(DEFAULT_CATEGORIES);
  const [methods, setMethods] = useState<Option[]>(DEFAULT_METHODS);
  const [newCategory, setNewCategory] = useState("");
  const [newMethod, setNewMethod] = useState("");

  const [month, setMonth] = useState<string>(() => getCurrentMonthKey());
  const [form, setForm] = useState<FormState>({
    date: "",
    type: "gasto",
    category: DEFAULT_CATEGORIES[0]?.value ?? "",
    amount: "",
    method: DEFAULT_METHODS[0]?.value ?? "",
    notes: "",
    spenderLabel: SPENDER_OPTIONS[0]?.value ?? "Yo",
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  // Saber si el usuario es jefe de familia
const [isFamilyOwner, setIsFamilyOwner] = useState(false);


  // Presupuesto
  const [budgetInput, setBudgetInput] = useState("");
  const [budget, setBudget] = useState<number | null>(null);

  // Online / offline
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // Export
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [exportType, setExportType] = useState<ExportType>("todos");
  const [exportIncludeCategorySummary, setExportIncludeCategorySummary] =
    useState(true);

  // Filtros de movimientos
  const [filterType, setFilterType] = useState<"todos" | "ingreso" | "gasto">(
    "todos"
  );
  const [filterCategory, setFilterCategory] = useState<string>("TODAS");
  const [filterMethod, setFilterMethod] = useState<string>("TODOS");
  const [searchText, setSearchText] = useState<string>("");

  // 💳 Tarjetas
  type Card = {
  id: string;
  name: string;
  default_method: string | null;
  owner_id: string;
  family_id: string | null;
  shared_with_family: boolean; // ya no null ni opcional
};

  const [cards, setCards] = useState<Card[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  // Cuando cambias la tarjeta en el formulario
  const handleChangeCard = (cardId: string | null) => {
    setSelectedCardId(cardId);

    // Si selecciona "Sin tarjeta específica"
    if (!cardId) return;

    const found = cards.find((c) => c.id === cardId);
    if (!found) return;

    // Si la tarjeta tiene default_method lo usamos, si no normalizamos el nombre
    const methodValue =
      found.default_method ?? found.name.toUpperCase().replace(/\s+/g, "_");

    // Actualizamos el formulario
    setForm((prev) => ({
      ...prev,
      method: methodValue,
    }));

    // Nos aseguramos de que ese método exista en la lista de métodos
    setMethods((prev) => {
      if (prev.some((m) => m.value === methodValue)) return prev;

      const updated = [...prev, { label: found.name, value: methodValue }];

      if (typeof window !== "undefined") {
        localStorage.setItem(CUSTOM_METHODS_KEY, JSON.stringify(updated));
      }

      return updated;
    });
  };

  // Formulario rápido para crear tarjetas
  const [newCardName, setNewCardName] = useState("");
  const [savingCard, setSavingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [newCardShared, setNewCardShared] = useState(false);

    const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const trimmed = newCardName.trim();
    if (!trimmed) {
      alert("Escribe un nombre para la tarjeta (ej. BBVA Negra David).");
      return;
    }

    setSavingCard(true);
    setCardError(null);

    // dueño financiero real (si hay familia usamos al owner de la familia)
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
        .select(
          "id,name,default_method,owner_id,family_id,shared_with_family"
        )
        .single();

      if (error || !data) throw error;

      const newCard: Card = {
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
    const ok = confirm(
      "¿Seguro que quieres eliminar esta tarjeta? No se borran tus movimientos, sólo la etiqueta."
    );
    if (!ok) return;

    try {
      const { error } = await supabase
        .from("cards")
        .delete()
        .eq("id", cardId)
        .eq("owner_id", user.id);

      if (error) throw error;

      setCards((prev) => prev.filter((c) => c.id !== cardId));
      if (selectedCardId === cardId) {
        setSelectedCardId(null);
      }
    } catch (err) {
      console.error("Error eliminando tarjeta", err);
      alert("No se pudo eliminar la tarjeta.");
    }
  };

    const handleToggleShareCard = async (card: Card) => {
    if (!user) return;

    if (!isFamilyOwner) {
      alert(
        "Sólo el jefe de familia puede cambiar si una tarjeta se comparte con la familia."
      );
      return;
    }

    try {
      const { error } = await supabase
        .from("cards")
        .update({ shared_with_family: !card.shared_with_family })
        .eq("id", card.id)
        .eq("owner_id", card.owner_id);

      if (error) throw error;

      setCards((prev) =>
        prev.map((c) =>
          c.id === card.id
            ? { ...c, shared_with_family: !card.shared_with_family }
            : c
        )
      );
    } catch (err) {
      console.error("Error actualizando tarjeta:", err);
      alert("No se pudo actualizar si la tarjeta se comparte o no.");
    }
  };

  const handleToggleCardSharing = async (
    cardId: string,
    current: boolean | null | undefined
  ) => {
    if (!user || !familyCtx) return;

    if (!isFamilyOwner) {
      alert(
        "Sólo el jefe de familia puede cambiar si una tarjeta se comparte o no con la familia."
      );
      return;
    }

    const newValue = !current;

    try {
      const { error } = await supabase
        .from("cards")
        .update({ shared_with_family: newValue })
        .eq("id", cardId)
        .eq("owner_id", user.id);

      if (error) throw error;

      setCards((prev) =>
        prev.map((c) =>
          c.id === cardId ? { ...c, shared_with_family: newValue } : c
        )
      );
    } catch (err) {
      console.error("Error actualizando tarjeta compartida:", err);
      alert(
        "No se pudo actualizar si la tarjeta está compartida con la familia."
      );
    }
  };

  // 🌙 Tema global (para saber si es dark y ajustar gráficos)
  const { theme, systemTheme } = useTheme();
  const [mountedTheme, setMountedTheme] = useState(false);

  useEffect(() => {
    setMountedTheme(true);
  }, []);

  const currentTheme = theme === "system" ? systemTheme : theme;
  const isDark = mountedTheme && currentTheme === "dark";

  // 👪 CONTEXTO DE FAMILIA
  const [familyCtx, setFamilyCtx] = useState<FamilyContext | null>(null);
  const [familyCtxLoading, setFamilyCtxLoading] = useState(false);
  const [familyCtxError, setFamilyCtxError] = useState<string | null>(null);

  // Scope de vista: solo yo / toda la familia (si es owner)
  const [viewScope, setViewScope] = useState<"mine" | "family">("mine");

  // --------------------------------------------------
  //   AUTH: usuario actual + listener
  // --------------------------------------------------
  useEffect(() => {
    let ignore = false;

    async function loadUser() {
      setAuthLoading(true);
      setAuthError(null);
      try {
        const { data, error } = await supabase.auth.getUser();

        if (error && (error as any).name !== "AuthSessionMissingError") {
          console.error("Error obteniendo usuario actual", error);
        }

        if (!ignore) {
          setUser(data?.user ?? null);
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

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (error) {
        console.error("Error en login", error);
        setAuthError(error.message);
        return;
      }
      setAuthEmail("");
      setAuthPassword("");
    } catch {
      setAuthError("No se pudo iniciar sesión.");
    }
  };
useEffect(() => {
  if (!user) {
    setIsFamilyOwner(false);
    return;
  }

  let cancelled = false;

  const checkOwner = async () => {
    try {
      const { data, error } = await supabase
        .from("families")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (error) {
        console.error("Error revisando si es jefe de familia en /gastos", error);
        if (!cancelled) setIsFamilyOwner(false);
        return;
      }

      if (!cancelled) {
        setIsFamilyOwner((data ?? []).length > 0);
      }
    } catch (err) {
      console.error("Error revisando si es jefe de familia en /gastos", err);
      if (!cancelled) setIsFamilyOwner(false);
    }
  };

  checkOwner();

  return () => {
    cancelled = true;
  };
}, [user]);

  const handleSignUp = async (e: React.FormEvent) => {
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
      setFamilyCtx(null);
    } catch (err) {
      console.error("Error cerrando sesión", err);
    }
  };

  // --------------------------------------------------
  //   Cargar contexto de familia (si pertenece a una)
  // --------------------------------------------------
  useEffect(() => {
    const currentUser = user;
    if (!currentUser) {
      setFamilyCtx(null);
      setFamilyCtxError(null);
      setFamilyCtxLoading(false);
      return;
    }

    const userId = currentUser.id;
    const email = (currentUser.email ?? "").toLowerCase();
    let cancelled = false;

    const loadFamilyCtx = async () => {
      setFamilyCtxLoading(true);
      setFamilyCtxError(null);
      try {
        // 1) Buscar membresía activa usando user_id O invited_email
        const { data: memberRows, error: memberError } = await supabase
          .from("family_members")
          .select("id,family_id,role,status,user_id,invited_email")
          .or(`user_id.eq.${userId},invited_email.eq.${email}`)
          .eq("status", "active")
          .limit(1);

        if (memberError) throw memberError;

        if (!memberRows || memberRows.length === 0) {
          if (!cancelled) {
            setFamilyCtx(null);
          }
          return;
        }

        const member = memberRows[0];

        // 2) Cargar familia
        const { data: fam, error: famError } = await supabase
          .from("families")
          .select("id,name,user_id")
          .eq("id", member.family_id)
          .single();

        if (famError) throw famError;

        if (!cancelled) {
          setFamilyCtx({
            familyId: fam.id,
            familyName: fam.name,
            ownerUserId: fam.user_id,
            memberId: member.id,
            role: member.role as "owner" | "member",
          });
        }
      } catch (err: any) {
        console.error("Error cargando contexto de familia:", err);
        if (!cancelled) {
          setFamilyCtxError("No se pudo cargar la información de familia.");
          setFamilyCtx(null);
        }
      } finally {
        if (!cancelled) setFamilyCtxLoading(false);
      }
    };

    loadFamilyCtx();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (viewScope === "family" && !isFamilyOwner) {
      setViewScope("mine");
    }
  }, [viewScope, isFamilyOwner]);

  // --------------------------------------------------
  //   Cargar listas personalizadas de categorías/métodos
  // --------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const catsRaw = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
      if (catsRaw) {
        const parsed = JSON.parse(catsRaw);
        if (Array.isArray(parsed) && parsed.length) {
          setCategories(parsed);
        }
      }
    } catch (err) {
      console.error("Error cargando categorías personalizadas", err);
    }

    try {
      const methodsRaw = localStorage.getItem(CUSTOM_METHODS_KEY);
      if (methodsRaw) {
        const parsed = JSON.parse(methodsRaw);
        if (Array.isArray(parsed) && parsed.length) {
          setMethods(parsed);
        }
      }
    } catch (err) {
      console.error("Error cargando métodos de pago personalizados", err);
    }
  }, []);

  // --------------------------------------------------
  //   Estado de conexión (online / offline)
  // --------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlerOnline = () => setIsOnline(true);
    const handlerOffline = () => setIsOnline(false);

    window.addEventListener("online", handlerOnline);
    window.addEventListener("offline", handlerOffline);

    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener("online", handlerOnline);
      window.removeEventListener("offline", handlerOffline);
    };
  }, []);

  // --------------------------------------------------
  //   Cargar movimientos guardados offline
  // --------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;

    async function loadOffline() {
      try {
        const offline = await getOfflineTxs();
        if (offline.length) {
          setTransactions((prev) => [
            ...offline.map((t: any) => ({
              ...t,
              localOnly: true,
            })),
            ...prev,
          ]);
        }
      } catch (err) {
        console.error("Error cargando movimientos offline", err);
      }
    }

    loadOffline();
  }, []);

 // --------------------------------------------------
//   Cargar transacciones del mes desde Supabase
// --------------------------------------------------
useEffect(() => {
  const currentUser = user;
  if (!currentUser) {
    setTransactions([]);
    return;
  }

  const userId = currentUser.id;

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [year, monthNumber] = month.split("-");
      const from = `${month}-01`;
      const to = `${month}-${new Date(
        Number(year),
        Number(monthNumber),
        0
      )
        .getDate()
        .toString()
        .padStart(2, "0")}`;

      // Base: rango de fechas
      let query = supabase
        .from("transactions")
        .select("*")
        .gte("date", from)
        .lte("date", to);

      if (isFamilyOwner) {
        if (viewScope === "family") {
          // 👨‍👩‍👧 Vista familiar: todo lo que tenga como owner al jefe
          query = query.eq("owner_user_id", userId);
        } else {
          // 👤 Vista "Solo yo" siendo jefe:
          // - tus propios movimientos personales
          // - y los que se generaron con tus tarjetas compartidas
          query = query.or(
            [
              `user_id.eq.${userId}`, // tus movimientos personales
              `owner_user_id.eq.${userId}` // movimientos de tarjetas que tú compartiste
            ].join(",")
          );
        }
      } else {
        // Usuario normal (no jefe): sólo sus propios movimientos
        query = query.eq("user_id", userId);
      }

      const { data, error } = await query;
      if (error) throw error;

      setTransactions(
        (data ?? []).map((t: any) => ({
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
        }))
      );

      // Cache local por mes
      if (typeof window !== "undefined") {
        localStorage.setItem(
          `ff-cache-${month}`,
          JSON.stringify(data ?? [])
        );
      }
    } catch (err) {
      console.error(err);
      setError("No se pudieron cargar los movimientos.");

      // Intentar leer del cache si hay error
      if (typeof window !== "undefined") {
        const cache = localStorage.getItem(`ff-cache-${month}`);
        if (cache) {
          try {
            const parsed = JSON.parse(cache);
            setTransactions(
              (parsed ?? []).map((t: any) => ({
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
              }))
            );
          } catch {
            // ignoramos error de parseo
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }

  if (typeof window !== "undefined") {
    load();
  }
}, [month, user, isFamilyOwner, viewScope]);

  // --------------------------------------------------
  //   Sincronizar cola offline al volver internet
  // --------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user) return;

    const userId = user.id;
    let cancelled = false;

    const syncAndMark = async () => {
      if (cancelled) return;

      try {
        const synced = await syncOfflineTxs(userId);
        if (!synced.length) return;

        alert(
          `Se sincronizaron ${synced.length} movimientos que estaban guardados sin conexión.`
        );

        const syncedIds = new Set(synced.map((t) => t.id));

        setTransactions((prev) =>
          prev.map((tx) =>
            tx.localOnly && syncedIds.has(tx.id)
              ? { ...tx, localOnly: false }
              : tx
          )
        );
      } catch (err) {
        console.error("Error al sincronizar movimientos offline", err);
      }
    };

    if (navigator.onLine) {
      syncAndMark();
    }

    const handleOnline = () => {
      syncAndMark();
    };

    window.addEventListener("online", handleOnline);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
    };
  }, [user]);

  // --------------------------------------------------
  //   Presupuesto mensual (localStorage)
  // --------------------------------------------------
  useEffect(() => {
    const key = `ff-budget-${month}`;
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(key) : null;

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

   // --------------------------------------------------
  //   Cargar tarjetas de Supabase (según familia)
  // --------------------------------------------------
  useEffect(() => {
    if (!user) {
      setCards([]);
      return;
    }

    const loadCards = async () => {
      // dueño financiero real (si hay familia usamos al owner de la familia)
      const ownerId = familyCtx?.ownerUserId ?? user.id;

      try {
        let query = supabase
          .from("cards")
          .select(
            "id,name,default_method,owner_id,family_id,shared_with_family"
          )
          .eq("owner_id", ownerId)
          .order("name", { ascending: true });

        // Si eres miembro (NO dueño), sólo ves las tarjetas compartidas
        if (familyCtx && !isFamilyOwner) {
          query = query.eq("shared_with_family", true);
        }

        const { data, error } = await query;

        if (error) {
          console.warn("Error al cargar tarjetas", error);
          return;
        }

        const mapped: Card[] = (data ?? []).map((row: any) => ({
          id: row.id as string,
          name: row.name as string,
          default_method: (row.default_method ?? null) as string | null,
          owner_id: row.owner_id as string,
          family_id: (row.family_id ?? null) as string | null,
          shared_with_family: (row.shared_with_family ?? false) as boolean,
        }));

        setCards(mapped);
      } catch (err) {
        console.warn("Error inesperado al cargar tarjetas", err);
      }
    };

    loadCards();
  }, [user, familyCtx, isFamilyOwner]);

  // --------------------------------------------------
  //   Guardar presupuesto mensual
  // --------------------------------------------------
  const handleSaveBudget = () => {
    const val = Number(budgetInput);
    if (!Number.isFinite(val) || val <= 0) {
      alert("Ingresa un presupuesto válido mayor a 0.");
      return;
    }

    setBudget(val);
    if (typeof window !== "undefined") {
      localStorage.setItem(`ff-budget-${month}`, String(val));
    }
  };

  // --------------------------------------------------
  //   Totales de ingresos/gastos
  // --------------------------------------------------
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

  // --------------------------------------------------
  //   Agregado mensual por categoría (sólo gastos)
  // --------------------------------------------------
  const gastosPorCategoria = useMemo(() => {
    const map = new Map<string, number>();

    for (const t of transactions) {
      if (t.type !== "gasto") continue;
      const key = t.category || "SIN_CATEGORIA";
      map.set(key, (map.get(key) ?? 0) + t.amount);
    }

    const entries = Array.from(map.entries()).map(([category, total]) => ({
      category,
      total,
    }));

    entries.sort((a, b) => b.total - a.total);

    const totalGastosMes = entries.reduce((sum, e) => sum + e.total, 0);

    return entries.map((e) => ({
      ...e,
      percent: totalGastosMes ? (e.total * 100) / totalGastosMes : 0,
    }));
  }, [transactions]);

  // --------------------------------------------------
  //   Agregado mensual por persona (sólo gastos)
  // --------------------------------------------------
  const gastosPorPersona = useMemo(() => {
    const map = new Map<string, number>();

    for (const t of transactions) {
      if (t.type !== "gasto") continue;

      const label =
        t.spender_label ??
        (t.spender_user_id === user?.id
          ? "Yo"
          : familyCtx
          ? "Familiar"
          : "Otro");

      map.set(label, (map.get(label) ?? 0) + t.amount);
    }

    const arr = Array.from(map.entries()).map(([label, total]) => ({
      label,
      total,
    }));

    const total = arr.reduce((s, x) => s + x.total, 0);

    return arr
      .map((x) => ({
        ...x,
        percent: total ? (x.total * 100) / total : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [transactions, user, familyCtx]);

  // --------------------------------------------------
  //   Filtros: lista filtrada de movimientos
  // --------------------------------------------------
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (filterType !== "todos" && t.type !== filterType) return false;
      if (filterCategory !== "TODAS" && t.category !== filterCategory)
        return false;
      if (filterMethod !== "TODOS" && t.method !== filterMethod) return false;

      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        const haystack = [
          t.category,
          t.method,
          t.notes ?? "",
          formatDateDisplay(t.date),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [transactions, filterType, filterCategory, filterMethod, searchText]);

  // Totales sobre los movimientos *filtrados*
  const { filteredIngresos, filteredGastos, filteredFlujo } = useMemo(() => {
    let ingresos = 0;
    let gastos = 0;

    for (const t of filteredTransactions) {
      if (t.type === "ingreso") ingresos += t.amount;
      else gastos += t.amount;
    }

    return {
      filteredIngresos: ingresos,
      filteredGastos: gastos,
      filteredFlujo: ingresos - gastos,
    };
  }, [filteredTransactions]);

  // --------------------------------------------------
  //   Datos para gráficas
  // --------------------------------------------------
  const chartDataCategorias = useMemo(() => {
    return gastosPorCategoria.map((g) => ({
      category: g.category,
      total: g.total,
    }));
  }, [gastosPorCategoria]);

  const chartDataLinea = useMemo(() => {
    const map = new Map<
      string,
      { date: string; ingresos: number; gastos: number }
    >();

    for (const t of transactions) {
      const key = (t.date ?? "").slice(0, 10);
      if (!map.has(key)) {
        map.set(key, {
          date: key,
          ingresos: 0,
          gastos: 0,
        });
      }
      const item = map.get(key)!;
      if (t.type === "ingreso") item.ingresos += t.amount;
      else item.gastos += t.amount;
    }

    const arr = Array.from(map.values());
    arr.sort((a, b) => (a.date < b.date ? -1 : 1));

    return arr.map((d) => ({
      ...d,
      dateLabel: formatDateDisplay(d.date),
    }));
  }, [transactions]);

  // --------------------------------------------------
  //   Resumen "inteligente" del mes
  // --------------------------------------------------
  const smartSummary = useMemo(() => {
    const lines: string[] = [];

    if (!transactions.length) {
      lines.push(
        "Aún no tienes movimientos en este mes. Empieza registrando ingresos y gastos para ver tu resumen."
      );
      return lines;
    }

    if (totalIngresos === 0 && totalGastos > 0) {
      lines.push(
        "Este mes sólo has registrado gastos, pero ningún ingreso. Revisa si falta capturar tu sueldo o ingresos principales."
      );
    }

    if (totalIngresos > 0) {
      const ratio = (totalGastos / totalIngresos) * 100;
      lines.push(
        `Has gastado aproximadamente el ${ratio.toFixed(
          1
        )}% de tus ingresos del mes.`
      );

      if (ratio > 90) {
        lines.push(
          "Estás muy cerca de gastar todo lo que ingresaste. Sería bueno frenar un poco los gastos en lo que resta del mes."
        );
      } else if (ratio > 70) {
        lines.push(
          "Tu nivel de gasto es elevado, pero aún tienes margen. Vale la pena revisar en qué se está yendo la mayor parte."
        );
      } else if (ratio < 50) {
        lines.push(
          "Vas muy bien. Estás gastando menos de la mitad de lo que ingresaste este mes."
        );
      }
    }

    if (budget != null) {
      if (disponible != null && disponible < 0) {
        lines.push(
          `Ya sobrepasaste tu presupuesto de ${formatMoney(
            budget
          )}. Estás por encima en ${formatMoney(Math.abs(disponible))}.`
        );
      } else if (disponible != null && disponible > 0) {
        lines.push(
          `Todavía te quedan ${formatMoney(
            disponible
          )} disponibles dentro de tu presupuesto de este mes.`
        );
      }
    }

    if (gastosPorCategoria.length > 0) {
      const top1 = gastosPorCategoria[0];
      lines.push(
        `Tu categoría con más gasto este mes es "${top1.category}" con ${formatMoney(
          top1.total
        )} (${top1.percent.toFixed(1)}% del total de gastos).`
      );
      if (gastosPorCategoria.length > 1) {
        const top2 = gastosPorCategoria[1];
        lines.push(
          `La segunda categoría con más peso es "${top2.category}" con ${formatMoney(
            top2.total
          )}.`
        );
      }
    }

    return lines;
  }, [
    transactions,
    totalIngresos,
    totalGastos,
    budget,
    disponible,
    gastosPorCategoria,
  ]);

  // --------------------------------------------------
  //   Exportar CSV del mes
  // --------------------------------------------------
  const handleExportCsv = () => {
    let data = transactions;
    if (exportType === "ingresos") {
      data = transactions.filter((t) => t.type === "ingreso");
    } else if (exportType === "gastos") {
      data = transactions.filter((t) => t.type === "gasto");
    }

    if (!data.length) {
      alert("No hay movimientos en este mes con ese filtro para exportar.");
      return;
    }

    const header = [
      "Fecha",
      "Tipo",
      "Categoría",
      "Monto",
      "Método",
      "Notas",
      "Offline",
    ];

    const rows = data.map((t) => [
      t.date,
      t.type,
      t.category,
      t.amount,
      t.method,
      t.notes ?? "",
      t.localOnly ? "sí" : "no",
    ]);

    const csvLines = [
      header.map(csvEscape).join(","),
      ...rows.map((r) => r.map(csvEscape).join(",")),
    ];

    if (
      exportIncludeCategorySummary &&
      gastosPorCategoria.length > 0 &&
      exportType !== "ingresos"
    ) {
      csvLines.push("");
      csvLines.push("Resumen de gastos por categoría");
      csvLines.push("Categoría,Total,Porcentaje");

      gastosPorCategoria.forEach((item) => {
        csvLines.push(
          [
            csvEscape(item.category),
            csvEscape(item.total),
            csvEscape(`${item.percent.toFixed(1)}%`),
          ].join(",")
        );
      });
    }

    const csvContent = csvLines.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

    const url = URL.createObjectURL(blob);
    const fileMonth = month.replace("-", "_");
    const exportLabel =
      exportType === "todos"
        ? "todos"
        : exportType === "ingresos"
        ? "ingresos"
        : "gastos";

    const fileName = `finanzas_${fileMonth}_${exportLabel}.csv`;

    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --------------------------------------------------
  //   Etiqueta del mes
  // --------------------------------------------------
  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-");
    const date = new Date(Number(y), Number(m) - 1, 1);

    const raw = date.toLocaleDateString("es-MX", {
      year: "numeric",
      month: "long",
    });

    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [month]);

  // --------------------------------------------------
  //   Exportar PDF del mes
  // --------------------------------------------------
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
        `Presupuesto definido: ${formatMoney(budget)} · Disponible: ${
          disponible != null ? formatMoney(disponible) : "-"
        }`,
        14,
        y
      );
      y += 6;
    }

    if (gastosPorCategoria.length > 0) {
      const top1 = gastosPorCategoria[0];
      doc.text(
        `Categoría con más gasto: ${top1.category} (${formatMoney(
          top1.total
        )}, ${top1.percent.toFixed(1)}%)`,
        14,
        y
      );
      y += 8;
    } else {
      y += 4;
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
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: 255,
      },
      columnStyles: {
        3: { halign: "right" },
      },
      theme: "grid",
    });

    const fileMonth = month.replace("-", "_");
    doc.save(`reporte_finanzas_${fileMonth}.pdf`);
  };

  // --------------------------------------------------
  //   Cambio de mes
  // --------------------------------------------------
  const handleChangeMonth = (value: string) => {
    setMonth(value);
  };

  // --------------------------------------------------
  //   Manejo formulario (movimientos)
  // --------------------------------------------------
  const handleChangeForm = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
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
    });
    setSelectedCardId(null);
    setEditingId(null);
  };

  // --------------------------------------------------
  //   Guardar / editar / borrar movimiento
  // --------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) {
      alert("Debes iniciar sesión para guardar movimientos.");
      return;
    }

    const amountNumber = Number(form.amount);
    if (!form.date) {
      alert("Selecciona una fecha.");
      return;
    }
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      alert("Ingresa un monto válido mayor a 0.");
      return;
    }

    const spenderLabel = form.spenderLabel || "Yo";

    const basePayload = {
      date: form.date,
      type: form.type,
      category: form.category,
      amount: amountNumber,
      method: form.method,
      notes: form.notes || null,
      spender_label: spenderLabel,
    };

    // 🔑 Si pertenece a una familia, el dueño financiero es el owner de la familia
    const ownerUserId = familyCtx ? familyCtx.ownerUserId : user.id;
    const spenderUserId = user.id;

    setSaving(true);

    try {
      // 📴 Modo offline
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const id = crypto.randomUUID();

        const localTx: Tx = {
          id,
          ...basePayload,
          owner_user_id: ownerUserId,
          spender_user_id: spenderUserId,
          spender_label: spenderLabel,
          created_by: user.id,
          card_id: selectedCardId ?? null,
          localOnly: true,
        };

        setTransactions((prev) => [localTx, ...prev]);

        try {
          // Offline en disco: sólo guardamos los campos base clásicos
          await saveOfflineTx({
            id: localTx.id,
            date: localTx.date,
            type: localTx.type,
            category: localTx.category,
            amount: localTx.amount,
            method: localTx.method,
            notes: localTx.notes ?? null,
          });
        } catch (err) {
          console.error("Error guardando movimiento offline", err);
        }

        alert(
          "Estás sin conexión. El movimiento se guardó sólo en este dispositivo y se enviará cuando vuelva el internet."
        );
        resetForm();
        return;
      }

      // 🌐 Modo online
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

        setTransactions((prev) =>
          prev.map((t) =>
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
          )
        );
      } else {
        const { data, error } = await supabase
          .from("transactions")
          .insert({
            ...basePayload,
            user_id: user.id,
            owner_user_id: ownerUserId,
            spender_user_id: spenderUserId,
            created_by: user.id,
            card_id: selectedCardId ?? null,
          })
          .select(
            "id,date,type,category,amount,method,notes,owner_user_id,spender_user_id,spender_label,created_by,card_id"
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
          owner_user_id: data.owner_user_id ?? null,
          spender_user_id: data.spender_user_id ?? null,
          spender_label: data.spender_label ?? null,
          created_by: data.created_by ?? null,
          card_id: data.card_id ?? null,
        };

        setTransactions((prev) => [newTx, ...prev]);
      }

      resetForm();
    } catch (err) {
      console.error("Error en handleSubmit:", err);
      setError("No se pudo guardar el movimiento.");
      alert("No se pudo guardar el movimiento.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (tx: Tx) => {
    const inferredSpender =
      tx.spender_label ??
      (tx.spender_user_id === user?.id ? "Yo" : "Otro");

    setForm({
      date: tx.date,
      type: tx.type,
      category: tx.category,
      amount: String(tx.amount),
      method: tx.method,
      notes: tx.notes ?? "",
      spenderLabel: inferredSpender,
    });
    setSelectedCardId(tx.card_id ?? null);
    setEditingId(tx.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (tx: Tx) => {
    if (!isOnline) {
      alert("No puedes eliminar movimientos mientras estás sin conexión.");
      return;
    }
    if (!user) {
      alert("Debes iniciar sesión para eliminar movimientos.");
      return;
    }

    try {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", tx.id)
        .eq("user_id", user.id);

      if (error) throw error;

      setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
    } catch (err: any) {
      console.error(err);
      alert("No se pudo eliminar el movimiento.");
    }
  };

  const handleAddCategory = () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;

    const value = trimmed.toUpperCase().replace(/\s+/g, "_");
    if (categories.some((c) => c.value === value)) {
      alert("Esa categoría ya existe.");
      return;
    }

    const updated = [...categories, { label: trimmed, value }];
    setCategories(updated);
    setNewCategory("");

    if (typeof window !== "undefined") {
      localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(updated));
    }
  };

  const handleAddMethod = () => {
    const trimmed = newMethod.trim();
    if (!trimmed) return;

    const value = trimmed.toUpperCase().replace(/\s+/g, "_");
    if (methods.some((m) => m.value === value)) {
      alert("Ese método ya existe.");
      return;
    }

    const updated = [...methods, { label: trimmed, value }];
    setMethods(updated);
    setNewMethod("");

    if (typeof window !== "undefined") {
      localStorage.setItem(CUSTOM_METHODS_KEY, JSON.stringify(updated));
    }
  };

  // --------------------------------------------------
  //   Render: auth
  // --------------------------------------------------
  if (authLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-sm text-slate-600 dark:text-slate-300">
        Cargando sesión...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">Finanzas familiares</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Registra tus ingresos y gastos en un solo lugar.
              </p>
            </div>
            <ThemeToggle />
          </div>

          <h2 className="text-sm font-medium">
            {authMode === "login" ? "Inicia sesión" : "Crea tu cuenta"}
          </h2>

          <form
            onSubmit={authMode === "login" ? handleSignIn : handleSignUp}
            className="space-y-3 text-sm"
          >
            <div>
              <label className="mb-1 block text-xs text-gray-600 dark:text-gray-300">
                Correo electrónico
              </label>
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                placeholder="tucorreo@ejemplo.com"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600 dark:text-gray-300">
                Contraseña
              </label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            {authError && (
              <p className="text-xs text-red-500">{authError}</p>
            )}

            <button
              type="submit"
              className="w-full rounded-lg bg-sky-500 py-2 text-sm font-medium text-white transition hover:bg-sky-600"
            >
              {authMode === "login" ? "Entrar" : "Crear cuenta"}
            </button>
          </form>

          <div className="text-center text-xs text-gray-600 dark:text-gray-300">
            {authMode === "login" ? (
              <>
                ¿No tienes cuenta?{" "}
                <button
                  className="text-sky-600 underline"
                  onClick={() => {
                    setAuthMode("signup");
                    setAuthError(null);
                  }}
                >
                  Crear una nueva
                </button>
              </>
            ) : (
              <>
                ¿Ya tienes cuenta?{" "}
                <button
                  className="text-sky-600 underline"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError(null);
                  }}
                >
                  Inicia sesión
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  //   Render: app logueada
  // --------------------------------------------------
  return (
    <main className="flex flex-1 flex-col gap-4">
      {/* Header con navegación */}
      <AppHeader
        title="Gastos e ingresos"
        subtitle="Aquí capturas todos los movimientos del día a día."
        activeTab="gastos"
        userEmail={user.email}
        onSignOut={handleSignOut}
      />

      {/* Mes + resumen + estado conexión */}
      <section className="space-y-4">
        {/* Tarjeta mes / exportar / conexión */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-300">
                Mes
              </div>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="month"
                  value={month}
                  onChange={(e) => handleChangeMonth(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                  aria-label={`Mes: ${monthLabel}`}
                />
                <button
                  type="button"
                  onClick={() => setShowExportOptions((v) => !v)}
                  className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-medium text-white transition hover:bg-emerald-600"
                >
                  {showExportOptions ? "Cerrar exportar" : "Exportar"}
                </button>
              </div>

              {/* Info de familia */}
              {familyCtxLoading && !familyCtx && (
                <p className="mt-2 text-[11px] text-slate-500">
                  Cargando información de familia...
                </p>
              )}
              {familyCtx && (
                <div className="mt-2 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <div>
                    Familia:{" "}
                    <span className="font-semibold">
                      {familyCtx.familyName}
                    </span>{" "}
                    {isFamilyOwner ? "(jefe de familia)" : "(miembro)"}
                  </div>
                  {isFamilyOwner && (
                    <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">
                      <button
                        type="button"
                        className={
                          "rounded-full px-2 py-0.5 " +
                          (viewScope === "mine"
                            ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50"
                            : "text-slate-500")
                        }
                        onClick={() => setViewScope("mine")}
                      >
                        Solo yo
                      </button>
                      <button
                        type="button"
                        className={
                          "rounded-full px-2 py-0.5 " +
                          (viewScope === "family"
                            ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50"
                            : "text-slate-500")
                        }
                        onClick={() => setViewScope("family")}
                      >
                        Familia
                      </button>
                    </div>
                  )}
                </div>
              )}
              {familyCtxError && (
                <p className="mt-2 text-[11px] text-rose-500">
                  {familyCtxError}
                </p>
              )}
            </div>

            <div
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
                isOnline
                  ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                  : "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isOnline ? "bg-green-500" : "bg-yellow-500"
                }`}
              />
              {isOnline ? "Conectado" : "Sin conexión (modo local)"}
            </div>
          </div>

          {showExportOptions && (
            <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-1 font-semibold text-gray-700 dark:text-gray-200">
                Opciones de exportación
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-gray-600 dark:text-gray-300">
                  Tipo de movimientos
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setExportType("todos")}
                    className={`rounded-full border px-2 py-1 text-[11px] ${
                      exportType === "todos"
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportType("ingresos")}
                    className={`rounded-full border px-2 py-1 text-[11px] ${
                      exportType === "ingresos"
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                    }`}
                  >
                    Sólo ingresos
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportType("gastos")}
                    className={`rounded-full border px-2 py-1 text-[11px] ${
                      exportType === "gastos"
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                    }`}
                  >
                    Sólo gastos
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={exportIncludeCategorySummary}
                  onChange={(e) =>
                    setExportIncludeCategorySummary(e.target.checked)
                  }
                />
                <span className="text-[11px] text-gray-700 dark:text-gray-200">
                  Incluir resumen de gastos por categoría al final
                </span>
              </label>

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-emerald-700"
                >
                  Descargar CSV
                </button>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-medium text-white transition hover:bg-black dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
                >
                  Descargar PDF del mes
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tarjetas resumen */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex min-h-[110px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs text-gray-500 dark:text-gray-300">
              Ingresos del mes
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">
              {formatMoney(totalIngresos)}
            </div>
          </div>

          <div className="flex min-h-[110px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs text-gray-500 dark:text-gray-300">
              Gastos del mes
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight text-rose-600 dark:text-rose-400">
              {formatMoney(totalGastos)}
            </div>
          </div>

          <div className="flex min-h-[110px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs text-gray-500 dark:text-gray-300">
              Flujo (Ingresos - Gastos)
            </div>
            <div
              className={`mt-1 text-2xl md:text-3xl font-semibold tracking-tight ${
                flujo >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {formatMoney(flujo)}
            </div>
          </div>

          <div className="flex min-h-[110px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs text-gray-500 dark:text-gray-300">
              Presupuesto del mes
            </div>
            <div className="mb-2 mt-1 flex items-baseline gap-2">
              <input
                type="number"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                placeholder="Ej. 20000"
              />
              <button
                onClick={handleSaveBudget}
                className="rounded-lg bg-sky-500 px-3 py-1 text-xs font-medium text-white hover:bg-sky-600"
              >
                Guardar
              </button>
            </div>
            {budget != null && (
              <div
                className={`text-xs ${
                  disponible != null && disponible < 0
                    ? "text-rose-400"
                    : "text-emerald-300"
                }`}
              >
                Disponible:{" "}
                {disponible != null ? formatMoney(disponible) : "-"}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Resumen inteligente */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-semibold">
          Resumen inteligente del mes
        </h2>
        {smartSummary.length === 0 ? (
          <p className="text-xs text-gray-500">
            Aún no hay suficiente información para generar un resumen.
          </p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-xs">
            {smartSummary.map((line, idx) => (
              <li key={idx}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      {/* Gestión de tarjetas para tus gastos */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold">
              Tarjetas ligadas a tus gastos
            </h2>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Aquí sólo tú ves tus tarjetas (BBVA, Amex, etc.). Más adelante
              las podrás compartir con tu familia para que sus gastos con esa
              tarjeta también se reflejen en tu resumen.
            </p>
          </div>
        </div>

        {/* Formulario para crear tarjeta */}
                <form
          onSubmit={handleAddCard}
          className="mt-4 flex flex-col gap-2 text-sm md:flex-row"
        >
          <div className="flex-1">
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-300">
              Nombre de la tarjeta
            </label>
            <input
              type="text"
              value={newCardName}
              onChange={(e) => setNewCardName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Ej. BBVA Negra David, Amex Platino, etc."
            />

            {familyCtx && (
              <label className="mt-2 flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={newCardShared}
                  onChange={(e) => setNewCardShared(e.target.checked)}
                  className="mt-[2px]"
                />
                <span>
                  Compartir esta tarjeta con mi familia
                  <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                    Los miembros podrán usarla al capturar sus gastos y se
                    verán en tu resumen.
                  </span>
                </span>
              </label>
            )}
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={savingCard}
              className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60 md:w-auto"
            >
              {savingCard ? "Guardando..." : "Agregar tarjeta"}
            </button>
          </div>
        </form>

        {cardError && (
          <p className="mt-1 text-xs text-rose-500">{cardError}</p>
        )}

      {/* Lista de tarjetas existentes */}
      <div className="mt-4">
        {cards.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Aún no tienes tarjetas registradas. Empieza agregando una arriba.
          </p>
        ) : (
          <div className="space-y-2">
            {cards.map((card) => (
              <div
                key={card.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/40"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {card.name}
                  </span>

                  {/* Etiqueta de estado: compartida o sólo tú */}
                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 ${
                        card.shared_with_family
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                          : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {card.shared_with_family
                        ? "Compartida con familia"
                        : "Sólo tú la ves"}
                    </span>
                  </span>

                  <span className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Se puede seleccionar al capturar un movimiento.
                  </span>
                </div>

                <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center">
                  {/* Botón para usar en formulario */}
                  <button
                    type="button"
                    onClick={() => setSelectedCardId(card.id)}
                    className={`rounded-full px-3 py-1 text-[11px] ${
                      selectedCardId === card.id
                        ? "bg-sky-500 text-white"
                        : "bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200 border border-slate-300 dark:border-slate-700"
                    }`}
                  >
                    Usar en formulario
                  </button>

                  {/* Switch compartir sólo para el jefe de familia */}
                  {isFamilyOwner && (
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleCardSharing(
                          card.id,
                          card.shared_with_family
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-[11px] ${
                        card.shared_with_family
                          ? "border-emerald-500 text-emerald-600 dark:border-emerald-400 dark:text-emerald-300"
                          : "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-200"
                      }`}
                    >
                      {card.shared_with_family
                        ? "Dejar de compartir"
                        : "Compartir con familia"}
                    </button>
                  )}

                  {/* Eliminar */}
                  <button
                    type="button"
                    onClick={() => handleDeleteCard(card.id)}
                    className="text-[11px] text-rose-500 hover:underline"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </section>

      {/* Gráficas */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="h-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-2 text-xs font-semibold">Gastos por categoría</h3>
          {chartDataCategorias.length === 0 ? (
            <p className="text-xs text-gray-500">
              Aún no hay gastos registrados.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartDataCategorias}
                margin={{ top: 10, right: 10, left: 0, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="category"
                  tick={{
                    fontSize: 10,
                    fill: isDark ? "#e5e7eb" : "#374151",
                  }}
                  angle={-30}
                  textAnchor="end"
                />
                <YAxis
                  tick={{
                    fontSize: 10,
                    fill: isDark ? "#e5e7eb" : "#374151",
                  }}
                />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="total"
                  name="Gasto"
                  radius={4}
                  fill={isDark ? "#38bdf8" : "#0ea5e9"}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="h-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-2 text-xs font-semibold">
            Ingresos vs Gastos por día
          </h3>
          {chartDataLinea.length === 0 ? (
            <p className="text-xs text-gray-500">
              Aún no hay movimientos suficientes para la gráfica.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartDataLinea}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="dateLabel"
                  tick={{
                    fontSize: 10,
                    fill: isDark ? "#e5e7eb" : "#374151",
                  }}
                />
                <YAxis
                  tick={{
                    fontSize: 10,
                    fill: isDark ? "#e5e7eb" : "#374151",
                  }}
                />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="ingresos"
                  name="Ingresos"
                  dot={false}
                  stroke={isDark ? "#22c55e" : "#16a34a"}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="gastos"
                  name="Gastos"
                  dot={false}
                  stroke={isDark ? "#fb7185" : "#ef4444"}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Formulario de movimientos */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold">
          {editingId ? "Editar movimiento" : "Agregar movimiento"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          {/* Fila principal */}
          <div className="grid gap-3 md:grid-cols-7">
            {/* Tarjeta */}
            <div>
              <div className="mb-1 text-xs text-gray-500 dark:text-gray-300">
                Tarjeta
              </div>
              <select
                value={selectedCardId ?? ""}
                onChange={(e) =>
                  handleChangeCard(e.target.value ? e.target.value : null)
                }
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">Sin tarjeta específica</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
    Si eliges una tarjeta compartida, este movimiento se sumará al resumen
    del jefe de familia.
  </p>
</div>

            {/* Tipo */}
            <div>
              <div className="mb-1 text-xs text-gray-500 dark:text-gray-300">
                Tipo
              </div>
              <div className="inline-flex overflow-hidden rounded-lg border dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => handleChangeForm("type", "ingreso")}
                  className={`px-3 py-1 ${
                    form.type === "ingreso"
                      ? "bg-emerald-500 text-white"
                      : "bg-white text-gray-700 dark:bg-slate-900 dark:text-gray-200"
                  }`}
                >
                  Ingreso
                </button>
                <button
                  type="button"
                  onClick={() => handleChangeForm("type", "gasto")}
                  className={`px-3 py-1 ${
                    form.type === "gasto"
                      ? "bg-rose-500 text-white"
                      : "bg-white text-gray-700 dark:bg-slate-900 dark:text-gray-200"
                  }`}
                >
                  Gasto
                </button>
              </div>
            </div>

            {/* Fecha */}
            <div>
              <div className="mb-1 text-xs text-gray-500 dark:text-gray-300">
                Fecha
              </div>
              <input
                type="date"
                value={form.date}
                onChange={(e) => handleChangeForm("date", e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>

            {/* Categoría */}
            <div>
              <div className="mb-1 text-xs text-gray-500 dark:text-gray-300">
                Categoría
              </div>
              <select
                value={form.category}
                onChange={(e) => handleChangeForm("category", e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              >
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Monto */}
            <div>
              <div className="mb-1 text-xs text-gray-500 dark:text-gray-300">
                Monto
              </div>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => handleChangeForm("amount", e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>

            {/* Método */}
            <div>
              <div className="mb-1 text-xs text-gray-500 dark:text-gray-300">
                Método de pago
              </div>
              <select
                value={form.method}
                onChange={(e) => handleChangeForm("method", e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              >
                {methods.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Quién generó */}
            <div>
              <div className="mb-1 text-xs text-gray-500 dark:text-gray-300">
                Quién generó
              </div>
              <select
                value={form.spenderLabel}
                onChange={(e) =>
                  handleChangeForm("spenderLabel", e.target.value)
                }
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              >
                {SPENDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Editor rápido de categorías y métodos */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs text-gray-500 dark:text-gray-300">
                Agregar nueva categoría
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Ej. Vacaciones, Mascotas, etc."
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-900"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs text-gray-500 dark:text-gray-300">
                Agregar nuevo método de pago
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMethod}
                  onChange={(e) => setNewMethod(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Ej. Tarjeta Amazon, Mercado Pago, etc."
                />
                <button
                  type="button"
                  onClick={handleAddMethod}
                  className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-900"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Notas */}
          <div>
            <div className="mb-1 text-xs text-gray-500 dark:text-gray-300">
              Notas (opcional)
            </div>
            <textarea
              value={form.notes}
              onChange={(e) => handleChangeForm("notes", e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Descripción, quién pagó, folio, etc."
            />
          </div>

          {/* Botones */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-600 disabled:opacity-60"
            >
              {saving
                ? "Guardando..."
                : editingId
                ? "Guardar cambios"
                : "Agregar"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-sm text-gray-500 underline"
              >
                Cancelar edición
              </button>
            )}
          </div>

          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </form>
      </section>

      {/* Filtros de movimientos */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold">Filtros de movimientos</h2>

        {/* Cards de totales filtrados */}
        <div className="mb-2 grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
            <span className="text-[11px] text-slate-500 dark:text-slate-300">
              Ingresos (filtrados)
            </span>
            <span className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">
              {formatMoney(filteredIngresos)}
            </span>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
            <span className="text-[11px] text-slate-500 dark:text-slate-300">
              Gastos (filtrados)
            </span>
            <span className="mt-1 text-lg font-semibold text-rose-600 dark:text-rose-400">
              {formatMoney(filteredGastos)}
            </span>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
            <span className="text-[11px] text-slate-500 dark:text-slate-300">
              Flujo filtrado
            </span>
            <span
              className={`mt-1 text-lg font-semibold ${
                filteredFlujo >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {formatMoney(filteredFlujo)}
            </span>
          </div>
        </div>

        <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
          Estos totales se calculan sólo con los{" "}
          <span className="font-semibold">
            {filteredTransactions.length}
          </span>{" "}
          movimientos que cumplen los filtros actuales. Si cambias los filtros,
          estas cifras también cambian.
        </p>

        {/* Controles de filtro */}
        <div className="grid gap-3 text-xs md:grid-cols-4">
          {/* Tipo */}
          <div>
            <div className="mb-1 text-gray-500 dark:text-gray-300">Tipo</div>
            <div className="inline-flex overflow-hidden rounded-lg border dark:border-slate-700">
              <button
                type="button"
                onClick={() => setFilterType("todos")}
                className={`px-3 py-1 ${
                  filterType === "todos"
                    ? "bg-sky-500 text-white"
                    : "bg-white text-gray-700 dark:bg-slate-900 dark:text-gray-200"
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setFilterType("ingreso")}
                className={`px-3 py-1 ${
                  filterType === "ingreso"
                    ? "bg-emerald-500 text-white"
                    : "bg-white text-gray-700 dark:bg-slate-900 dark:text-gray-200"
                }`}
              >
                Ingresos
              </button>
              <button
                type="button"
                onClick={() => setFilterType("gasto")}
                className={`px-3 py-1 ${
                  filterType === "gasto"
                    ? "bg-rose-500 text-white"
                    : "bg-white text-gray-700 dark:bg-slate-900 dark:text-gray-200"
                }`}
              >
                Gastos
              </button>
            </div>
          </div>

          {/* Categoría */}
          <div>
            <div className="mb-1 text-gray-500 dark:text-gray-300">
              Categoría
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="TODAS">Todas</option>
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Método */}
          <div>
            <div className="mb-1 text-gray-500 dark:text-gray-300">
              Método de pago
            </div>
            <select
              value={filterMethod}
              onChange={(e) => setFilterMethod(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="TODOS">Todos</option>
              {methods.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Buscar */}
          <div>
            <div className="mb-1 text-gray-500 dark:text-gray-300">
              Buscar
            </div>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Notas, categoría, fecha..."
            />
          </div>
        </div>
      </section>

      {/* Visor mensual: gastos por categoría */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-semibold">
          Visor mensual de gastos por categoría
        </h2>
        {gastosPorCategoria.length === 0 ? (
          <p className="text-xs text-gray-500">
            Aún no hay gastos registrados en este mes.
          </p>
        ) : (
          <div className="space-y-2">
            {gastosPorCategoria.map((item) => (
              <div key={item.category} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>{item.category}</span>
                  <span>
                    {formatMoney(item.total)}{" "}
                    <span className="text-gray-400">
                      ({item.percent.toFixed(1)}%)
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-gray-200 dark:bg-slate-700">
                  <div
                    className="h-2 rounded bg-sky-500"
                    style={{
                      width: `${Math.max(item.percent, 2)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Gastos por persona (modo familia) */}
      {familyCtx && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 text-sm font-semibold">
            Gastos por persona (familia)
          </h2>

          {gastosPorPersona.length === 0 ? (
            <p className="text-xs text-gray-500">
              Aún no hay gastos registrados por persona en este mes.
            </p>
          ) : (
            <div className="space-y-2">
              {gastosPorPersona.map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>{item.label}</span>
                    <span>
                      {formatMoney(item.total)}{" "}
                      <span className="text-gray-400">
                        ({item.percent.toFixed(1)}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-gray-200 dark:bg-slate-700">
                    <div
                      className="h-2 rounded bg-emerald-500"
                      style={{
                        width: `${Math.max(item.percent, 2)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
            Estos montos consideran sólo los{" "}
            <span className="font-semibold">gastos</span> del mes actual y usan
            el campo <span className="font-semibold">“Quién generó”</span> del
            formulario de movimientos.
          </p>
        </section>
      )}

      {/* Tabla de movimientos */}
      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Movimientos de {month}</h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-300">
            Mostrando{" "}
            <span className="font-semibold">
              {filteredTransactions.length}
            </span>{" "}
            de{" "}
            <span className="font-semibold">
              {transactions.length}
            </span>{" "}
            movimientos del mes
          </p>
        </div>

        <div className="overflow-x-auto text-sm">
          <table className="min-w-full border border-gray-200 text-left text-xs dark:border-slate-700 md:text-sm">
<thead className="bg-gray-50 dark:bg-slate-900">
  <tr>
    <th className="border-b px-2 py-2">Fecha</th>
    <th className="border-b px-2 py-2">Tipo</th>
    <th className="border-b px-2 py-2">Categoría</th>
    <th className="border-b px-2 py-2 text-right">Monto</th>
    <th className="border-b px-2 py-2">Método</th>
    <th className="border-b px-2 py-2">Tarjeta</th>
    <th className="border-b px-2 py-2">Generó</th>
    <th className="border-b px-2 py-2">Notas</th>
    <th className="border-b px-2 py-2 text-center">Acciones</th>
  </tr>
</thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={8}
                    className="py-4 text-center text-gray-500"
                  >
                    Cargando movimientos...
                  </td>
                </tr>
              )}

              {!loading && filteredTransactions.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="py-4 text-center text-gray-500"
                  >
                    Sin movimientos registrados con esos filtros.
                  </td>
                </tr>
              )}

              {!loading &&
                filteredTransactions.map((t) => (
                  <tr
                    key={t.id}
                    className={`
                      odd:bg-white even:bg-gray-50 
                      dark:odd:bg-slate-800 dark:even:bg-slate-900
                      hover:bg-sky-50 dark:hover:bg-slate-800/80
                      transition-colors cursor-default
                      ${t.localOnly ? "opacity-80" : ""}
                      ${
                        t.type === "ingreso"
                          ? "border-l-4 border-l-emerald-400"
                          : "border-l-4 border-l-rose-400"
                      }
                    `}
                  >
                    <td className="border-t px-2 py-1">
                      {formatDateDisplay(t.date)}
                    </td>

                    {/* Tipo con badge */}
                    <td className="border-t px-2 py-1">
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

                    <td className="border-t px-2 py-1">{t.category}</td>

                    {/* Monto + badge Offline alineados a la derecha */}
                    {/* Monto + badge Offline alineados a la derecha */}
<td className="border-t px-2 py-1">
  <div className="flex items-center justify-end gap-1">
    <span
      className={`font-semibold ${
        t.type === "ingreso"
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-rose-600 dark:text-rose-400"
      }`}
    >
      {formatMoney(t.amount)}
    </span>
    {t.localOnly && (
      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200">
        Offline
      </span>
    )}
  </div>
</td>

{/* Método como pill */}
<td className="border-t px-2 py-1">
  <span className="inline-flex max-w-[160px] items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
    <span className="truncate">{t.method}</span>
  </span>
</td>

{/* Tarjeta */}
<td className="border-t px-2 py-1">
  {cards.find((c) => c.id === t.card_id)?.name ? (
    <span className="inline-flex max-w-[160px] items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
      <span className="truncate">
        {cards.find((c) => c.id === t.card_id)?.name}
      </span>
    </span>
  ) : (
    <span className="text-[11px] text-slate-400">—</span>
  )}
</td>

{/* Generó */}
<td className="border-t px-2 py-1">
  <span className="text-xs text-slate-600 dark:text-slate-300">
    {t.spender_label ??
      (t.spender_user_id === user.id ? "Yo" : "Otro")}
  </span>
</td>

                    {/* Notas con tooltip */}
                    <td className="border-t px-2 py-1">
                      {t.notes ? (
                        <span
                          className="block max-w-xs truncate text-xs text-slate-600 dark:text-slate-300"
                          title={t.notes}
                        >
                          {t.notes}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>

                    {/* Acciones */}
                    <td className="border-t px-2 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => handleEdit(t)}
                        className="mr-2 text-xs text-sky-600 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(t)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
