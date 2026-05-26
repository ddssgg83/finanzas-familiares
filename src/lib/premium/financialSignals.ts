import type {
  PremiumFamilyInput,
  PremiumGoalInput,
  PremiumNetWorthInput,
  PremiumSummaryInput,
} from "@/lib/premium/dashboardInsights";
import type { Locale } from "@/lib/i18n/config";

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
  locale?: Locale;
};

function formatMoney(value: number, locale: Locale = "es-MX") {
  return value.toLocaleString(locale, {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}

function copy(locale: Locale = "es-MX") {
  const en = locale === "en-US";
  return {
    projection: {
      noData: en ? "Not enough data" : "Sin datos suficientes",
      stable: en ? "Stable close" : "Cierre estable",
      pressured: en ? "Pressured close" : "Cierre presionado",
      tight: en ? "Tight margin" : "Margen apretado",
      noSpend: en ? "No projected spend" : "Sin gasto proyectado",
    },
    signals: {
      loadingTitle: en ? "Read in progress" : "Lectura en progreso",
      loadingBody: en
        ? "We are preparing your financial signals with the available data."
        : "Estamos preparando tus señales financieras con los datos disponibles.",
      dataErrorTitle: en ? "Incomplete data" : "Datos incompletos",
      dataErrorBody: en
        ? "Some numbers did not update. Use this read as a temporary reference."
        : "Algunas cifras no se actualizaron. Usa esta lectura como referencia temporal.",
      noSummaryTitle: en ? "Missing movements" : "Faltan movimientos",
      noSummaryBody: en
        ? "Register income and expenses to activate more precise signals."
        : "Registra ingresos y gastos para activar señales más precisas.",
      missingIncomeTitle: en ? "Income not captured" : "Ingresos sin capturar",
      missingIncomeBody: en
        ? "There are expenses registered, but income is missing. The balance may look more negative than reality."
        : "Hay gastos registrados, pero faltan ingresos. El balance puede verse más negativo de lo real.",
      negativeTitle: en ? "Negative monthly flow" : "Flujo mensual negativo",
      negativeBody: (value: string) =>
        en
          ? `The month is ${value} down. Review variable expenses before close.`
          : `El mes va ${value} abajo. Revisa gastos variables antes del cierre.`,
      surplusTitle: en ? "Available surplus" : "Excedente disponible",
      surplusBody: (value: string) =>
        en
          ? `There is ${value} of margin. Consider setting it aside before it gets diluted.`
          : `Hay ${value} de margen. Considera separarlo antes de que se diluya.`,
      tightMarginTitle: en ? "Tight margin" : "Margen ajustado",
      tightMarginBody: (percent: string) =>
        en
          ? `Expenses represent ${percent}% of this month’s income.`
          : `Los gastos representan ${percent}% de los ingresos del mes.`,
      projectionRiskTitle: en ? "Risk of a negative close" : "Riesgo de cierre negativo",
      projectionRiskBody: (value: string) =>
        en
          ? `At the current pace, the month could close at ${value}.`
          : `Al ritmo actual, el mes podría cerrar en ${value}.`,
      debtPressureTitle: en ? "High debt weight" : "Deuda con peso alto",
      debtPressureBody: en
        ? "Debts are already above 70% of registered assets."
        : "Las deudas ya pesan más del 70% de los activos registrados.",
      debtOverAssetsTitle: en ? "Debts over assets" : "Deudas sobre activos",
      debtOverAssetsBody: en
        ? "Your debts are above registered assets. Prioritize organizing balances."
        : "Tus deudas superan los activos registrados. Prioriza ordenar saldos.",
      noGoalsTitle: en ? "No active goal" : "Sin meta activa",
      noGoalsFamilyBody: en
        ? "Create a family goal to turn savings into a shared decision."
        : "Crea una meta familiar para convertir el ahorro en una decisión compartida.",
      noGoalsPersonalBody: en
        ? "A simple goal helps give surplus direction."
        : "Una meta simple ayuda a dar dirección al excedente.",
      allClearTitle: en ? "No urgent signals" : "Sin señales urgentes",
      allClearBody: en
        ? "We do not detect strong alerts with the current data."
        : "No detectamos alertas fuertes con los datos actuales.",
    },
  };
}

function getMonthTiming(now = new Date()) {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = Math.max(1, Math.min(now.getDate(), daysInMonth));
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);
  return { daysElapsed, daysInMonth, daysRemaining };
}

export function buildMonthlyProjection(input: FinancialSignalsInput): MonthlyProjection {
  const { summary, now } = input;
  const locale = input.locale ?? "es-MX";
  const t = copy(locale).projection;
  const { daysElapsed, daysInMonth } = getMonthTiming(now);

  if (!summary) {
    return {
      projectedExpenses: 0,
      projectedBalance: 0,
      dailyExpenseAverage: 0,
      daysElapsed,
      daysInMonth,
      confidence: "low",
      label: t.noData,
      tone: "neutral",
    };
  }

  const expenses = Math.max(0, Number(summary.expenses) || 0);
  const incomes = Math.max(0, Number(summary.incomes) || 0);
  const dailyExpenseAverage = expenses / daysElapsed;
  const projectedExpenses = dailyExpenseAverage * daysInMonth;
  const projectedBalance = incomes - projectedExpenses;
  const confidence = daysElapsed >= 10 ? "medium" : "low";

  let label = t.stable;
  let tone: MonthlyProjection["tone"] = "good";

  if (projectedBalance < 0) {
    label = t.pressured;
    tone = "critical";
  } else if (incomes > 0 && projectedExpenses / incomes > 0.9) {
    label = t.tight;
    tone = "warning";
  } else if (expenses <= 0) {
    label = t.noSpend;
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
  const locale = input.locale ?? "es-MX";
  const t = copy(locale).signals;
  const projection = buildMonthlyProjection(input);
  const signals: FinancialSignal[] = [];

  if (loading) {
    return [
      {
        id: "loading",
        title: t.loadingTitle,
        body: t.loadingBody,
        severity: "info",
      },
    ];
  }

  if (dataError) {
    signals.push({
      id: "data-error",
      title: t.dataErrorTitle,
      body: t.dataErrorBody,
      severity: "warning",
    });
  }

  if (!summary) {
    signals.push({
      id: "no-summary",
      title: t.noSummaryTitle,
      body: t.noSummaryBody,
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
        title: t.missingIncomeTitle,
        body: t.missingIncomeBody,
        severity: "warning",
      });
    }

    if (balance < 0) {
      signals.push({
        id: "negative-balance",
        title: t.negativeTitle,
        body: t.negativeBody(formatMoney(Math.abs(balance), locale)),
        severity: "critical",
        metric: formatMoney(balance, locale),
      });
    } else if (balance > 0) {
      signals.push({
        id: "positive-balance",
        title: t.surplusTitle,
        body: t.surplusBody(formatMoney(balance, locale)),
        severity: "good",
        metric: formatMoney(balance, locale),
      });
    }

    if (incomes > 0 && expenseRatio > 0.9) {
      signals.push({
        id: "tight-margin",
        title: t.tightMarginTitle,
        body: t.tightMarginBody((expenseRatio * 100).toFixed(0)),
        severity: "warning",
      });
    }

    if (projection.projectedBalance < 0 && balance >= 0) {
      signals.push({
        id: "projection-risk",
        title: t.projectionRiskTitle,
        body: t.projectionRiskBody(formatMoney(projection.projectedBalance, locale)),
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
        title: t.debtPressureTitle,
        body: t.debtPressureBody,
        severity: "warning",
      });
    }
    if (debts > assets && debts > 0) {
      signals.push({
        id: "debts-over-assets",
        title: t.debtOverAssetsTitle,
        body: t.debtOverAssetsBody,
        severity: "critical",
      });
    }
  }

  if (goals.length === 0) {
    signals.push({
      id: "no-goals",
      title: t.noGoalsTitle,
      body: family?.familyId ? t.noGoalsFamilyBody : t.noGoalsPersonalBody,
      severity: "info",
    });
  }

  if (signals.length === 0) {
    signals.push({
      id: "all-clear",
      title: t.allClearTitle,
      body: t.allClearBody,
      severity: "good",
    });
  }

  return signals.slice(0, 4);
}
