'use client';

import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

type Transaction = {
  id: string;
  date: string;
  type: 'gasto' | 'ingreso';
  category: string;
  amount: number;
  method: string;
};

interface Props {
  transactions: Transaction[];
}

const COLORS = ['#34d399', '#f87171', '#60a5fa', '#fbbf24', '#a78bfa', '#fb7185', '#10b981'];

export default function DashboardCharts({ transactions }: Props) {
  if (!transactions.length) {
    return <p className="text-gray-500 text-center">No hay datos suficientes para generar gráficas.</p>;
  }

  // Agrupar gastos por categoría
  const expenseData = Object.entries(
    transactions
      .filter(t => t.type === 'gasto')
      .reduce((acc: Record<string, number>, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {})
  ).map(([name, value]) => ({ name, value }));

  // Totales por método de pago
  const methodData = Object.entries(
    transactions.reduce((acc: Record<string, number>, t) => {
      acc[t.method] = (acc[t.method] || 0) + t.amount;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  // Flujo diario (ingresos vs gastos)
  const flowData = Object.values(
    transactions.reduce((acc: Record<string, { date: string; ingreso: number; gasto: number }>, t) => {
      const key = t.date;
      if (!acc[key]) acc[key] = { date: key, ingreso: 0, gasto: 0 };
      acc[key][t.type] += t.amount;
      return acc;
    }, {})
  ).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="mt-8 space-y-10">
      {/* GASTOS POR CATEGORÍA */}
      <div>
        <h2 className="text-lg font-semibold text-gray-700 mb-3 text-center">Distribución de gastos por categoría</h2>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={expenseData}
              dataKey="value"
              nameKey="name"
              outerRadius={120}
              label
            >
              {expenseData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* GASTOS VS INGRESOS POR DÍA */}
      <div>
        <h2 className="text-lg font-semibold text-gray-700 mb-3 text-center">Flujo diario (ingresos vs gastos)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={flowData}>
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="ingreso" fill="#34d399" name="Ingresos" />
            <Bar dataKey="gasto" fill="#f87171" name="Gastos" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* GASTOS POR MÉTODO DE PAGO */}
      <div>
        <h2 className="text-lg font-semibold text-gray-700 mb-3 text-center">Totales por método de pago</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={methodData}>
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" fill="#60a5fa" name="Total" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
