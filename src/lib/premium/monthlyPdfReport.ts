import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type MonthlyReportTx = {
  id: string;
  date: string;
  type: "ingreso" | "gasto";
  category: string;
  amount: number;
  method: string;
  notes?: string | null;
  localOnly?: boolean;
};

export type MonthlyPdfReportInput = {
  transactions: MonthlyReportTx[];
  month: string;
  monthLabel: string;
  scopeLabel: string;
  familyName?: string | null;
};

function formatMoney(value: number) {
  return value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}

function formatDate(value: string) {
  try {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return value;
    return new Date(year, month - 1, day).toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function truncate(value: string | null | undefined, max = 58) {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

function sumBy<T extends string>(items: MonthlyReportTx[], key: (tx: MonthlyReportTx) => T) {
  const map = new Map<T, number>();
  for (const tx of items) {
    map.set(key(tx), (map.get(key(tx)) ?? 0) + tx.amount);
  }
  return Array.from(map.entries())
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);
}

function countBy<T extends string>(items: MonthlyReportTx[], key: (tx: MonthlyReportTx) => T) {
  const map = new Map<T, number>();
  for (const tx of items) {
    map.set(key(tx), (map.get(key(tx)) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export function generateMonthlyPdfReport(input: MonthlyPdfReportInput) {
  const txs = input.transactions;
  if (!txs.length) {
    throw new Error("No hay movimientos para generar el reporte.");
  }

  const incomes = txs.filter((tx) => tx.type === "ingreso");
  const expenses = txs.filter((tx) => tx.type === "gasto");
  const totalIncome = incomes.reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpense = expenses.reduce((sum, tx) => sum + tx.amount, 0);
  const balance = totalIncome - totalExpense;
  const averageExpense = expenses.length ? totalExpense / expenses.length : 0;
  const categoryRows = sumBy(expenses, (tx) => tx.category || "Sin categoria");
  const methodRows = countBy(txs, (tx) => tx.method || "Sin metodo");
  const topCategory = categoryRows[0] ?? null;
  const topMethod = methodRows[0] ?? null;
  const generatedAt = new Date().toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const slate = [15, 23, 42] as [number, number, number];
  const muted = [100, 116, 139] as [number, number, number];
  const sky = [14, 116, 217] as [number, number, number];

  doc.setFillColor(...slate);
  doc.rect(0, 0, pageWidth, 34, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("RINDAY", marginX, 15);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Reporte mensual premium", marginX, 23);
  doc.setFontSize(10);
  doc.text(input.monthLabel, pageWidth - marginX, 15, { align: "right" });
  doc.text(input.scopeLabel, pageWidth - marginX, 23, { align: "right" });

  let y = 44;
  doc.setTextColor(...slate);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Resumen ejecutivo", marginX, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  const contextLine = input.familyName
    ? `Familia: ${input.familyName} · Generado: ${generatedAt}`
    : `Generado: ${generatedAt}`;
  doc.text(contextLine, marginX, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    body: [
      ["Ingresos", formatMoney(totalIncome)],
      ["Gastos", formatMoney(totalExpense)],
      ["Balance", formatMoney(balance)],
      ["Movimientos", String(txs.length)],
    ],
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 2.2 },
    columnStyles: {
      0: { textColor: muted, fontStyle: "bold" },
      1: { halign: "right", textColor: slate, fontStyle: "bold" },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 10;
  doc.setTextColor(...slate);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Insights", marginX, y);
  y += 7;

  const insights = [
    topCategory
      ? `Categoria con mas gasto: ${topCategory.label} (${formatMoney(topCategory.total)}).`
      : "No hay gastos registrados para calcular categoria principal.",
    topMethod
      ? `Metodo mas usado: ${topMethod.label} (${topMethod.count} movimiento${topMethod.count === 1 ? "" : "s"}).`
      : "No hay metodo dominante todavia.",
    `Gasto promedio por movimiento: ${formatMoney(averageExpense)}.`,
    balance < 0
      ? `Alerta: tus gastos superan tus ingresos por ${formatMoney(Math.abs(balance))}.`
      : "Sin alerta de flujo: tus ingresos cubren los gastos del periodo.",
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...slate);
  for (const insight of insights) {
    const lines = doc.splitTextToSize(`• ${insight}`, pageWidth - marginX * 2);
    doc.text(lines, marginX, y);
    y += lines.length * 5 + 2;
  }

  y += 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Gastos por categoria", marginX, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [["Categoria", "Total", "% de gastos"]],
    body: categoryRows.length
      ? categoryRows.map((row) => [
          row.label,
          formatMoney(row.total),
          totalExpense > 0 ? `${((row.total / totalExpense) * 100).toFixed(1)}%` : "0.0%",
        ])
      : [["Sin gastos", formatMoney(0), "0.0%"]],
    styles: { fontSize: 8.8, cellPadding: 2.2 },
    headStyles: { fillColor: slate, textColor: 255 },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
    },
    theme: "grid",
  });

  y = (doc as any).lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...slate);
  doc.text("Movimientos", marginX, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [["Fecha", "Tipo", "Categoria", "Metodo", "Monto", "Notas"]],
    body: txs.map((tx) => [
      formatDate(tx.date),
      tx.type === "ingreso" ? "Ingreso" : "Gasto",
      truncate(tx.category, 22),
      truncate(tx.method, 18),
      formatMoney(tx.amount),
      truncate(tx.notes, 46),
    ]),
    styles: { fontSize: 7.8, cellPadding: 1.7, overflow: "linebreak" },
    headStyles: { fillColor: sky, textColor: 255 },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 17 },
      4: { halign: "right", cellWidth: 24 },
      5: { cellWidth: 45 },
    },
    theme: "grid",
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(...muted);
      doc.text("Generado por RINDAY", marginX, pageHeight - 8);
      doc.text(`Pagina ${doc.getNumberOfPages()}`, pageWidth - marginX, pageHeight - 8, {
        align: "right",
      });
    },
  });

  doc.save(`rinday-reporte-${input.month}.pdf`);
}
