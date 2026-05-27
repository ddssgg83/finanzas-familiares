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
import { useI18n } from "@/lib/i18n/useI18n";

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
  const { dictionary } = useI18n();
  const t = dictionary.expenses;

  return (
    <div className="mt-2 grid gap-4 md:grid-cols-2">
      <Card>
        <Section title={t.expensesByCategory}>
          {chartDataCategorias.length === 0 ? (
            <EmptyState>{t.expensesByCategoryEmpty}</EmptyState>
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
                  name={t.expense}
                  radius={4}
                  fill={isDark ? "#38bdf8" : "#0ea5e9"}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>
      </Card>

      <Card>
        <Section title={t.chartTrendTitle}>
          {chartDataLinea.length === 0 ? (
            <EmptyState>{t.chartTrendEmpty}</EmptyState>
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
                  name={t.income}
                  dot={false}
                  stroke={isDark ? "#22c55e" : "#16a34a"}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="gastos"
                  name={t.expense}
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
