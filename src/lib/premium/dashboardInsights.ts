import {
  buildFinancialSignals,
  buildMonthlyProjection,
  type FinancialSignal,
  type MonthlyProjection,
} from "@/lib/premium/financialSignals";
import type { Locale } from "@/lib/i18n/config";

export type PremiumTone = "good" | "warning" | "critical" | "neutral";

export type PremiumSummaryInput = {
  incomes: number;
  expenses: number;
  balance: number;
  monthLabel: string;
} | null;

export type PremiumNetWorthInput = {
  assets: number;
  debts: number;
  netWorth: number;
} | null;

export type PremiumGoalInput = {
  id: string;
  title: string;
  targetAmount: number;
  deadline?: string;
  status: string;
};

export type PremiumFamilyInput = {
  familyId?: string | null;
  familyName?: string | null;
  activeMembers?: number | null;
} | null;

export type PremiumDashboardInput = {
  summary: PremiumSummaryInput;
  netWorth: PremiumNetWorthInput;
  goals: PremiumGoalInput[];
  family: PremiumFamilyInput;
  loading?: boolean;
  dataError?: string | null;
  locale?: Locale;
};

export type PremiumHealthModel = {
  score: number;
  label: string;
  tone: PremiumTone;
  factors: string[];
};

export type PremiumActionModel = {
  title: string;
  body: string;
  href?: string;
  actionLabel?: string;
};

export type PremiumRiskModel = {
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
};

export type PremiumFamilySummaryModel = {
  title: string;
  body: string;
  href?: string;
  actionLabel?: string;
};

