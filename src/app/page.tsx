'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Transaction = {
  id: string;
  date: string;
  type: string;
  category: string;
  amount: number;
  method: string;
  notes?: string;
};

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [form, setForm] = useState({
    date: '',
    type: 'gasto',
    category: '',
    amount: '',
    method: '',
    notes: '',
  });

  // ✅ Load data from Supabase when page loads
  useEffect(() => {
    fetchTransactions();
  }, []);

  async function fetchTransactions() {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });

    if (error) console.error('Error fetching transactions:', error);
    else setTransactions(data || []);
  }

  // ✅ Handle form changes
  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  // ✅ Save a transaction to Supabase
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const { error } = await supabase.from('transactions').insert([
      {
        date: form.date || new Date().toISOString().split('T')[0],
        type: form.type,
        category: form.category,
        amount: parseFloat(form.amount),
        method: form.method,
        notes: form.notes,
      },
    ]);

    if (error) {
      console.error('Error adding transaction:', error);
      alert('❌ Error adding transaction');
    } else {
      alert('✅ Transaction added successfully!');
      setForm({ date: '', type: 'gasto', category: '', amount: '', method: '', notes: '' });
      fetchTransactions();
    }
  }

  // ✅ Calculate totals
  const totalIncome = transactions
    .filter(t => t.type === 'ingreso')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = transactions
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
            <p className="text-blue-600 font-bold text-xl">${flow.toFixed(2)}</p>
          </div>
        </div>

        {/* Add Transaction Form */}
        <form onSubmit={handleSubmit} className="grid grid-cols-6 gap-3 mb-6">
          <select name="type" value={form.type} onChange={handleChange} className="col-span-1 border rounded p-2">
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </select>

          <input name="date" type="date" value={form.date} onChange={handleChange} className="col-span-1 border rounded p-2" />
          <input name="category" placeholder="Categoría" value={form.category} onChange={handleChange} className="col-span-1 border rounded p-2" />
          <input name="amount" type="number" placeholder="Monto" value={form.amount} onChange={handleChange} className="col-span-1 border rounded p-2" />
          <input name="method" placeholder="Método de pago" value={form.method} onChange={handleChange} className="col-span-1 border rounded p-2" />
          <button type="submit" className="col-span-1 bg-blue-600 text-white rounded p-2 hover:bg-blue-700">Agregar</button>
        </form>

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
          </tbody>
        </table>
      </div>
    </div>
  );
}
