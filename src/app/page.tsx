'use client';

import { useEffect, useMemo, useState } from "react";
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

export default function Home() {
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

  // 🔹 Estado para editar
  const [editingId, setEditingId] = useState<string | null>(null);

  // 🔹 Presupuesto del mes
  const [budgetInput, setBudgetInput] = useState("");
  const [budget, setBudget] = useState<number | null>(null);

  // 🔹 Saber si hay conexión
  const [isOnline, setIsOnline] = useState<boolean>(true);

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
  }, [month]);

  // --------------------------------------------------
  //   Cuando vuelva el internet, sincronizar cola offline
  // --------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = async () => {
      try {
        const synced = await syncOfflineTxs(); // OfflineTx[]

        if (!synced.length) return;

        alert(
          `Se sincronizaron ${synced.length} movimientos que estaban guardados sin conexión.`
        );

        setTransactions((prev) => {
          const syncedMap = new Map<string, any>();
          synced.forEach((t: any) => {
            syncedMap.set(t.id, t);
          });

          // Dejamos:
          // - todos los que NO son localOnly
          // - y los localOnly que aún NO se sincronizan
          const remaining: Tx[] = prev.filter(
            (tx) => !(tx.localOnly && syncedMap.has(tx.id))
          );

          const syncedAsTx: Tx[] = synced.map((t: any) => ({
            id: t.id,
            date: t.date,
            type: t.type,
            category: t.category,
            amount: t.amount,
            method: t.method,
            notes: t.notes,
            localOnly: false,
          }));

          return [...syncedAsTx, ...remaining];
        });
      } catch (err) {
        console.error("Error al sincronizar movimientos offline", err);
      }
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, []);

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
  //   Agregado mensual por categoría (solo gastos)
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
      // 🔴 SIN CONEXIÓN → guardamos sólo en local
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const id = crypto.randomUUID();

        const localTx: Tx = {
          id,
          ...payload,
          localOnly: true,
        };

        // 1) Lo pintamos en pantalla
        setTransactions((prev) => [localTx, ...prev]);

        // 2) Lo guardamos en storage offline
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

      // 🟢 CON CONEXIÓN → flujo normal (editar o crear)
      if (editingId) {
        const { error } = await supabase
          .from("transactions")
          .update(payload)
          .eq("id", editingId);

        if (error) throw error;

        setTransactions((prev) =>
          prev.map((t) => (t.id === editingId ? { ...t, ...payload } : t))
        );
      } else {
        const { data, error } = await supabase
          .from("transactions")
          .insert(payload)
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
    } catch (err: any) {
      console.error(err);
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

    try {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", tx.id);

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
      alert("Ese método de pago ya existe.");
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
  //   UI
  // --------------------------------------------------
  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-");
    const date = new Date(Number(y), Number(m) - 1, 1);
    return date.toLocaleDateString("es-MX", {
      year: "numeric",
      month: "long",
    });
  }, [month]);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-sky-500 text-white py-2 text-center text-sm">
        Finanzas Familiares
      </header>

      <main className="max-w-5xl mx-auto bg-white shadow rounded-lg p-6 mt-4 mb-8">
        {/* Mes + estado conexión */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <div>
            <div className="text-sm text-gray-500">Mes</div>
            <input
              type="month"
              value={month}
              onChange={(e) => handleChangeMonth(e.target.value)}
              className="border rounded px-3 py-1 text-sm"
            />
            <div className="text-xs text-gray-400 mt-1">{monthLabel}</div>
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
            {isOnline ? "Conectado" : "Sin conexión (modo sólo local)"}
          </div>
        </div>

        {/* Tarjetas resumen + presupuesto */}
        <div className="grid md:grid-cols-4 gap-4 mb-6">
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
            <div className="text-xs text-gray-500">Presupuesto de gastos</div>
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

        {/* Visor mensual: gastos por categoría (gráfica tipo barras) */}
        <section className="mb-8">
          <h2 className="font-semibold mb-2 text-sm">
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
                  <div className="h-2 rounded bg-gray-200 overflow-hidden">
                    <div
                      className="h-2 rounded bg-sky-500"
                      style={{
                        width: `${Math.max(item.percent, 2)}%`, // siempre algo visible
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Formulario */}
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
                <div className="text-xs text-gray-500 mb-1">
                  Método de pago
                </div>
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

            {/* Editor rápido de categorías y métodos */}
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
                    placeholder="Ej. Vacaciones, Mascotas, etc."
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
                  Agregar nuevo método de pago
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMethod}
                    onChange={(e) => setNewMethod(e.target.value)}
                    className="border rounded px-2 py-1 text-xs w-full"
                    placeholder="Ej. Tarjeta Amazon, Mercado Pago, etc."
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
              <div className="text-xs text-gray-500 mb-1">
                Notas (opcional)
              </div>
              <textarea
                value={form.notes}
                onChange={(e) =>
                  handleChangeForm("notes", e.target.value)
                }
                className="border rounded px-3 py-2 w-full"
                placeholder="Descripción, quién pagó, folio, etc."
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

            {error && (
              <p className="text-xs text-red-600 mt-1">{error}</p>
            )}
          </form>
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
                  <th className="border-b px-2 py-2 text-center">
                    Acciones
                  </th>
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
                {!loading && transactions.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-center py-4 text-gray-500"
                    >
                      Sin movimientos en este mes.
                    </td>
                  </tr>
                )}
                {!loading &&
                  transactions.map((t) => (
                    <tr
                      key={t.id}
                      className={`odd:bg-white even:bg-gray-50 ${
                        t.localOnly ? "opacity-70" : ""
                      }`}
                    >
                      <td className="border-t px-2 py-1">
                        {new Date(t.date).toLocaleDateString("es-MX")}
                      </td>
                      <td className="border-t px-2 py-1">
                        {t.type === "ingreso" ? "Ingreso" : "Gasto"}
                      </td>
                      <td className="border-t px-2 py-1">
                        {t.category}
                      </td>
                      <td className="border-t px-2 py-1 text-right">
                        {formatMoney(t.amount)}
                      </td>
                      <td className="border-t px-2 py-1">{t.method}</td>
                      <td className="border-t px-2 py-1 max-w-xs truncate">
                        {t.notes}
                      </td>
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
