'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { savePending, flushPending, PendingTx } from '@/lib/offline';

// Si tienes tus propios componentes, puedes usarlos.
// import DashboardCharts from '@/components/DashboardCharts';

type Tx = {
  id: string;
  date: string;                 // YYYY-MM-DD
  type: 'gasto' | 'ingreso';
  category: string;
  amount: number;
  method: string;
  notes?: string | null;
};

type FormState = {
  date: string;
  type: 'gasto' | 'ingreso';
  category: string;
  amount: string;               // como string del input
  method: string;
  notes: string;
};

export default function Home() {
  // ------------------ Estado ------------------
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Filtro de mes (YYYY-MM)
  const [month, setMonth] = useState<string>(() => {
    const d = new Date();
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return ym;
  });

  const [form, setForm] = useState<FormState>({
    date: '',
    type: 'gasto',
    category: '',
    amount: '',
    method: '',
    notes: '',
  });

  // ------------------ Utilidades ------------------
  function monthRange(ym: string) {
    // ym = '2025-11'
    const [y, m] = ym.split('-').map(Number);
    const start = new Date(y, (m - 1), 1);
    const end = new Date(y, (m - 1) + 1, 1);
    const toISO = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD
    return { gte: toISO(start), lt: toISO(end) };
  }

  const totals = useMemo(() => {
    let ingresos = 0;
    let gastos = 0;
    for (const t of transactions) {
      if (t.type === 'ingreso') ingresos += t.amount;
      else gastos += t.amount;
    }
    return { ingresos, gastos, flujo: ingresos - gastos };
  }, [transactions]);

  // ------------------ Cargar datos ------------------
  async function fetchTransactions() {
    try {
      setLoading(true);
      setErr(null);

      const { gte, lt } = monthRange(month);

      const { data, error } = await supabase
        .from('transactions')
        .select('id, date, type, category, amount, method, notes')
        .gte('date', gte)
        .lt('date', lt)
        .order('date', { ascending: false });

      if (error) throw error;

      // Normaliza a Tx
      setTransactions(
        (data ?? []).map((r: any) => ({
          id: String(r.id),
          date: r.date,
          type: r.type,
          category: r.category,
          amount: Number(r.amount),
          method: r.method,
          notes: r.notes ?? null,
        }))
      );
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ?? 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTransactions();
  }, [month]);

  // Al volver online, intenta mandar la cola
  useEffect(() => {
    async function onOnline() {
      const sender = async (tx: PendingTx) => {
        const { error } = await supabase.from('transactions').insert({
          date: tx.date,
          type: tx.type,
          category: tx.category,
          amount: tx.amount,
          method: tx.method,
          notes: tx.notes ?? null,
        });
        if (error) throw error;
      };
      await flushPending(sender);
      // refresca la vista del mes actual
      await fetchTransactions();
    }

    window.addEventListener('online', onOnline);
    // Por si hay pendientes y ya hay internet al abrir
    onOnline();

    return () => window.removeEventListener('online', onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------ Acciones ------------------
  function handleChange<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  function validateForm(): string | null {
    if (!form.date) return 'Falta la fecha';
    if (!form.category.trim()) return 'Falta la categoría';
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return 'Monto inválido';
    if (!form.method.trim()) return 'Falta el método de pago';
    return null;
  }

  async function onAdd() {
    const v = validateForm();
    if (v) {
      alert(`⚠️ ${v}`);
      return;
    }

    const payload = {
      date: form.date,
      type: form.type,
      category: form.category.trim(),
      amount: Number(form.amount),
      method: form.method.trim(),
      notes: form.notes.trim(),
    };

    try {
      if (!navigator.onLine) {
        // OFFLINE: guarda en la cola y pinto el registro "local"
        savePending(payload);
        alert('💾 Guardado offline. Se enviará cuando vuelvas a tener internet.');

        setTransactions((prev) => [
          {
            id: 'local-' + Date.now(),
            ...payload,
          },
          ...prev,
        ]);

        // Limpia formulario
        setForm((p) => ({ ...p, category: '', amount: '', method: '', notes: '' }));
        return;
      }

      // ONLINE: guardado normal en Supabase
      const { error } = await supabase.from('transactions').insert({
        date: payload.date,
        type: payload.type,
        category: payload.category,
        amount: payload.amount,
        method: payload.method,
        notes: payload.notes || null,
      });
      if (error) throw error;

      await fetchTransactions();
      setForm((p) => ({ ...p, category: '', amount: '', method: '', notes: '' }));
    } catch (e: any) {
      console.error(e);
      alert('❌ No se pudo guardar');
    }
  }

  // ------------------ UI ------------------
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-semibold mb-6">Finanzas Familiares</h1>

        {/* Filtro de mes */}
        <div className="flex items-center gap-2 mb-6">
          <input
            className="border rounded px-3 py-2"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <button
            className="px-3 py-2 rounded bg-gray-100 border"
            onClick={fetchTransactions}
          >
            Aplicar
          </button>
          {err ? <span className="text-red-600 ml-3">Error: {err}</span> : null}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Kpi title="Ingresos del mes" value={totals.ingresos} color="text-green-600" />
          <Kpi title="Gastos del mes" value={totals.gastos} color="text-red-600" />
          <Kpi
            title="Flujo (Ingresos - Gastos)"
            value={totals.flujo}
            color={totals.flujo >= 0 ? 'text-blue-600' : 'text-red-600'}
          />
        </div>

        {/* Formulario */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
          <select
            className="border rounded px-3 py-2"
            value={form.type}
            onChange={(e) => handleChange('type', e.target.value as 'gasto' | 'ingreso')}
          >
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </select>

          <input
            type="date"
            className="border rounded px-3 py-2"
            value={form.date}
            onChange={(e) => handleChange('date', e.target.value)}
          />

          <input
            placeholder="Categoría"
            className="border rounded px-3 py-2"
            value={form.category}
            onChange={(e) => handleChange('category', e.target.value)}
          />

          <input
            placeholder="Monto"
            className="border rounded px-3 py-2"
            value={form.amount}
            onChange={(e) => handleChange('amount', e.target.value)}
            inputMode="decimal"
          />

          <input
            placeholder="Método de pago"
            className="border rounded px-3 py-2"
            value={form.method}
            onChange={(e) => handleChange('method', e.target.value)}
          />

          <button
            className="bg-blue-600 text-white rounded px-4 py-2"
            onClick={onAdd}
          >
            Agregar
          </button>
        </div>

        <textarea
          placeholder="Notas (opcional)"
          className="border rounded w-full px-3 py-2 mb-4"
          value={form.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
        />

        {/* Tabla */}
        <div className="overflow-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Fecha</Th>
                <Th>Tipo</Th>
                <Th>Categoría</Th>
                <Th align="right">Monto</Th>
                <Th>Método</Th>
                <Th>Notas</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="p-3 text-center" colSpan={6}>
                    Cargando...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td className="p-3 text-center text-gray-500" colSpan={6}>
                    Sin movimientos en este mes.
                  </td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t.id} className="border-t">
                    <Td>{t.date}</Td>
                    <Td className={t.type === 'ingreso' ? 'text-green-700' : 'text-red-700'}>
                      {t.type}
                    </Td>
                    <Td>{t.category}</Td>
                    <Td align="right">${t.amount.toFixed(2)}</Td>
                    <Td>{t.method}</Td>
                    <Td>{t.notes ?? ''}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Si tienes DashboardCharts, descomenta: */}
        {/* <div className="mt-8">
          <DashboardCharts transactions={transactions} />
        </div> */}
      </div>
    </div>
  );
}

// ---------- UI helpers ----------
function Kpi({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div className="rounded border p-4">
      <div className="text-gray-600 text-sm">{title}</div>
      <div className={`text-2xl font-semibold ${color}`}>${value.toFixed(2)}</div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' | 'left' }) {
  return (
    <th className={`p-3 text-left font-medium ${align === 'right' ? 'text-right' : ''}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  className,
}: {
  children: React.ReactNode;
  align?: 'right' | 'left';
  className?: string;
}) {
  return (
    <td className={`p-3 ${align === 'right' ? 'text-right' : ''} ${className ?? ''}`}>
      {children}
    </td>
  );
}
