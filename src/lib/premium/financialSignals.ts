import type {
  PremiumFamilyInput,
  PremiumGoalInput,
  PremiumNetWorthInput,
  PremiumSummaryInput,
} from "@/lib/premium/dashboardInsights";

export type FinancialSignalSeverity = "info" | "warning" | "critical" | "good";

export type FinancialSignal = {
  id: string;
  title: string;
  body: string;
  severity: FinancialSignalSeverity;
  metric?: string;
};

export type MonthlyProjection = {
  projectedExpenses: number;
  projectedBalance: number;
  dailyExpenseAverage: number;
  daysElapsed: number;
  daysInMonth: number;
  confidence: "low" | "medium";
  label: string;
  tone: "good" | "warning" | "critical" | "neutral";
};

export type FinancialSignalsInput = {
  summary: PremiumSummaryInput;
  netWorth: PremiumNetWorthInput;
  goals: PremiumGoalInput[];
  family: PremiumFamilyInput;
  loading?: boolean;
  dataError?: string | null;
  now?: Date;
};

function formatMoney(value: number) {
  return value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}

function getMonthTiming(now = new Date()) {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = Math.max(1, Math.min(now.getDate(), daysInMonth));
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);
  return { daysElapsed, daysInMonth, daysRemaining };
}

export function buildMonthlyProjection(input: FinancialSignalsInput): MonthlyProjection {
  const { summary, now } = input;
  const { daysElapsed, daysInMonth } = getMonthTiming(now);

  if (!summary) {
    return {
      projectedExpenses: 0,
      projectedBalance: 0,
      dailyExpenseAverage: 0,
      daysElapsed,
      daysInMonth,
      confidence: "low",
      label: "Sin datos suficientes",
      tone: "neutral",
    };
  }

  const expenses = Math.max(0, Number(summary.expenses) || 0);
  const incomes = Math.max(0, Number(summary.incomes) || 0);
  const dailyExpenseAverage = expenses / daysElapsed;
  const projectedExpenses = dailyExpenseAverage * daysInMonth;
  const projectedBalance = incomes - projectedExpenses;
  const confidence = daysElapsed >= 10 ? "medium" : "low";

  let label = "Cierre estable";
  let tone: MonthlyProjection["tone"] = "good";

  if (projectedBalance < 0) {
    label = "Cierre presionado";
    tone = "critical";
  } else if (incomes > 0 && projectedExpenses / incomes > 0.9) {
    label = "Margen apretado";
    tone = "warning";
  } else if (expenses <= 0) {
    label = "Sin gasto proyectado";
    tone = "neutral";
  }

  return {
    projectedExpenses,
    projectedBalance,
    dailyExpenseAverage,
    daysElapsed,
    daysInMonth,
    confidence,
    label,
    tone,
  };
}

export function buildFinancialSignals(input: FinancialSignalsInput): FinancialSignal[] {
  const { summary, netWorth, goals, family, loading, dataError } = input;
  const projection = buildMonthlyProjection(input);
  const signals: FinancialSignal[] = [];

  if (loading) {
    return [
      {
        id: "loading",
        title: "Lectura en progreso",
        body: "Estamos preparando tus señales financieras con los datos disponibles.",
        severity: "info",
      },
    ];
  }

  if (dataError) {
    signals.push({
      id: "data-error",
      title: "Datos incompletos",
      body: "Algunas cifras no se actualizaron. Usa esta lectura como referencia temporal.",
      severity: "warning",
    });
  }

  if (!summary) {
    signals.push({
      id: "no-summary",
      title: "Faltan movimientos",
      body: "Registra ingresos y gastos para activar señales mas precisas.",
      severity: "info",
    });
  } else {
    const incomes = Math.max(0, summary.incomes);
    const expenses = Math.max(0, summary.expenses);
    const balance = summary.balance;
    const expenseRatio = incomes > 0 ? expenses / incomes : 0;

    if (incomes <= 0 && expenses > 0) {
      signals.push({
        id: "missing-income",
        title: "Ingresos sin capturar",
        body: "Hay gastos registrados, pero faltan ingresos. El balance puede verse mas negativo de lo real.",
        severity: "warning",
      });
    }

    if (balance < 0) {
      signals.push({
        id: "negative-balance",
        title: "Flujo mensual negativo",
        body: `El mes va ${formatMoney(Math.abs(balance))} abajo. Revisa gastos variables antes del cierre.`,
        severity: "critical",
        metric: formatMoney(balance),
      });
    } else if (balance > 0) {
      signals.push({
        id: "positive-balance",
        title: "Excedente disponible",
        body: `Hay ${formatMoney(balance)} de margen. Considera separarlo antes de que se diluya.`,
        severity: "good",
        metric: formatMoney(balance),
      });
    }

    if (incomes > 0 && expenseRatio > 0.9) {
      signals.push({
        id: "tight-margin",
        title: "Margen ajustado",
        body: `Los gastos representan ${(expenseRatio * 100).toFixed(0)}% de los ingresos del mes.`,
        severity: "warning",
      });
    }

    if (projection.projectedBalance < 0 && balance >= 0) {
      signals.push({
        id: "projection-risk",
        title: "Riesgo de cierre negativo",
        body: `Al ritmo actual, el mes podria cerrar en ${formatMoney(projection.projectedBalance)}.`,
        severity: "warning",
      });
    }
  }

  if (netWorth) {
    const assets = Math.max(0, netWorth.assets);
    const debts = Math.max(0, netWorth.debts);
    if (assets > 0 && debts / assets > 0.7) {
      signals.push({
        id: "debt-pressure",
        title: "Deuda con peso alto",
        body: "Las deudas ya pesan mas del 70% de los activos registrados.",
        severity: "warning",
      });
    }
    if (debts > assets && debts > 0) {
      signals.push({
        id: "debts-over-assets",
        title: "Deudas sobre activos",
        body: "Tus deudas superan los activos registrados. Prioriza ordenar saldos.",
        severity: "critical",
      });
    }
  }

  if (goals.length === 0) {
    signals.push({
      id: "no-goals",
      title: "Sin meta activa",
      body: family?.familyId
        ? "Crea una meta familiar para convertir el ahorro en una decision compartida."
        : "Una meta simple ayuda a dar direccion al excedente.",
      severity: "info",
    });
  }

  if (signals.length === 0) {
    signals.push({
      id: "all-clear",
      title: "Sin señales urgentes",
      body: "No detectamos alertas fuertes con los datos actuales.",
      severity: "good",
    });
  }

  return signals.slice(0, 4);
}
