"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type TxType = "gasto" | "ingreso";

type Tx = {
  id: string;
  date: string; // YYYY-MM-DD
  type: TxType;
  category: string;
  amount: number;
  method: string;
  notes?: string;
};

type FormState = {
  date: string;
  type: TxType;
  category: string;
  amount: string;
  method: string;
  notes: string;
};

const OFFLINE_QUEUE_KEY = "ff-offline-queue";

// Opciones por defecto (puedes irlas puliendo después)
const DEFAULT_CATEGORIES = [
  "Super/Despensa",
  "Escuela",
  "Renta",
  "Servicios",
  "Salud",
  "Transporte",
  "Otros",
];

const DEFAULT_METHODS = [
  "Efectivo",
  "BBVA crédito",
  "BBVA débito",
  "Transferencia",
  "Sin método",
];

export default function Home() {
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [form, setForm] = useState<FormState>({
    date: "",
    type: "gasto",
    category: DEFAULT_CATEGORIES[0],
    amount: "",
    method: DEFAULT_METHODS[0],
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [month, setMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
  });

  // ---------- Utilidades cola offline con localStorage ----------

  const loadOfflineQueue = (): Tx[] => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as Tx[];
    } catch {
      return [];
    }
  };

  const saveOfflineQueue = (queue: Tx[]) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  };

  const addToOfflineQueue = (tx: Tx) => {
    const queue = loadOfflineQueue();
    queue.push(tx);
    saveOfflineQueue(queue);
  };

  const syncOfflineQueue = async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    const queue = loadOfflineQueue();
    if (!queue.length) return;

    try {
      const { error } = await supabase.from("transactions").insert(queue);
      if (!error) {
        saveOfflineQueue([]);
        // Refrescamos desde Supabase para tener IDs correctos
        await fetchTransactions(currentMonthStartDate(), currentMonthEndDate());
      } else {
        console.error("Error al sincronizar cola offline:", error.message);
      }
    } catch (e) {
      console.error("Error al sincronizar cola offline:", e);
    }
  };

  // ---------- Fechas del mes seleccionado ----------

  const currentMonthStartDate = () => {
    const [y, m] = month.split("-");
    return `${y}-${m}-01`;
  };

  const currentMonthEndDate = () => {
    const [y, m] = month.split("-");
    const last = new Date(Number(y), Number(m), 0).getDate();
    return `${y}-${m}-${String(last).padStart(2, "0")}`;
  };

  // ---------- Cargar transacciones de Supabase ----------

  const fetchTransactions = async (from: string, to: string) => {
    setLoading(true);
    setErr(null);
    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: false });

      if (error) {
        setErr(error.message);
        return;
      }

      setTransactions(
        (data || []).map((t: any) => ({
          id: t.id,
          date: t.date,
          type: t.type,
          category: t.category,
          amount: Number(t.amount),
          method: t.method,
          notes: t.notes ?? "",
        }))
      );
    } catch (e: any) {
      setErr(e.message ?? "Error al cargar movimientos");
    } finally {
      setLoading(false);
    }
  };

  // ---------- Efectos de inicio ----------

  useEffect(() => {
    // Carga inicial
    fetchTransactions(currentMonthStartDate(), currentMonthEndDate());
    // Intenta sincronizar la cola si ya hay internet
    syncOfflineQueue();

    const onOnline = () => {
      syncOfflineQueue();
    };

    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-cargar al cambiar el mes
  useEffect(() => {
    fetchTransactions(currentMonthStartDate(), currentMonthEndDate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  // ---------- Totales del mes ----------

  const { income, expense, flow } = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of transactions) {
      if (t.type === "ingreso") income += t.amount;
      else expense += t.amount;
    }
    return { income, expense, flow: income - expense };
  }, [transactions]);

  // ---------- Manejo de formulario ----------

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAdd = async () => {
    if (!form.date || !form.category || !form.amount || !form.method) {
      alert("Por favor completa fecha, categoría, monto y método.");
      return;
    }

    const amountNumber = Number(form.amount);
    if (isNaN(amountNumber) || amountNumber <= 0) {
      alert("El monto debe ser un número mayor a 0.");
      return;
    }

    const newTx: Tx = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}`,
      date: form.date,
      type: form.type,
      category: form.category,
      amount: amountNumber,
      method: form.method,
      notes: form.notes || "",
    };

    // Actualizamos UI de inmediato
    setTransactions((prev) => [newTx, ...prev]);

    // Limpiamos formulario
    setForm((prev) => ({
      ...prev,
      amount: "",
      notes: "",
    }));

    // Si NO hay conexión → guardamos en cola offline y listo
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      addToOfflineQueue(newTx);
      alert(
        "Sin conexión: el movimiento se guardó en este dispositivo y se enviará cuando vuelvas a tener internet."
      );
      return;
    }

    // Si hay conexión → intentamos guardar en Supabase
    try {
      const { error } = await supabase.from("transactions").insert([
        {
          ...newTx,
          amount: newTx.amount,
        },
      ]);

      if (error) {
        setErr(error.message);
        alert("Ocurrió un error al guardar en el servidor.");
      } else {
        // Refrescamos desde el servidor por si se generaron IDs/valores nuevos
        await fetchTransactions(currentMonthStartDate(), currentMonthEndDate());
      }
    } catch (e: any) {
      setErr(e.message ?? "Error desconocido al guardar");
      alert("Ocurrió un error al guardar en el servidor.");
    }
  };

  // ---------- Render ----------

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-5xl mx-auto bg-white shadow rounded-lg p-6 mt-4">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <span className="text-amber-500 text-3xl">💰</span>
            Finanzas Familiares
          </h1>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Mes</label>
            <input
              type="month"
              className="border rounded px-2 py-1 text-sm"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
        </header>

        {/* Resumen */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="border rounded-lg p-3 text-center">
            <p className="text-sm text-gray-500">Ingresos del mes</p>
            <p className="text-xl font-semibold text-emerald-600">
              ${income.toFixed(2)}
            </p>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <p className="text-sm text-gray-500">Gastos del mes</p>
            <p className="text-xl font-semibold text-red-600">
              ${expense.toFixed(2)}
            </p>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <p className="text-sm text-gray-500">Flujo (Ingresos - Gastos)</p>
            <p
              className={`text-xl font-semibold ${
                flow >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              ${flow.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Formulario */}
        <section className="mb-6">
          <h2 className="text-lg font-medium mb-3">Agregar movimiento</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tipo</label>
              <div className="flex rounded border overflow-hidden">
                <button
                  type="button"
                  className={`flex-1 py-1 text-sm ${
                    form.type === "ingreso"
                      ? "bg-emerald-500 text-white"
                      : "bg-white"
                  }`}
                  onClick={() =>
                    setForm((prev) => ({ ...prev, type: "ingreso" }))
                  }
                >
                  Ingreso
                </button>
                <button
                  type="button"
                  className={`flex-1 py-1 text-sm ${
                    form.type === "gasto" ? "bg-red-500 text-white" : "bg-white"
                  }`}
                  onClick={() =>
                    setForm((prev) => ({ ...prev, type: "gasto" }))
                  }
                >
                  Gasto
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Fecha</label>
              <input
                type="date"
                name="date"
                className="w-full border rounded px-2 py-1 text-sm"
                value={form.date}
                onChange={handleChange}
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Categoría
              </label>
              <select
                name="category"
                className="w-full border rounded px-2 py-1 text-sm"
                value={form.category}
                onChange={handleChange}
              >
                {DEFAULT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Monto</label>
              <input
                type="number"
                name="amount"
                className="w-full border rounded px-2 py-1 text-sm"
                value={form.amount}
                onChange={handleChange}
                min={0}
                step="0.01"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Método de pago
              </label>
              <select
                name="method"
                className="w-full border rounded px-2 py-1 text-sm"
                value={form.method}
                onChange={handleChange}
              >
                {DEFAULT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">
              Notas (opcional)
            </label>
            <textarea
              name="notes"
              className="w-full border rounded px-2 py-1 text-sm"
              rows={2}
              value={form.notes}
              onChange={handleChange}
              placeholder="Descripción, quién pagó, folio, etc."
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAdd}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "Guardando..." : "Agregar"}
            </button>
          </div>
        </section>

        {/* Mensaje de error */}
        {err && (
          <p className="text-sm text-red-600 mb-2">
            Error: {err}. Intenta nuevamente.
          </p>
        )}

        {/* Tabla */}
        <section>
          <h2 className="text-lg font-medium mb-3">
            Movimientos de {month}
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border px-2 py-1 text-left">Fecha</th>
                  <th className="border px-2 py-1 text-left">Tipo</th>
                  <th className="border px-2 py-1 text-left">Categoría</th>
                  <th className="border px-2 py-1 text-right">Monto</th>
                  <th className="border px-2 py-1 text-left">Método</th>
                  <th className="border px-2 py-1 text-left">Notas</th>
                </tr>
              </thead>
              <tbody>
                {!loading && transactions.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-center text-gray-500 py-3"
                    >
                      Sin movimientos en este mes.
                    </td>
                  </tr>
                )}
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="border px-2 py-1">
                      {new Date(t.date).toLocaleDateString("es-MX")}
                    </td>
                    <td className="border px-2 py-1">
                      {t.type === "ingreso" ? "Ingreso" : "Gasto"}
                    </td>
                    <td className="border px-2 py-1">{t.category}</td>
                    <td className="border px-2 py-1 text-right">
                      ${t.amount.toFixed(2)}
                    </td>
                    <td className="border px-2 py-1">{t.method}</td>
                    <td className="border px-2 py-1">{t.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
