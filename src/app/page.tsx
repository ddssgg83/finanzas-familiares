'use client';

export const dynamic = 'force-dynamic';
// Quita esto si lo tenías: export const revalidate = 0;
// Opcional (aún más agresivo contra caché):
export const fetchCache = 'force-no-store';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Transaction = {
  id: string;
  date: string;       // YYYY-MM-DD
  type: 'gasto' | 'ingreso';
  category: string;
  amount: number;     // aseguramos number
  method: string;
  notes?: string;
};

type FormState = {
  date: string;
  type: 'gasto' | 'ingreso';
  category: string;
  amount: string;     // input de texto, luego lo convertimos
  method: string;
  notes: string;
};

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [form, setForm] = useState<FormState>({
    date: '',
    type: 'gasto',
    category: '',
    amount: '',
    method: '',
    notes: '',
  });

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchTransactions();
  }, []);

  async function fetchTransactions() {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching transactions:', error);
      setErr('No se pudo cargar la información');
      setLoading(false);
      return;
    }

    // normalizar tipos
    const rows: Transaction[] = (data || []).map((r: any) => ({
      id: r.id,
      date: r.date,
      type: r.type,
      category: r.category,
      amount: Number(r.amount) || 0,
      method: r.method,
      notes: r.notes ?? '',
    }));

    setTransactions(rows);
    setLoading(false);
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm({ ...form, [e.target.name]: e.target.value } as FormState);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const amt = Number(form.amount);
    if (Number.isNaN(amt) || amt <= 0) {
      alert('Ingresa un monto válido');
      return;
    }

    const payload = {
      date: form.date || new Date().toISOString().slice(0, 10),
      type: form.type,
      category: form.category || 'Sin categoría',
      amount: amt,
      method: form.method || 'Sin método',
      notes: form.notes?.trim() || '',
    };

    const { data, error } = await supabase
      .from('transactions')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Error adding transaction:', error);
      alert('❌ Error al guardar el movimiento');
      return;
    }

    // añadir el registro real que quedó en DB
    setTransactions(prev => [
      {
        id: data!.id,
        date: data!.date,
        type: data!.type,
        category: data!.category,
        amount: Number(data!.amount),
        method: data!.method,
        notes: data!.notes ?? '',
      },
      ...prev,
    ]);

    setForm({ date: '', type: 'gasto', category: '', amount: '', method: '', notes: '' });
  }

  async function handleDelete(id: string) {
  if (!confirm('¿Eliminar este movimiento?')) return;

  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) {
    console.error('Delete error:', error);
    alert('❌ No se pudo eliminar');
    return;
  }

  setTransactions(prev => prev.filter(t => t.id !== id));
}

  // === Totales del mes actual ===
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; // yyyy-mm

  const monthTx = useMemo(
    () => transactions.filter(t => t.date.startsWith(monthKey)),
    [transactions, monthKey]
  );

  const totalIncome = monthTx
    .filter(t => t.type === 'ingreso')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = monthTx
    .filter(t => t.type === 'gasto')
    .reduce((sum, t) => sum + t.amount, 0);

  const flow = totalIncome - totalExpense;

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-4">💰 Finanzas Familiares</h1>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6 text-center">
          <div>
            <p className="text-gray-500">Ingresos del mes</p>
            <p className="text-green-600 font-bold text-xl">${totalIncome.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-gray-500">Gastos del mes</p>
            <p className="text-red-600 font-bold text-xl">${totalExpense.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-gray-500">Flujo (Ingresos - Gastos)</p>
            <p className={`font-bold text-xl ${flow >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              ${flow.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Add Transaction Form */}
        <form onSubmit={handleSubmit} className="grid grid-cols-6 gap-3 mb-6">
          <select
            name="type"
            value={form.type}
            onChange={handleChange}
            className="col-span-1 border rounded p-2"
          >
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </select>

          <input
            name="date"
            type="date"
            value={form.date}
            onChange={handleChange}
            className="col-span-1 border rounded p-2"
          />
          <input
            name="category"
            placeholder="Categoría"
            value={form.category}
            onChange={handleChange}
            className="col-span-1 border rounded p-2"
          />
          <input
            name="amount"
            type="number"
            step="0.01"
            placeholder="Monto"
            value={form.amount}
            onChange={handleChange}
            className="col-span-1 border rounded p-2"
          />
          <input
            name="method"
            placeholder="Método de pago"
            value={form.method}
            onChange={handleChange}
            className="col-span-1 border rounded p-2"
          />
          <button
            type="submit"
            className="col-span-1 bg-blue-600 text-white rounded p-2 hover:bg-blue-700"
          >
            Agregar
          </button>

          <textarea
            name="notes"
            placeholder="Notas (opcional)"
            value={form.notes}
            onChange={handleChange}
            className="col-span-6 border rounded p-2 mt-1"
          />
        </form>

        {/* Loading / Error */}
        {loading && <p className="text-gray-500 mb-2">Cargando movimientos…</p>}
        {err && <p className="text-red-600 mb-2">{err}</p>}

        {/* Transaction List */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-200">
              <th className="p-2 border">Fecha</th>
              <th className="p-2 border">Tipo</th>
              <th className="p-2 border">Categoría</th>
              <th className="p-2 border">Monto</th>
              <th className="p-2 border">Método</th>
              <th className="p-2 border">Notas</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(t => (
              <tr key={t.id} className="text-center border-b hover:bg-gray-50">
                <td className="p-2">{t.date}</td>
                <td className="p-2 capitalize">{t.type}</td>
                <td className="p-2">{t.category}</td>
                <td className="p-2">${t.amount.toFixed(2)}</td>
                <td className="p-2">{t.method}</td>
                <td className="p-2">{t.notes}</td>
              </tr>
            ))}
            {!loading && transactions.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">
                  Sin movimientos todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
