"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
} from "recharts";

import {
  Card,
  EmptyState,
  Section,
} from "@/components/ui/kit";

type CategoriaPoint = {
  category: string;
  total: number;
};

type LineaPoint = {
  dateLabel: string;
  ingresos: number;
  gastos: number;
};

export default function GastosCharts({
  isDark,
  chartDataCategorias,
  chartDataLinea,
}: {
  isDark: boolean;
  chartDataCategorias: CategoriaPoint[];
  chartDataLinea: LineaPoint[];
}) {
  return (
    <div className="mt-2 grid gap-4 md:grid-cols-2">
      <Card>
        <Section title="Gastos por categoría">
          {chartDataCategorias.length === 0 ? (
            <EmptyState>Aún no hay gastos registrados.</EmptyState>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={chartDataCategorias}
                margin={{ top: 10, right: 10, left: 0, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="category"
                  tick={{ fontSize: 10, fill: isDark ? "#e5e7eb" : "#374151" }}
                  angle={-30}
                  textAnchor="end"
                />
                <YAxis tick={{ fontSize: 10, fill: isDark ? "#e5e7eb" : "#374151" }} />
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
        </Section>
      </Card>

      <Card>
        <Section title="Ingresos vs Gastos por día">
          {chartDataLinea.length === 0 ? (
            <EmptyState>Aún no hay movimientos suficientes.</EmptyState>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartDataLinea}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fontSize: 10, fill: isDark ? "#e5e7eb" : "#374151" }}
                />
                <YAxis tick={{ fontSize: 10, fill: isDark ? "#e5e7eb" : "#374151" }} />
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
        </Section>
      </Card>
    </div>
  );
}
