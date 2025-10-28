'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Tx = {
  id: string;
  date: string;                  // YYYY-MM-DD
  type: 'gasto' | 'ingreso';
  category: string;
  amount: number;
  method: string;
  notes?: string;
};

type FormState = {
  date: string;
  type: 'gasto' | 'ingreso';
  category: string;
  amount: string;
  method: string;
  notes: string;
};

export default function Home() {
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [form, setForm] = useState<FormState>({
    date: '',
    type: 'gasto',
    category: '',
    amount: '',
    method: '',
    notes: '',
  });

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Filtro por mes (yyyy-mm)
  const [month, setMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Editar
  const [editId, setEditId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Catálogos persistentes
  const [categories, setCategories] = useState<string[]>([]);
  const [methods, setMethods] = useState<string[]>([]);

  useEffect(() => {
    fetchCatalogs();
  }, []);

  useEffect(() => {
    fetchTransactions(month);
  }, [month]);

  async function fetchCatalogs() {
    // categories
    const { data: cData, error: cErr } = await supabase
      .from('categories').select('name').order('name', { ascending: true });
    if (!cErr) setCategories((cData || []).map((r: any) => r.name));

    // payment methods
    const { data: mData, error: mErr } = await supabase
      .from('payment_methods').select('name').order('name', { ascending: true });
    if (!mErr) setMethods((mData || []).map((r: any) => r.name));
  }

  function monthRange(yyyyMm: string) {
    const [y, m] = yyyyMm.split('-').map(Number);
    const start = `${yyyyMm}-01`;
    const endDate = new Date(y, m, 0); // último día del mes
    const end = endDate.toISOString().slice(0, 10);
    return { start, end };
  }

  async function fetchTransactions(selectedMonth?: string) {
    setLoading(true);
    setErr(null);
    const m = selectedMonth ?? month;
    const { start, end } = monthRange(m);

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching transactions:', error);
      setErr('No se pudo cargar la información');
      setLoading(false);
      return;
    }

    const rows: Tx[] = (data || []).map((r: any) => ({
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

  // Añadir "nuevo" catálogo desde el select
  async function maybeAddNewCatalog(kind: 'category' | 'method', value: string) {
    if (value !== '__new__') return;

    const label = kind === 'category' ? 'Nueva categoría' : 'Nuevo método de pago';
    const name = prompt(`${label}:`);
    if (!name) return;

    if (kind === 'category') {
      const { error } = await supabase.from('categories').insert({ name: name.trim() });
      if (error) return alert('No se pudo crear la categoría');
      setCategories(prev => Array.from(new Set([...prev, name.trim()])).sort());
      setForm(f => ({ ...f, category: name.trim() }));
    } else {
      const { error } = await supabase.from('payment_methods').insert({ name: name.trim() });
      if (error) return alert('No se pudo crear el método');
      setMethods(prev => Array.from(new Set([...prev, name.trim()])).sort());
      setForm(f => ({ ...f, method: name.trim() }));
    }
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    if (name === 'category' && value === '__new__') return maybeAddNewCatalog('category', value);
    if (name === 'method' && value === '__new__') return maybeAddNewCatalog('method', value);
    setForm({ ...form, [name]: value } as FormState);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const amt = Number(form.amount);
    if (Number.isNaN(amt) || amt <= 0) return alert('Ingresa un monto válido');
    if (!form.category) return alert('Selecciona una categoría');
    if (!form.method) return alert('Selecciona método de pago');

    const payload = {
      date: form.date || new Date().toISOString().slice(0, 10),
      type: form.type,
      category: form.category,
      amount: amt,
      method: form.method,
      notes: form.notes?.trim() || '',
    };

    if (editId) {
      const { error, data } = await supabase
        .from('transactions')
        .update(payload)
        .eq('id', editId)
        .select()
        .single();

      if (error) {
        console.error('Update error:', error);
        return alert('❌ No se pudo actualizar');
      }

      setTransactions(prev =>
        prev.map(t => (t.id === editId ? { ...t, ...payload } : t))
      );
      setEditId(null);
    } else {
      const { data, error } = await supabase
        .from('transactions')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('Insert error:', error);
        return alert('❌ No se pudo guardar');
      }
      setTransactions(prev => [
        { id: data!.id, ...payload },
        ...prev,
      ]);
    }

    setForm({ date: '', type: 'gasto', category: '', amount: '', method: '', notes: '' });
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este movimiento?')) return;
    setDeletingId(id);
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    setDeletingId(null);
    if (error) {
      console.error('Delete error:', error);
      return alert('❌ No se pudo eliminar');
    }
    setTransactions(prev => prev.filter(t => t.id !== id));
  }

  function startEdit(t: Tx) {
    setEditId(t.id);
    setForm({
      date: t.date,
      type: t.type,
      category: t.category,
      amount: String(t.amount),
      method: t.method,
      notes: t.notes || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Totales del mes (ya traemos filtrado por mes)
  const totalIncome = useMemo(
    () => transactions.filter(t => t.type === 'ingreso').reduce((s, t) => s + t.amount, 0),
    [transactions]
  );
  const totalExpense = useMemo(
    () => transactions.filter(t => t.type === 'gasto').reduce((s, t) => s + t.amount, 0),
    [transactions]
  );
  const flow = totalIncome - totalExpense;

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto bg-white shadow rounded-lg p-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
          <h1 className="text-2xl font-bold">💰 Finanzas Familiares</h1>

          {/* Filtro por mes */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Mes</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border rounded p-2"
            />
            <button
              onClick={() => fetchTransactions(month)}
              className="border rounded px-3 py-2 hover:bg-gray-50"
            >
              Aplicar
            </button>
          </div>
        </div>

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

        {/* Form */}
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

          {/* Categorías persistentes */}
          <select
            name="category"
            value={form.category}
            onChange={handleChange}
            className="col-span-1 border rounded p-2"
          >
            <option value="">Categoría…</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            <option value="__new__">➕ Nueva categoría…</option>
          </select>

          <input
            name="amount"
            type="number"
            placeholder="Monto"
            step="0.01"
            value={form.amount}
            onChange={handleChange}
            className="col-span-1 border rounded p-2"
          />

          {/* Métodos persistentes */}
          <select
            name="method"
            value={form.method}
            onChange={handleChange}
            className="col-span-1 border rounded p-2"
          >
            <option value="">Método…</option>
            {methods.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
            <option value="__new__">➕ Nuevo método…</option>
          </select>

          <button
            type="submit"
            className="col-span-1 bg-blue-600 text-white rounded p-2 hover:bg-blue-700"
          >
            {editId ? 'Guardar cambios' : 'Agregar'}
          </button>

          <textarea
            name="notes"
            placeholder="Notas (opcional)"
            value={form.notes}
            onChange={handleChange}
            className="col-span-6 border rounded p-2 mt-1"
          />
        </form>

        {/* Mensajes */}
        {loading && <p className="text-gray-500 mb-2">Cargando movimientos…</p>}
        {err && <p className="text-red-600 mb-2">{err}</p>}

        {/* Tabla */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-200">
              <th className="p-2 border">Fecha</th>
              <th className="p-2 border">Tipo</th>
              <th className="p-2 border">Categoría</th>
              <th className="p-2 border">Monto</th>
              <th className="p-2 border">Método</th>
              <th className="p-2 border">Notas</th>
              <th className="p-2 border w-[160px]">Acciones</th>
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
                <td className="p-2 space-x-2">
                  <button
                    onClick={() => startEdit(t)}
                    className="px-3 py-1 text-sm rounded border hover:bg-gray-100"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    disabled={deletingId === t.id}
                    className={`px-3 py-1 text-sm rounded border ${
                      deletingId === t.id ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-100'
                    }`}
                  >
                    {deletingId === t.id ? 'Eliminando…' : 'Eliminar'}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && transactions.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">
                  Sin movimientos en este mes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

