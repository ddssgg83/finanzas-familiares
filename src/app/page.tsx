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

export default function Home() {
  // 🔐 AUTH
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  // 💰 APP
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

  // 🌙 Tema global (para saber si es dark y ajustar gráficos)
  const { theme, systemTheme } = useTheme();
  const [mountedTheme, setMountedTheme] = useState(false);

  useEffect(() => {
    setMountedTheme(true);
  }, []);

  const currentTheme = theme === "system" ? systemTheme : theme;
  const isDark = mountedTheme && currentTheme === "dark";

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
    } catch (err) {
      console.error("Error cerrando sesión", err);
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

        setTransactions(
          (data ?? []).map((t: any) => ({
            id: t.id,
            date: t.date,
            type: t.type,
            category: t.category,
            amount: Number(t.amount),
            method: t.method,
            notes: t.notes,
          }))
        );

        if (typeof window !== "undefined") {
          localStorage.setItem(
            `ff-cache-${month}`,
            JSON.stringify(data ?? [])
          );
        }
      } catch (err: any) {
        console.error(err);
        setError("No se pudieron cargar los movimientos.");

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
  }, [month, user]);

  // --------------------------------------------------
  //   Sincronizar cola offline al volver internet
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

        // No borramos nada, sólo marcamos localOnly → false
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
  //   Totales
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
    // Agrupamos por fecha
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
  //   Resumen "inteligente" del mes (sin IA externa)
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
  //   Exportar CSV del mes (con opciones)
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
      t.date, // ya viene en yyyy-mm-dd
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
  //   Cambio de mes
  // --------------------------------------------------
  const handleChangeMonth = (value: string) => {
    setMonth(value);
  };

  // --------------------------------------------------
  //   Manejo formulario
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
      // 🔴 SIN CONEXIÓN → sólo local
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
          "Estás sin conexión. El movimiento se guardó sólo en este dispositivo y se enviará cuando vuelva el internet."
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
          id: data.id,
          date: data.date,
          type: data.type,
          category: data.category,
          amount: Number(data.amount),
          method: data.method,
          notes: data.notes,
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
    } catch (err: any) {
      console.error(err);
      alert("No se pudo eliminar el movimiento.");
    }
  };

  // --------------------------------------------------
  //   Editor de categorías y métodos
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

    const raw = date.toLocaleDateString("es-MX", {
      year: "numeric",
      month: "long",
    });

    // "noviembre de 2025" -> "Noviembre de 2025"
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [month]);

  // --------------------------------------------------
  //   Render: estados de auth
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
      {/* Header */}
      <header className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h1 className="text-lg font-semibold sm:text-xl">
            Finanzas familiares
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Controla ingresos, gastos y presupuesto mensual.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <span className="hidden text-[11px] text-slate-500 sm:inline">
            {user.email}
          </span>
          <button
            onClick={handleSignOut}
            className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

              {/* Mes + resumen + estado conexión */}
      <section className="space-y-4">
        {/* Tarjeta: mes + exportar + estado conexión */}
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
              {/* Etiqueta bonita con mayúscula */}
              <div className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-200">
                {monthLabel}
              </div>
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

              <button
                type="button"
                onClick={handleExportCsv}
                className="mt-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-emerald-700"
              >
                Descargar CSV
              </button>
            </div>
          )}
        </div>

        {/* Tarjetas resumen: ahora usan todo el ancho */}
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

      {/* Formulario */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold">
          {editingId ? "Editar movimiento" : "Agregar movimiento"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div className="grid gap-3 md:grid-cols-5">
            {/* Tipo */}
            <div>
              <div className="mb-1 text-xs text-gray-500 dark:text-gray-300">
                Tipo
              </div>
              <div className="inline-flex overflow-hidden rounded-lg border dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => handleChangeForm("type", "ingreso")}
                  className={`px-3 py-1 text-xs ${
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
                  className={`px-3 py-1 text-xs ${
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

          {error && (
            <p className="mt-1 text-xs text-red-500">{error}</p>
          )}
        </form>
      </section>

      {/* Filtros de movimientos */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-semibold">
          Filtros de movimientos
        </h2>
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

      {/* Tabla de movimientos */}
      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold">
          Movimientos de {month}
        </h2>

        <div className="overflow-x-auto text-sm">
          <table className="min-w-full border border-gray-200 text-left text-xs dark:border-slate-700 md:text-sm">
            <thead className="bg-gray-50 dark:bg-slate-900">
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
                    className="py-4 text-center text-gray-500"
                  >
                    Cargando movimientos...
                  </td>
                </tr>
              )}
              {!loading && filteredTransactions.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
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
                    className={`odd:bg-white even:bg-gray-50 dark:odd:bg-slate-800 dark:even:bg-slate-900 ${
                      t.localOnly ? "opacity-70" : ""
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
                    <td className="max-w-xs truncate border-t px-2 py-1">
                      {t.notes}
                    </td>
                    {/* ACCIONES */}
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