export type PremiumDashboardModel = {
  health: PremiumHealthModel;
  nextAction: PremiumActionModel;
  risks: PremiumRiskModel[];
  familySummary: PremiumFamilySummaryModel;
  signals: FinancialSignal[];
  projection: MonthlyProjection;
};

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function money(value: number, locale: Locale = "es-MX") {
  return value.toLocaleString(locale, {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}

function copy(locale: Locale = "es-MX") {
  const en = locale === "en-US";
  return {
    score: {
      loading: en ? "Calculating" : "Calculando",
      good: en ? "Good pace" : "Buen ritmo",
      warning: en ? "Attention" : "Atención",
      critical: en ? "Priority" : "Prioridad",
      empty: en ? "Not enough data" : "Sin datos suficientes",
    },
    loadingFactor: en ? "We are reading your monthly summary." : "Estamos leyendo tu resumen del mes.",
    loadingActionTitle: en ? "Review the board" : "Revisar el tablero",
    loadingActionBody: en
      ? "Once your data loads, RINDAY will prioritize one concrete action for this month."
      : "En cuanto carguen tus datos, RINDAY priorizará una acción concreta para este mes.",
    loadingRiskTitle: en ? "Data loading" : "Datos en carga",
    loadingRiskBody: en
      ? "Alerts will update automatically when the read is complete."
      : "Las alertas se actualizarán automáticamente al terminar la lectura.",
    factors: {
      dataError: en ? "Some data could not be updated." : "Hay datos que no se pudieron actualizar.",
      noSummary: en
        ? "More movements are needed to calculate financial health."
        : "Aún faltan movimientos para calcular tu salud financiera.",
      noActivity: en
        ? "There is no income or expense registered this month."
        : "No hay ingresos ni gastos registrados este mes.",
      missingIncome: en
        ? "Register income to get a complete read."
        : "Registra ingresos para tener una lectura completa.",
      lowExpenseRatio: en
        ? "Your expenses are below 65% of income."
        : "Tus gastos están por debajo del 65% de tus ingresos.",
      manageableSpend: en
        ? "Your spending is within a manageable range."
        : "Tu gasto está dentro de un rango manejable.",
      tightMargin: en ? "Your monthly margin is very tight." : "Tu margen mensual está muy justo.",
      expensesOverIncome: en
        ? "This month, expenses are above income."
        : "Este mes los gastos superan los ingresos.",
      surplus: (value: string) =>
        en
          ? `You have ${value} available before month close.`
          : `Tienes ${value} disponibles antes de cerrar el mes.`,
      completeNetWorth: en
        ? "Add assets or debts to complete your net worth."
        : "Agrega activos o deudas para completar tu patrimonio.",
      noDebts: en
        ? "There are no debts registered in your net worth."
        : "No hay deudas registradas en tu patrimonio.",
      healthyDebt: en
        ? "Debt stays below 35% of registered assets."
        : "Tu deuda se mantiene por debajo del 35% de tus activos.",
      debtsOverAssets: en
        ? "Your debts are above registered assets."
        : "Tus deudas superan tus activos registrados.",
      watchDebt: en ? "Keep an eye on debt weight." : "Conviene vigilar el peso de tus deudas.",
      hasGoals: en
        ? "You already have visible financial goals."
        : "Ya tienes objetivos financieros visibles.",
      noGoals: en
        ? "A clear goal would help focus savings."
        : "Una meta clara ayudaría a enfocar el ahorro.",
    },
    actions: {
      firstMovementTitle: en ? "Capture your first movement" : "Captura tu primer movimiento",
      firstMovementBody: en
        ? "Register income or an expense to activate a more precise read."
        : "Registra un ingreso o gasto para activar una lectura más precisa.",
      goMovements: en ? "Go to movements" : "Ir a movimientos",
      completeIncomeTitle: en ? "Complete your income" : "Completa tus ingresos",
      completeIncomeBody: en
        ? "There are expenses registered, but income is missing. That distorts the monthly balance."
        : "Hay gastos registrados, pero faltan ingresos. Eso distorsiona tu balance del mes.",
      registerIncome: en ? "Register income" : "Registrar ingreso",
      reducePressureTitle: en ? "Reduce monthly pressure" : "Reduce presión del mes",
      reducePressureBody: en
        ? "Your spending is above income. Review variable movements before closing the period."
        : "Tu gasto supera tus ingresos. Revisa movimientos variables antes de cerrar el periodo.",
      reviewExpenses: en ? "Review expenses" : "Revisar gastos",
      prioritizeDebtTitle: en ? "Prioritize debt" : "Prioriza deuda",
      prioritizeDebtBody: en
        ? "Your debts weigh more than registered assets. The next step is organizing balances."
        : "Tus deudas pesan más que tus activos registrados. El siguiente avance está en ordenar saldos.",
      viewNetWorth: en ? "View net worth" : "Ver patrimonio",
      defineGoalTitle: en ? "Define a goal" : "Define una meta",
      defineFamilyGoalBody: en
        ? "Create a family goal to turn surplus into a shared decision."
        : "Crea una meta familiar para convertir el excedente en una decisión compartida.",
      definePersonalGoalBody: en
        ? "Create a simple goal to give your savings direction."
        : "Crea una meta simple para darle dirección a tu ahorro.",
      createGoal: en ? "Create goal" : "Crear meta",
      configureFamily: en ? "Set up family" : "Configurar familia",
      protectSurplusTitle: en ? "Protect the surplus" : "Protege el excedente",
      protectSurplusBody: en
        ? "Your month has margin. Set part of it aside before it gets diluted into operating spend."
        : "Tu mes va con margen. Separa una parte antes de que se diluya en gasto operativo.",
      viewGoals: en ? "View goals" : "Ver metas",
    },
    risks: {
      dataErrorTitle: en ? "Incomplete data" : "Datos incompletos",
      dataErrorBody: en
        ? "Some reads did not update. Try again with a stable connection."
        : "Algunas lecturas no se actualizaron. Intenta de nuevo con conexión estable.",
      noMonthlyReadTitle: en ? "No monthly read" : "Sin lectura mensual",
      noMonthlyReadBody: en
        ? "There are not enough movements yet to detect trends."
        : "Aún no hay movimientos suficientes para detectar tendencias.",
      missingIncomeTitle: en ? "Missing income" : "Ingresos faltantes",
      missingIncomeBody: en
        ? "There are expenses without registered income, so the balance may look worse than reality."
        : "Hay gastos sin ingresos registrados, así que el balance puede verse peor de lo real.",
      negativeFlowTitle: en ? "Negative cash flow" : "Flujo negativo",
      negativeFlowBody: (value: string) =>
        en
          ? `The month is ${value} down. Review variable expenses.`
          : `El mes va ${value} abajo. Conviene revisar gastos variables.`,
      lowMarginTitle: en ? "Reduced margin" : "Margen reducido",
      lowMarginBody: en
        ? "More than 90% of income is committed to this month’s expenses."
        : "Más del 90% del ingreso está comprometido en gastos del mes.",
      debtOverAssetsTitle: en ? "Debt over assets" : "Deuda sobre activos",
      debtOverAssetsBody: en
        ? "Your debts are above registered assets. Review balances and priorities."
        : "Tus deudas superan los activos registrados. Revisa saldos y prioridades.",
      noGoalTitle: en ? "No active goal" : "Sin meta activa",
      noGoalBody: en
        ? "A visible goal helps turn savings into a concrete decision."
        : "Una meta visible ayuda a convertir el ahorro en una decisión concreta.",
      noStrongRisksTitle: en ? "No strong risks" : "Sin riesgos fuertes",
      noStrongRisksBody: en
        ? "We do not detect important alerts with the current data."
        : "No detectamos alertas importantes con los datos actuales.",
    },
    family: {
      availableTitle: en ? "Family mode available" : "Modo familiar disponible",
      availableBody: en
        ? "Create or join your family to read goals, expenses, and shared decisions in one board."
        : "Crea o une tu familia para leer metas, gastos y decisiones compartidas en un mismo tablero.",
      goFamily: en ? "Go to Family" : "Ir a Familia",
      activeFamily: en ? "Active family" : "Familia activa",
      familyPrefix: en ? "Family" : "Familia",
      membersBody: (members: number) =>
        en
          ? `${members} active members to review decisions and goals together.`
          : `${members} miembros activos para revisar decisiones y metas en conjunto.`,
      readyBody: en
        ? "Your family space is ready. Invite members to collaborate."
        : "Tu espacio familiar ya está listo. Invita miembros para colaborar.",
      viewFamily: en ? "View family" : "Ver familia",
    },
  };
}

function scoreTone(score: number): PremiumTone {
  if (score >= 78) return "good";
  if (score >= 52) return "warning";
  if (score > 0) return "critical";
  return "neutral";
}

function scoreLabel(score: number, loading?: boolean, locale?: Locale) {
  const t = copy(locale).score;
  if (loading) return t.loading;
  if (score >= 78) return t.good;
  if (score >= 52) return t.warning;
  if (score > 0) return t.critical;
  return t.empty;
}

export function buildPremiumDashboardModel(input: PremiumDashboardInput): PremiumDashboardModel {
  const { summary, netWorth, goals, family, loading, dataError } = input;
  const locale = input.locale ?? "es-MX";
  const t = copy(locale);
  const factors: string[] = [];
  let score = 50;

  if (loading) {
    const signals = buildFinancialSignals(input);
    const projection = buildMonthlyProjection(input);
    return {
      health: {
        score: 0,
        label: t.score.loading,
        tone: "neutral",
        factors: [t.loadingFactor],
      },
      nextAction: {
        title: t.loadingActionTitle,
        body: t.loadingActionBody,
      },
      risks: [
        {
          title: t.loadingRiskTitle,
          body: t.loadingRiskBody,
          severity: "info",
        },
      ],
      familySummary: buildFamilySummary(family, locale),
      signals,
      projection,
    };
  }

  if (dataError) {
    score -= 10;
    factors.push(t.factors.dataError);
  }

  if (!summary) {
    score = 0;
    factors.push(t.factors.noSummary);
  } else {
    const income = Math.max(0, Number(summary.incomes) || 0);
    const expenses = Math.max(0, Number(summary.expenses) || 0);
    const balance = Number(summary.balance) || 0;
    const expenseRatio = income > 0 ? expenses / income : expenses > 0 ? 2 : 0;

    if (income <= 0 && expenses <= 0) {
      score = 18;
      factors.push(t.factors.noActivity);
    } else if (income <= 0) {
      score -= 28;
      factors.push(t.factors.missingIncome);
    } else if (expenseRatio <= 0.65) {
      score += 18;
      factors.push(t.factors.lowExpenseRatio);
    } else if (expenseRatio <= 0.9) {
      score += 8;
      factors.push(t.factors.manageableSpend);
    } else if (expenseRatio <= 1) {
      score -= 5;
      factors.push(t.factors.tightMargin);
    } else {
      score -= 24;
      factors.push(t.factors.expensesOverIncome);
    }

    if (balance > 0) {
      score += 8;
      factors.push(t.factors.surplus(money(balance, locale)));
    }
  }

  if (netWorth) {
    const assets = Math.max(0, Number(netWorth.assets) || 0);
    const debts = Math.max(0, Number(netWorth.debts) || 0);

    if (assets <= 0 && debts <= 0) {
      score -= 4;
      factors.push(t.factors.completeNetWorth);
    } else if (debts <= 0) {
      score += 8;
      factors.push(t.factors.noDebts);
    } else if (assets > 0 && debts / assets <= 0.35) {
      score += 8;
      factors.push(t.factors.healthyDebt);
    } else if (assets > 0 && debts > assets) {
      score -= 18;
      factors.push(t.factors.debtsOverAssets);
    } else {
      score -= 4;
      factors.push(t.factors.watchDebt);
    }
  }

  if (goals.length > 0) {
    score += 5;
    factors.push(t.factors.hasGoals);
  } else {
    score -= 5;
    factors.push(t.factors.noGoals);
  }

  const finalScore = clampScore(score);
  const signals = buildFinancialSignals(input);
  const projection = buildMonthlyProjection(input);

  return {
    health: {
      score: finalScore,
      label: scoreLabel(finalScore, loading, locale),
      tone: scoreTone(finalScore),
      factors: factors.slice(0, 3),
    },
    nextAction: buildNextAction(summary, netWorth, goals, family, locale),
    risks: buildRisks(summary, netWorth, goals, dataError, locale),
    familySummary: buildFamilySummary(family, locale),
    signals,
    projection,
  };
}

function buildNextAction(
  summary: PremiumSummaryInput,
  netWorth: PremiumNetWorthInput,
  goals: PremiumGoalInput[],
  family: PremiumFamilyInput,
  locale: Locale = "es-MX"
): PremiumActionModel {
  const t = copy(locale).actions;
  if (!summary) {
    return {
      title: t.firstMovementTitle,
      body: t.firstMovementBody,
      href: "/gastos",
      actionLabel: t.goMovements,
    };
  }

  if (summary.incomes <= 0 && summary.expenses > 0) {
    return {
      title: t.completeIncomeTitle,
      body: t.completeIncomeBody,
      href: "/gastos",
      actionLabel: t.registerIncome,
    };
  }

  if (summary.balance < 0) {
    return {
      title: t.reducePressureTitle,
      body: t.reducePressureBody,
      href: "/gastos",
      actionLabel: t.reviewExpenses,
    };
  }

  if (netWorth && netWorth.debts > Math.max(0, netWorth.assets)) {
    return {
      title: t.prioritizeDebtTitle,
      body: t.prioritizeDebtBody,
      href: "/patrimonio",
      actionLabel: t.viewNetWorth,
    };
  }

  if (goals.length === 0) {
    return {
      title: t.defineGoalTitle,
      body: family?.familyId ? t.defineFamilyGoalBody : t.definePersonalGoalBody,
      href: family?.familyId ? "/familia/objetivos/nuevo" : "/familia",
      actionLabel: family?.familyId ? t.createGoal : t.configureFamily,
    };
  }

  return {
    title: t.protectSurplusTitle,
    body: t.protectSurplusBody,
    href: "/familia/objetivos",
    actionLabel: t.viewGoals,
  };
}

function buildRisks(
  summary: PremiumSummaryInput,
  netWorth: PremiumNetWorthInput,
  goals: PremiumGoalInput[],
  dataError?: string | null,
  locale: Locale = "es-MX"
): PremiumRiskModel[] {
  const risks: PremiumRiskModel[] = [];
  const t = copy(locale).risks;

  if (dataError) {
    risks.push({
      title: t.dataErrorTitle,
      body: t.dataErrorBody,
      severity: "warning",
    });
  }

  if (!summary) {
    risks.push({
      title: t.noMonthlyReadTitle,
      body: t.noMonthlyReadBody,
      severity: "info",
    });
  } else {
    if (summary.incomes <= 0 && summary.expenses > 0) {
      risks.push({
        title: t.missingIncomeTitle,
        body: t.missingIncomeBody,
        severity: "warning",
      });
    }

    if (summary.balance < 0) {
      risks.push({
        title: t.negativeFlowTitle,
        body: t.negativeFlowBody(money(Math.abs(summary.balance), locale)),
        severity: "critical",
      });
    }

    if (summary.incomes > 0 && summary.expenses / summary.incomes > 0.9) {
      risks.push({
        title: t.lowMarginTitle,
        body: t.lowMarginBody,
        severity: "warning",
      });
    }
  }

  if (netWorth && netWorth.debts > Math.max(0, netWorth.assets)) {
    risks.push({
      title: t.debtOverAssetsTitle,
      body: t.debtOverAssetsBody,
      severity: "critical",
    });
  }

  if (goals.length === 0) {
    risks.push({
      title: t.noGoalTitle,
      body: t.noGoalBody,
      severity: "info",
    });
  }

  if (risks.length === 0) {
    risks.push({
      title: t.noStrongRisksTitle,
      body: t.noStrongRisksBody,
      severity: "info",
    });
  }

  return risks.slice(0, 3);
}

function buildFamilySummary(family: PremiumFamilyInput, locale: Locale = "es-MX"): PremiumFamilySummaryModel {
  const t = copy(locale).family;
  if (!family?.familyId) {
    return {
      title: t.availableTitle,
      body: t.availableBody,
      href: "/familia",
      actionLabel: t.goFamily,
    };
  }

  const members = Number(family.activeMembers ?? 0);
  return {
    title: family.familyName ? `${t.familyPrefix} ${family.familyName}` : t.activeFamily,
    body: members > 1 ? t.membersBody(members) : t.readyBody,
    href: "/familia/dashboard",
    actionLabel: t.viewFamily,
  };
}
