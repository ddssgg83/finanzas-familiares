'use client';

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { saveOfflineTx, getOfflineTxs, syncOfflineTxs } from "@/lib/offline";

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
  localOnly?: boolean;
};

type FormState = {
  date: string;
  type: TxType;
  category: string;
  amount: string;
  method: string;
  notes: string;
};

type Option = { label: string; value: string };

type ExportType = "todos" | "ingresos" | "gastos";

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
  { label: "Transferencia", value: "TRANSFERENCIA" },
  { label: "BBVA crédito", value: "BBVA_CREDITO" },
  { label: "BBVA débito", value: "BBVA_DEBITO" },
  { label: "Tarjeta crédito otra", value: "CREDITO_OTRA" },
  { label: "Tarjeta débito otra", value: "DEBITO_OTRA" },
];

const CUSTOM_CATEGORIES_KEY = "ff-custom-categories";
const CUSTOM_METHODS_KEY = "ff-custom-methods";

function getCurrentMonthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatMoney(num: number) {
  return num.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  });
}

// Evita el problema de zonas horarias al mostrar fechas
function formatDateDisplay(ymd: string) {
  const s = (ymd ?? "").slice(0, 10); // nos quedamos solo con YYYY-MM-DD
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`; // dd/mm/yyyy
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default function Home() {
  // 🔐 AUTH
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  // 💰 DATOS
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
  });

  const [editingId, setEditingId] = useState<string | null>(null);

  // 💸 Presupuesto general
  const [budgetInput, setBudgetInput] = useState("");
  const [budget, setBudget] = useState<number | null>(null);

  // 🌐 Estado conexión
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // 📤 Export
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [exportType, setExportType] = useState<ExportType>("todos");
  const [exportIncludeCategorySummary, setExportIncludeCategorySummary] =
    useState(true);

  // 🔎 Filtros para la tabla
  const [filterType, setFilterType] = useState<"todos" | "ingreso" | "gasto">(
    "todos"
  );
  const [filterCategory, setFilterCategory] = useState<string>("TODAS");
  const [filterMethod, setFilterMethod] = useState<string>("TODOS");
  const [searchText, setSearchText] = useState<string>("");

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
        if (
          error &&
          (error as any).name !== "AuthSessionMissingError"
        ) {
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
      alert("Cuenta creada.");
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
    } catch (err) {
      console.error(err);
    }
  };

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
    } catch {}

    try {
      const methodsRaw = localStorage.getItem(CUSTOM_METHODS_KEY);
      if (methodsRaw) {
        const parsed = JSON.parse(methodsRaw);
        if (Array.isArray(parsed) && parsed.length) {
          setMethods(parsed);
        }
      }
    } catch {}
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
            ...offline.map((t) => ({ ...t, localOnly: true })),
            ...prev,
          ]);
        }
      } catch {}
    }

    loadOffline();
  }, []);

  // --------------------------------------------------
  //   Cargar transacciones del mes desde Supabase
  // --------------------------------------------------
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      return;
    }

    const userId = user.id;

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

        const { data, error } = await supabase
          .from("transactions")
          .select("*")
          .eq("user_id", userId)
          .gte("date", from)
          .lte("date", to)
          .order("date", { ascending: false });

        if (error) throw error;

        const normalized = (data ?? []).map((t: any) => ({
          id: t.id,
          date: String(t.date).slice(0, 10), // YYYY-MM-DD
          type: t.type,
          category: t.category,
          amount: Number(t.amount),
          method: t.method,
          notes: t.notes,
        }));

        setTransactions(normalized);

        if (typeof window !== "undefined") {
          localStorage.setItem(
            `ff-cache-${month}`,
            JSON.stringify(normalized)
          );
        }
      } catch (err) {
        console.error(err);
        setError("No se pudieron cargar los movimientos.");

        if (typeof window !== "undefined") {
          const cache = localStorage.getItem(`ff-cache-${month}`);
          if (cache) {
            try {
              const parsed = JSON.parse(cache);
              const normalized = (parsed ?? []).map((t: any) => ({
                id: t.id,
                date: String(t.date).slice(0, 10),
                type: t.type,
                category: t.category,
                amount: Number(t.amount),
                method: t.method,
                notes: t.notes,
              }));
              setTransactions(normalized);
            } catch {}
          }
        }
      } finally {
        setLoading(false);
      }
    }

    if (typeof window !== "undefined") {
      load();
    }
  }, [month, user]);

  // --------------------------------------------------
  //   NUEVO SISTEMA DE SINCRONIZACIÓN (NO BORRA NADA)
  // --------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user) return;

    let cancelled = false;

    const syncAndMark = async () => {
      if (cancelled) return;

      try {
        const synced = await syncOfflineTxs(user.id);

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
  //   Presupuesto mensual
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
  //   Totales globales del mes
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

  const top3Categorias = useMemo(() => {
    return gastosPorCategoria.slice(0, 3);
  }, [gastosPorCategoria]);

  // --------------------------------------------------
  //   "IA ligera": resumen inteligente del mes
  // --------------------------------------------------
  const aiInsights = useMemo(() => {
    const insights: string[] = [];

    if (transactions.length === 0) {
      insights.push(
        "Aún no hay suficientes movimientos este mes para generar recomendaciones."
      );
      return insights;
    }

    // Relación ingresos vs gastos
    if (totalIngresos === 0 && totalGastos > 0) {
      insights.push(
        "Tienes gastos registrados pero ningún ingreso en el mes. Vale la pena revisar si falta capturar ingresos o si estás financiando tus gastos con ahorros o deuda."
      );
    } else if (totalIngresos > 0) {
      const ratio = totalGastos / totalIngresos;
      if (ratio > 1) {
        insights.push(
          "Este mes estás gastando más de lo que ingresas. Si esto se repite varios meses, puede ser una señal de alerta para ajustar gastos o buscar más ingresos."
        );
      } else if (ratio > 0.8) {
        insights.push(
          "Tus gastos representan más del 80% de tus ingresos. Estás en una zona apretada; podrías revisar 1 o 2 categorías para recortar un poco."
        );
      } else {
        insights.push(
          "Tus gastos están por debajo del 80% de tus ingresos. Vas con buen margen, es un buen momento para pensar en ahorro o inversión."
        );
      }
    }

    // Presupuesto del mes vs gastos
    if (budget != null && budget > 0) {
      const pct = totalGastos / budget;
      if (pct > 1) {
        insights.push(
          `Ya te pasaste del presupuesto mensual que definiste. Tal vez valga la pena ajustar el presupuesto o revisar las categorías con más gasto.`
        );
      } else if (pct > 0.9) {
        insights.push(
          "Estás arriba del 90% de tu presupuesto mensual. Estás a nada de llegar al límite: intenta contener gastos el resto del mes."
        );
      } else if (pct > 0.7) {
        insights.push(
          "Ya superaste el 70% de tu presupuesto del mes. Vas avanzado; te conviene revisar las categorías con más peso para no pasar el límite."
        );
      } else {
        insights.push(
          "Tus gastos aún están cómodamente por debajo del presupuesto que definiste. Vas bien, solo mantén el mismo comportamiento."
        );
      }
    }

    // Categoría con más gasto
    if (gastosPorCategoria.length > 0) {
      const mayor = gastosPorCategoria[0];
      insights.push(
        `La categoría donde más gastaste este mes es "${mayor.category}" con ${formatMoney(
          mayor.total
        )}. Si quieres recortar, este rubro es el primer candidato a revisar.`
      );
    }

    // Cantidad de movimientos
    if (transactions.length > 40) {
      insights.push(
        "Tienes muchos movimientos este mes, lo cual es bueno porque te da más visibilidad. Si quieres simplificar, podrías agrupar ciertos gastos en menos categorías."
      );
    } else if (transactions.length < 10) {
      insights.push(
        "Tienes pocos movimientos registrados este mes. Asegúrate de estar capturando todos tus gastos para que el análisis sea más preciso."
      );
    }

    return insights;
  }, [
    transactions,
    totalIngresos,
    totalGastos,
    budget,
    gastosPorCategoria,
  ]);

  // --------------------------------------------------
  //   Filtros de la tabla
  // --------------------------------------------------
  const filteredTransactions = useMemo(() => {
    let list = [...transactions];

    if (filterType !== "todos") {
      list = list.filter((t) => t.type === filterType);
    }

    if (filterCategory !== "TODAS") {
      list = list.filter((t) => t.category === filterCategory);
    }

    if (filterMethod !== "TODOS") {
      list = list.filter((t) => t.method === filterMethod);
    }

    const search = searchText.trim().toLowerCase();
    if (search) {
      list = list.filter((t) => {
        const haystack = [
          t.category,
          t.method,
          t.notes ?? "",
          t.type,
          formatDateDisplay(t.date),
          String(t.amount),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      });
    }

    return list;
  }, [transactions, filterType, filterCategory, filterMethod, searchText]);

  // --------------------------------------------------
  //   Export CSV (mensual, con opciones)
  // --------------------------------------------------
  const handleExportCsv = () => {
    let data = transactions;
    if (exportType === "ingresos") {
      data = transactions.filter((t) => t.type === "ingreso");
    } else if (exportType === "gastos") {
      data = transactions.filter((t) => t.type === "gasto");
    }

    if (!data.length) {
      alert("No hay movimientos para exportar.");
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
      t.date, // usamos la fecha tal cual
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
  //   Cambiar mes
  // --------------------------------------------------
  const handleChangeMonth = (value: string) => {
    setMonth(value);
  };

  // --------------------------------------------------
  //   Manejo del formulario
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
    });
    setEditingId(null);
  };

  // --------------------------------------------------
  //   Guardar (crear o editar) con soporte offline
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

    const payload = {
      date: form.date,
      type: form.type,
      category: form.category,
      amount: amountNumber,
      method: form.method,
      notes: form.notes || null,
    };

    setSaving(true);

    try {
      // 🔴 SIN CONEXIÓN → offline
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const id = crypto.randomUUID();

        const localTx: Tx = {
          id,
          ...payload,
          localOnly: true,
        };

        setTransactions((prev) => [localTx, ...prev]);

        try {
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
          "Estás sin conexión. El movimiento se guardó en este dispositivo y se enviará cuando vuelva internet."
        );
        resetForm();
        return;
      }

      // 🟢 CON CONEXIÓN
      if (editingId) {
        const { error } = await supabase
          .from("transactions")
          .update({ ...payload, user_id: user.id })
          .eq("id", editingId);

        if (error) throw error;

        setTransactions((prev) =>
          prev.map((t) =>
            t.id === editingId ? { ...t, ...payload } : t
          )
        );
      } else {
        const { data, error } = await supabase
          .from("transactions")
          .insert({ ...payload, user_id: user.id })
          .select("*")
          .single();

        if (error) throw error;

        const newTx: Tx = {
          id: data.id,          // id desde Supabase
          date: payload.date,   // usamos la fecha exacta del formulario
          type: payload.type,
          category: payload.category,
          amount: payload.amount,
          method: payload.method,
          notes: payload.notes,
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

  // --------------------------------------------------
  //   Editar / Eliminar
  // --------------------------------------------------
  const handleEdit = (tx: Tx) => {
    setForm({
      date: tx.date,
      type: tx.type,
      category: tx.category,
      amount: String(tx.amount),
      method: tx.method,
      notes: tx.notes ?? "",
    });
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
    } catch (err) {
      console.error(err);
      alert("No se pudo eliminar el movimiento.");
    }
  };

  // --------------------------------------------------
  //   Agregar categorías y métodos
  // --------------------------------------------------
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
  //   Etiqueta del mes
  // --------------------------------------------------
  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-");
    const date = new Date(Number(y), Number(m) - 1, 1);
    return date.toLocaleDateString("es-MX", {
      year: "numeric",
      month: "long",
    });
  }, [month]);

  // --------------------------------------------------
  //   Render: estados de auth
  // --------------------------------------------------
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <header className="bg-sky-500 text-white py-2 text-center text-sm">
          Finanzas Familiares
        </header>
        <main className="flex-1 flex items-center justify-center">
          <div className="text-gray-600 text-sm">Cargando sesión...</div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <header className="bg-sky-500 text-white py-2 text-center text-sm">
          Finanzas Familiares
        </header>
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="bg-white shadow rounded-lg p-6 w-full max-w-md space-y-4">
            <h1 className="text-lg font-semibold text-center mb-2">
              {authMode === "login" ? "Inicia sesión" : "Crea tu cuenta"}
            </h1>

            <form
              onSubmit={authMode === "login" ? handleSignIn : handleSignUp}
              className="space-y-3 text-sm"
            >
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="border rounded px-3 py-2 w-full text-sm"
                  placeholder="tucorreo@ejemplo.com"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Contraseña
                </label>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="border rounded px-3 py-2 w-full text-sm"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              {authError && (
                <p className="text-xs text-red-600">{authError}</p>
              )}

              <button
                type="submit"
                className="w-full bg-sky-500 hover:bg-sky-600 text-white py-2 rounded text-sm font-medium"
              >
                {authMode === "login" ? "Entrar" : "Crear cuenta"}
              </button>
            </form>

            <div className="text-center text-xs text-gray-600">
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
        </main>
      </div>
    );
  }

  // --------------------------------------------------
  //   Render: app logueada
  // --------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-sky-500 text-white py-2 text-center text-sm relative">
        Finanzas Familiares
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-[11px]">
          <span className="hidden sm:inline">{user.email}</span>
          <button
            onClick={handleSignOut}
            className="border border-white/70 px-2 py-0.5 rounded hover:bg-white hover:text-sky-600 transition text-[11px]"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto bg-white shadow rounded-lg p-6 mt-4 mb-8">
        {/* Mes + estado conexión + export */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <div>
            <div className="text-sm text-gray-500">Mes</div>
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={month}
                onChange={(e) => handleChangeMonth(e.target.value)}
                className="border rounded px-3 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowExportOptions((v) => !v)}
                className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded"
              >
                {showExportOptions ? "Cerrar exportar" : "Exportar"}
              </button>
            </div>
            <div className="text-xs text-gray-400 mt-1">{monthLabel}</div>

            {showExportOptions && (
              <div className="mt-3 p-3 border rounded-lg bg-gray-50 space-y-2 text-xs max-w-md">
                <div className="font-semibold text-gray-700 mb-1">
                  Opciones de exportación
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-gray-600">
                    Tipo de movimientos
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setExportType("todos")}
                      className={`px-2 py-1 rounded border text-[11px] ${
                        exportType === "todos"
                          ? "bg-emerald-500 text-white border-emerald-500"
                          : "bg-white text-gray-700 border-gray-300"
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportType("ingresos")}
                      className={`px-2 py-1 rounded border text-[11px] ${
                        exportType === "ingresos"
                          ? "bg-emerald-500 text-white border-emerald-500"
                          : "bg-white text-gray-700 border-gray-300"
                      }`}
                    >
                      Sólo ingresos
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportType("gastos")}
                      className={`px-2 py-1 rounded border text-[11px] ${
                        exportType === "gastos"
                          ? "bg-emerald-500 text-white border-emerald-500"
                          : "bg-white text-gray-700 border-gray-300"
                      }`}
                    >
                      Sólo gastos
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportIncludeCategorySummary}
                    onChange={(e) =>
                      setExportIncludeCategorySummary(e.target.checked)
                    }
                  />
                  <span className="text-[11px] text-gray-700">
                    Incluir resumen de gastos por categoría al final
                  </span>
                </label>

                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="mt-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded"
                >
                  Descargar CSV
                </button>
              </div>
            )}
          </div>

          <div
            className={`text-xs px-3 py-1 rounded-full inline-flex items-center gap-2 ${
              isOnline
                ? "bg-green-100 text-green-700"
                : "bg-yellow-100 text-yellow-700"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? "bg-green-500" : "bg-yellow-500"
              }`}
            />
            {isOnline ? "Conectado" : "Sin conexión (modo local)"}
          </div>
        </div>

        {/* Dashboard resumen */}
        <section className="mb-6">
          <h2 className="font-semibold mb-3 text-sm">Resumen del mes</h2>
          <div className="grid md:grid-cols-4 gap-4 mb-4">
            <div className="border rounded-lg p-4 bg-gray-50">
              <div className="text-xs text-gray-500">Ingresos del mes</div>
              <div className="text-2xl font-semibold text-green-600">
                {formatMoney(totalIngresos)}
              </div>
            </div>

            <div className="border rounded-lg p-4 bg-gray-50">
              <div className="text-xs text-gray-500">Gastos del mes</div>
              <div className="text-2xl font-semibold text-red-600">
                {formatMoney(totalGastos)}
              </div>
            </div>

            <div className="border rounded-lg p-4 bg-gray-50">
              <div className="text-xs text-gray-500">
                Flujo (Ingresos - Gastos)
              </div>
              <div
                className={`text-2xl font-semibold ${
                  flujo >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {formatMoney(flujo)}
              </div>
            </div>

            <div className="border rounded-lg p-4 bg-gray-50">
              <div className="text-xs text-gray-500">Presupuesto del mes</div>
              <div className="flex items-baseline gap-2 mb-2">
                <input
                  type="number"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  className="border rounded px-2 py-1 text-sm w-full"
                  placeholder="Ej. 20000"
                />
                <button
                  onClick={handleSaveBudget}
                  className="bg-sky-500 text-white text-xs px-3 py-1 rounded hover:bg-sky-600"
                >
                  Guardar
                </button>
              </div>
              {budget != null && (
                <div
                  className={`text-xs ${
                    disponible != null && disponible < 0
                      ? "text-red-600"
                      : "text-green-700"
                  }`}
                >
                  Disponible:{" "}
                  {disponible != null ? formatMoney(disponible) : "-"}
                </div>
              )}
            </div>
          </div>

          {/* Top 3 categorías de gasto */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 bg-gray-50">
              <div className="text-xs text-gray-500 mb-2">
                Top 3 categorías de gasto
              </div>
              {top3Categorias.length === 0 ? (
                <p className="text-xs text-gray-500">
                  Aún no hay gastos registrados.
                </p>
              ) : (
                <ul className="text-xs space-y-1">
                  {top3Categorias.map((item, idx) => (
                    <li
                      key={item.category}
                      className="flex justify-between items-center"
                    >
                      <span>
                        <span className="font-semibold mr-1">
                          #{idx + 1}
                        </span>
                        {item.category}
                      </span>
                      <span>
                        {formatMoney(item.total)}{" "}
                        <span className="text-gray-400">
                          ({item.percent.toFixed(1)}%)
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border rounded-lg p-4 bg-gray-50">
              <div className="text-xs text-gray-500 mb-2">
                Estado general
              </div>
              <ul className="text-xs space-y-1">
                <li>
                  Movimientos totales en el mes:{" "}
                  <span className="font-semibold">
                    {transactions.length}
                  </span>
                </li>
                <li>
                  Ingresos:{" "}
                  <span className="font-semibold">
                    {
                      transactions.filter((t) => t.type === "ingreso")
                        .length
                    }
                  </span>
                </li>
                <li>
                  Gastos:{" "}
                  <span className="font-semibold">
                    {
                      transactions.filter((t) => t.type === "gasto")
                        .length
                    }
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Visor mensual de gastos por categoría */}
        <section className="mb-8">
          <h2 className="font-semibold mb-2 text-sm">
            Visor mensual de gastos por categoría
          </h2>
          {gastosPorCategoria.length === 0 ? (
            <p className="text-xs text-gray-500">
              Aún no hay gastos registrados.
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
                  <div className="h-2 rounded bg-gray-200 overflow-hidden">
                    <div
                      className="h-2 rounded bg-sky-500"
                      style={{ width: `${Math.max(item.percent, 2)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Resumen inteligente (IA ligera) */}
        <section className="mb-8">
          <h2 className="font-semibold mb-2 text-sm">
            Resumen inteligente del mes
          </h2>
          {aiInsights.length === 0 ? (
            <p className="text-xs text-gray-500">
              Aún no hay suficientes datos para generar recomendaciones.
            </p>
          ) : (
            <ul className="list-disc pl-5 space-y-1 text-xs text-gray-700">
              {aiInsights.map((msg, idx) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
          )}
        </section>

        {/* Formulario de agregar movimiento */}
        <section className="mb-8">
          <h2 className="font-semibold mb-3">
            {editingId ? "Editar movimiento" : "Agregar movimiento"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3 text-sm">
            <div className="grid md:grid-cols-5 gap-3">
              {/* Tipo */}
              <div>
                <div className="text-xs text-gray-500 mb-1">Tipo</div>
                <div className="inline-flex border rounded overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handleChangeForm("type", "ingreso")}
                    className={`px-3 py-1 text-xs ${
                      form.type === "ingreso"
                        ? "bg-green-500 text-white"
                        : "bg-white text-gray-700"
                    }`}
                  >
                    Ingreso
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChangeForm("type", "gasto")}
                    className={`px-3 py-1 text-xs ${
                      form.type === "gasto"
                        ? "bg-red-500 text-white"
                        : "bg-white text-gray-700"
                    }`}
                  >
                    Gasto
                  </button>
                </div>
              </div>

              {/* Fecha */}
              <div>
                <div className="text-xs text-gray-500 mb-1">Fecha</div>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => handleChangeForm("date", e.target.value)}
                  className="border rounded px-2 py-1 w-full"
                />
              </div>

              {/* Categoría */}
              <div>
                <div className="text-xs text-gray-500 mb-1">Categoría</div>
                <select
                  value={form.category}
                  onChange={(e) =>
                    handleChangeForm("category", e.target.value)
                  }
                  className="border rounded px-2 py-1 w-full"
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
                <div className="text-xs text-gray-500 mb-1">Monto</div>
                <input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => handleChangeForm("amount", e.target.value)}
                  className="border rounded px-2 py-1 w-full"
                />
              </div>

              {/* Método */}
              <div>
                <div className="text-xs text-gray-500 mb-1">Método</div>
                <select
                  value={form.method}
                  onChange={(e) =>
                    handleChangeForm("method", e.target.value)
                  }
                  className="border rounded px-2 py-1 w-full"
                >
                  {methods.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Nueva categoría y método */}
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-500 mb-1">
                  Agregar nueva categoría
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="border rounded px-2 py-1 text-xs w-full"
                    placeholder="Ej. Vacaciones"
                  />
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    className="bg-gray-800 text-white text-xs px-3 py-1 rounded"
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">
                  Agregar nuevo método
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMethod}
                    onChange={(e) => setNewMethod(e.target.value)}
                    className="border rounded px-2 py-1 text-xs w-full"
                    placeholder="Ej. Tarjeta Amazon"
                  />
                  <button
                    type="button"
                    onClick={handleAddMethod}
                    className="bg-gray-800 text-white text-xs px-3 py-1 rounded"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Notas */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Notas</div>
              <textarea
                value={form.notes}
                onChange={(e) => handleChangeForm("notes", e.target.value)}
                className="border rounded px-3 py-2 w-full"
                placeholder="Descripción, quién pagó, etc."
              />
            </div>

            {/* Botones */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
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

            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </form>
        </section>

        {/* Filtros de la tabla */}
        <section className="mb-4">
          <h2 className="font-semibold mb-2 text-sm">
            Filtros de movimientos
          </h2>
          <div className="grid md:grid-cols-4 gap-3 text-xs items-end">
            {/* Tipo */}
            <div>
              <div className="text-gray-500 mb-1">Tipo</div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setFilterType("todos")}
                  className={`flex-1 border rounded px-2 py-1 ${
                    filterType === "todos"
                      ? "bg-sky-500 text-white border-sky-500"
                      : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType("ingreso")}
                  className={`flex-1 border rounded px-2 py-1 ${
                    filterType === "ingreso"
                      ? "bg-green-500 text-white border-green-500"
                      : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  Ingresos
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType("gasto")}
                  className={`flex-1 border rounded px-2 py-1 ${
                    filterType === "gasto"
                      ? "bg-red-500 text-white border-red-500"
                      : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  Gastos
                </button>
              </div>
            </div>

            {/* Categoría */}
            <div>
              <div className="text-gray-500 mb-1">Categoría</div>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="border rounded px-2 py-1 w-full"
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
              <div className="text-gray-500 mb-1">Método</div>
              <select
                value={filterMethod}
                onChange={(e) => setFilterMethod(e.target.value)}
                className="border rounded px-2 py-1 w-full"
              >
                <option value="TODOS">Todos</option>
                {methods.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Búsqueda */}
            <div>
              <div className="text-gray-500 mb-1">Buscar</div>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="border rounded px-2 py-1 w-full"
                placeholder="Notas, monto, fecha..."
              />
            </div>
          </div>

          <div className="mt-1 text-[11px] text-gray-500">
            Mostrando{" "}
            <span className="font-semibold">
              {filteredTransactions.length}
            </span>{" "}
            de{" "}
            <span className="font-semibold">{transactions.length}</span>{" "}
            movimientos del mes.
          </div>
        </section>

        {/* Tabla de movimientos */}
        <section>
          <h2 className="font-semibold mb-3 text-sm">
            Movimientos de {month}
          </h2>

          <div className="overflow-x-auto text-sm">
            <table className="min-w-full border border-gray-200 text-left text-xs md:text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border-b px-2 py-2">Fecha</th>
                  <th className="border-b px-2 py-2">Tipo</th>
                  <th className="border-b px-2 py-2">Categoría</th>
                  <th className="border-b px-2 py-2 text-right">Monto</th>
                  <th className="border-b px-2 py-2">Método</th>
                  <th className="border-b px-2 py-2">Notas</th>
                  <th className="border-b px-2 py-2 text-center">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {loading && (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-center py-4 text-gray-500"
                    >
                      Cargando movimientos...
                    </td>
                  </tr>
                )}

                {!loading && filteredTransactions.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-center py-4 text-gray-500"
                    >
                      Sin movimientos que coincidan con los filtros.
                    </td>
                  </tr>
                )}

                {!loading &&
                  filteredTransactions.map((t) => (
                    <tr
                      key={t.id}
                      className={`odd:bg-white even:bg-gray-50 ${
                        t.localOnly ? "opacity-60" : ""
                      }`}
                    >
                      {/* FECHA */}
                      <td className="border-t px-2 py-1">
                        {formatDateDisplay(t.date)}
                      </td>

                      {/* TIPO */}
                      <td className="border-t px-2 py-1">
                        {t.type === "ingreso" ? "Ingreso" : "Gasto"}
                      </td>

                      {/* CATEGORÍA */}
                      <td className="border-t px-2 py-1">{t.category}</td>

                      {/* MONTO */}
                      <td className="border-t px-2 py-1 text-right">
                        {formatMoney(t.amount)}
                      </td>

                      {/* MÉTODO */}
                      <td className="border-t px-2 py-1">{t.method}</td>

                      {/* NOTAS */}
                      <td className="border-t px-2 py-1 max-w-xs truncate">
                        {t.notes}
                      </td>

                      {/* ACCIONES */}
                      <td className="border-t px-2 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleEdit(t)}
                          className="text-xs text-sky-600 hover:underline mr-2"
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
    </div>
  );
}
