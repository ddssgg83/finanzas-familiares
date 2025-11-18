'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { saveOfflineTx, syncOfflineTxs } from "@/lib/offline";

export const dynamic = 'force-dynamic';

type TxType = 'ingreso' | 'gasto';

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

const CATEGORIES: { label: string; value: string }[] = [
  { label: 'Sueldo', value: 'SUELDO' },
  { label: 'Comisión', value: 'COMISION' },
  { label: 'Super / Despensa', value: 'SUPER' },
  { label: 'Escuela', value: 'ESCUELA' },
  { label: 'Renta', value: 'RENTA' },
  { label: 'Servicios', value: 'SERVICIOS' },
  { label: 'Gasolina', value: 'GASOLINA' },
  { label: 'Entretenimiento', value: 'ENTRETENIMIENTO' },
  { label: 'Otros', value: 'OTROS' },
];

const METHODS: { label: string; value: string }[] = [
  { label: 'Efectivo', value: 'EFECTIVO' },
  { label: 'Transferencia', value: 'TRANSFERENCIA' },
  { label: 'BBVA crédito', value: 'BBVA_CREDITO' },
  { label: 'BBVA débito', value: 'BBVA_DEBITO' },
  { label: 'Tarjeta crédito otra', value: 'CREDITO_OTRA' },
  { label: 'Tarjeta débito otra', value: 'DEBITO_OTRA' },
];

function getCurrentMonthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`; // 2025-11
}

function formatMoney(num: number) {
  return num.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  });
}

export default function Home() {
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [month, setMonth] = useState<string>(() => getCurrentMonthKey());
  const [form, setForm] = useState<FormState>({
    date: '',
    type: 'gasto',
    category: CATEGORIES[0]?.value ?? '',
    amount: '',
    method: METHODS[0]?.value ?? '',
    notes: '',
  });

  // 🔹 Estado para editar
  const [editingId, setEditingId] = useState<string | null>(null);

  // 🔹 Presupuesto del mes
  const [budgetInput, setBudgetInput] = useState('');
  const [budget, setBudget] = useState<number | null>(null);

  // 🔹 Saber si hay conexión
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // --------------------------------------------------
  //   Cargar transacciones del mes
  // --------------------------------------------------
  useEffect(() => {
    const handlerOnline = () => setIsOnline(true);
    const handlerOffline = () => setIsOnline(false);

    window.addEventListener('online', handlerOnline);
    window.addEventListener('offline', handlerOffline);

    return () => {
      window.removeEventListener('online', handlerOnline);
      window.removeEventListener('offline', handlerOffline);
    };
  }, []);

  useEffect(() => {
  // Sólo corre en el navegador
  if (typeof window === "undefined") return;

  async function loadOffline() {
    try {
      const offline = await getOfflineTxs();
      if (offline.length) {
        // Los marcamos como localOnly para poder distinguirlos si hace falta
        setTransactions((prev) => [
          ...offline.map((t) => ({ ...t, localOnly: true })),
          ...prev,
        ]);
      }
    } catch (err) {
      console.error("Error cargando movimientos offline", err);
    }
  }

  loadOffline();
}, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [year, monthNumber] = month.split('-');
        const from = `${month}-01`;
        const to = `${month}-${new Date(
          Number(year),
          Number(monthNumber),
          0
        )
          .getDate()
          .toString()
          .padStart(2, '0')}`;

        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .gte('date', from)
          .lte('date', to)
          .order('date', { ascending: false });

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
useEffect(() => {
  // En build de Next (servidor) no existe window
  if (typeof window === "undefined") return;

  const handleOnline = async () => {
    try {
      const synced = await syncOfflineTxs();

      if (synced > 0) {
        alert(
          `Se sincronizaron ${synced} movimientos que estaban guardados sin conexión.`
        );
        // Recargamos la página para volver a leer todo de Supabase
        window.location.reload();
      }
    } catch (err) {
      console.error("Error al sincronizar movimientos offline", err);
    }
  };

  window.addEventListener("online", handleOnline);

  return () => {
    window.removeEventListener("online", handleOnline);
  };
}, []);


        // Cache local simple por si quieres usar después
        localStorage.setItem(
          `ff-cache-${month}`,
          JSON.stringify(data ?? [])
        );
      } catch (err: any) {
  console.error(err);
  setError('No se pudieron cargar los movimientos.');
  // Intentar leer cache local
  const cache = localStorage.getItem(`ff-cache-${month}`);
  if (cache) {
    try {
      const parsed = JSON.parse(cache);
      setTransactions(
        parsed.map((t: any) => ({
          id: t.id,
          date: t.date,
          type: t.type,
          category: t.category,
          amount: Number(t.amount),
          method: t.method,
          notes: t.notes,
        }))
      );
    } catch (_) {}
  }
} finally {
  setLoading(false);
}

    }

    load();
  }, [month]);

  // --------------------------------------------------
  //   Presupuesto mensual (localStorage)
  // --------------------------------------------------
  useEffect(() => {
    const key = `ff-budget-${month}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const val = Number(raw);
      setBudget(Number.isFinite(val) ? val : null);
      setBudgetInput(Number.isFinite(val) ? String(val) : '');
    } else {
      setBudget(null);
      setBudgetInput('');
    }
  }, [month]);

  const handleSaveBudget = () => {
    const val = Number(budgetInput);
    if (!Number.isFinite(val) || val <= 0) {
      alert('Ingresa un presupuesto válido mayor a 0.');
      return;
    }
    setBudget(val);
    localStorage.setItem(`ff-budget-${month}`, String(val));
  };

  // --------------------------------------------------
  //   Totales
  // --------------------------------------------------
  const { totalIngresos, totalGastos } = useMemo(() => {
    let ingresos = 0;
    let gastos = 0;
    for (const t of transactions) {
      if (t.type === 'ingreso') ingresos += t.amount;
      else gastos += t.amount;
    }
    return { totalIngresos: ingresos, totalGastos: gastos };
  }, [transactions]);

  const flujo = totalIngresos - totalGastos;
  const disponible =
    budget != null ? budget - totalGastos : null;

  // --------------------------------------------------
  //   Cambio de mes
  // --------------------------------------------------
  const handleChangeMonth = (value: string) => {
    setMonth(value);
  };

  // --------------------------------------------------
  //   Manejo formulario
  // --------------------------------------------------
  const handleChangeForm = (
    field: keyof FormState,
    value: string
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setForm({
      date: '',
      type: 'gasto',
      category: CATEGORIES[0]?.value ?? '',
      amount: '',
      method: METHODS[0]?.value ?? '',
      notes: '',
    });
    setEditingId(null);
  };

  // --------------------------------------------------
  //   Guardar (crear o editar)
  // --------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountNumber = Number(form.amount);
    if (!form.date) {
      alert('Selecciona una fecha.');
      return;
    }
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      alert('Ingresa un monto válido mayor a 0.');
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
      if (!isOnline) {
        // Solo guardamos localmente cuando no hay conexión
        const tempId = `offline-${Date.now()}`;
        const newTx: Tx = { id: tempId, ...payload };
        setTransactions((prev) => [newTx, ...prev]);

        // Opcional: cola offline muy simple
        const queueRaw = localStorage.getItem('ff-offline-queue') ?? '[]';
        const queue = JSON.parse(queueRaw) as any[];
        queue.push({ op: 'insert', payload });
        localStorage.setItem('ff-offline-queue', JSON.stringify(queue));

        alert(
          'Estás sin conexión. El movimiento se guardó sólo en este dispositivo.'
        );
        resetForm();
        return;
      }

      if (editingId) {
        // 🔵 EDITAR
        const { error } = await supabase
          .from('transactions')
          .update(payload)
          .eq('id', editingId);

        if (error) throw error;

        setTransactions((prev) =>
          prev.map((t) =>
            t.id === editingId ? { ...t, ...payload } : t
          )
        );
      } else {
        // 🟢 NUEVO
        const { data, error } = await supabase
          .from('transactions')
          .insert(payload)
          .select('*')
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
      setError('No se pudo guardar el movimiento.');
      alert('No se pudo guardar el movimiento.');
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
      notes: tx.notes ?? '',
    });
    setEditingId(tx.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (tx: Tx) => {
   // Antes de hablar con Supabase, chequeamos si hay conexión
if (typeof navigator !== "undefined" && !navigator.onLine) {
  const id = crypto.randomUUID();

  const localTx: Tx = {
    id,
    date: form.date,            // usa tus nombres de campos
    type: form.type,            // "ingreso" | "gasto"
    category: form.category,
    amount: Number(form.amount),
    method: form.method,
    notes: form.notes,
    localOnly: true,
  };

  // 1) Lo pintamos en pantalla
  setTransactions((prev) => [localTx, ...prev]);

  // 2) Lo guardamos en IndexedDB
  try {
    await saveOfflineTx({
      id: localTx.id,
      date: localTx.date,
      type: localTx.type,
      category: localTx.category,
      amount: localTx.amount,
      method: localTx.method,
      notes: localTx.notes,
    });
  } catch (err) {
    console.error("Error guardando movimiento offline", err);
  }

  alert("Estás sin conexión. El movimiento se guardó sólo en este dispositivo.");

  setLoading(false);
  return; // importante: no seguimos a Supabase
}


    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', tx.id);

      if (error) throw error;

      setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
    } catch (err: any) {
      console.error(err);
      alert('No se pudo eliminar el movimiento.');
    }
  };

  // --------------------------------------------------
  //   UI
  // --------------------------------------------------
  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-');
    const date = new Date(Number(y), Number(m) - 1, 1);
    return date.toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
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
            <div className="text-xs text-gray-400 mt-1">
              {monthLabel}
            </div>
          </div>

          <div
            className={`text-xs px-3 py-1 rounded-full inline-flex items-center gap-2 ${
              isOnline
                ? 'bg-green-100 text-green-700'
                : 'bg-yellow-100 text-yellow-700'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-green-500' : 'bg-yellow-500'
              }`}
            />
            {isOnline ? 'Conectado' : 'Sin conexión (modo sólo local)'}
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
                flujo >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {formatMoney(flujo)}
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-gray-50">
            <div className="text-xs text-gray-500">
              Presupuesto de gastos
            </div>
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
                    ? 'text-red-600'
                    : 'text-green-700'
                }`}
              >
                Disponible:{' '}
                {disponible != null ? formatMoney(disponible) : '-'}
              </div>
            )}
          </div>
        </div>

        {/* Formulario */}
        <section className="mb-8">
          <h2 className="font-semibold mb-3">
            {editingId ? 'Editar movimiento' : 'Agregar movimiento'}
          </h2>

          <form
            onSubmit={handleSubmit}
            className="space-y-3 text-sm"
          >
            <div className="grid md:grid-cols-5 gap-3">
              {/* Tipo */}
              <div>
                <div className="text-xs text-gray-500 mb-1">Tipo</div>
                <div className="inline-flex border rounded overflow-hidden">
                  <button
                    type="button"
                    onClick={() =>
                      handleChangeForm('type', 'ingreso')
                    }
                    className={`px-3 py-1 text-xs ${
                      form.type === 'ingreso'
                        ? 'bg-green-500 text-white'
                        : 'bg-white text-gray-700'
                    }`}
                  >
                    Ingreso
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChangeForm('type', 'gasto')}
                    className={`px-3 py-1 text-xs ${
                      form.type === 'gasto'
                        ? 'bg-red-500 text-white'
                        : 'bg-white text-gray-700'
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
                  onChange={(e) =>
                    handleChangeForm('date', e.target.value)
                  }
                  className="border rounded px-2 py-1 w-full"
                />
              </div>

              {/* Categoría */}
              <div>
                <div className="text-xs text-gray-500 mb-1">
                  Categoría
                </div>
                <select
                  value={form.category}
                  onChange={(e) =>
                    handleChangeForm('category', e.target.value)
                  }
                  className="border rounded px-2 py-1 w-full"
                >
                  {CATEGORIES.map((c) => (
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
                  onChange={(e) =>
                    handleChangeForm('amount', e.target.value)
                  }
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
                    handleChangeForm('method', e.target.value)
                  }
                  className="border rounded px-2 py-1 w-full"
                >
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
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
                  handleChangeForm('notes', e.target.value)
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
                  ? 'Guardando...'
                  : editingId
                  ? 'Guardar cambios'
                  : 'Agregar'}
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
                  <th className="border-b px-2 py-2 text-right">
                    Monto
                  </th>
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
                    <tr key={t.id} className="odd:bg-white even:bg-gray-50">
                      <td className="border-t px-2 py-1">
                        {new Date(t.date).toLocaleDateString('es-MX')}
                      </td>
                      <td className="border-t px-2 py-1">
                        {t.type === 'ingreso' ? 'Ingreso' : 'Gasto'}
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
