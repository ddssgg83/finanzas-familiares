import {
  buildFinancialSignals,
  buildMonthlyProjection,
  type FinancialSignal,
  type MonthlyProjection,
} from "@/lib/premium/financialSignals";

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

function money(value: number) {
  return value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}

function scoreTone(score: number): PremiumTone {
  if (score >= 78) return "good";
  if (score >= 52) return "warning";
  if (score > 0) return "critical";
  return "neutral";
}

function scoreLabel(score: number, loading?: boolean) {
  if (loading) return "Calculando";
  if (score >= 78) return "Buen ritmo";
  if (score >= 52) return "Atención";
  if (score > 0) return "Prioridad";
  return "Sin datos suficientes";
}

export function buildPremiumDashboardModel(input: PremiumDashboardInput): PremiumDashboardModel {
  const { summary, netWorth, goals, family, loading, dataError } = input;
  const factors: string[] = [];
  let score = 50;

  if (loading) {
    const signals = buildFinancialSignals(input);
    const projection = buildMonthlyProjection(input);
    return {
      health: {
        score: 0,
        label: "Calculando",
        tone: "neutral",
        factors: ["Estamos leyendo tu resumen del mes."],
      },
      nextAction: {
        title: "Revisar el tablero",
        body: "En cuanto carguen tus datos, RINDAY priorizará una acción concreta para este mes.",
      },
      risks: [
        {
          title: "Datos en carga",
          body: "Las alertas se actualizarán automáticamente al terminar la lectura.",
          severity: "info",
        },
      ],
      familySummary: buildFamilySummary(family),
      signals,
      projection,
    };
  }

  if (dataError) {
    score -= 10;
    factors.push("Hay datos que no se pudieron actualizar.");
  }

  if (!summary) {
    score = 0;
    factors.push("Aún faltan movimientos para calcular tu salud financiera.");
  } else {
    const income = Math.max(0, Number(summary.incomes) || 0);
    const expenses = Math.max(0, Number(summary.expenses) || 0);
    const balance = Number(summary.balance) || 0;
    const expenseRatio = income > 0 ? expenses / income : expenses > 0 ? 2 : 0;

    if (income <= 0 && expenses <= 0) {
      score = 18;
      factors.push("No hay ingresos ni gastos registrados este mes.");
    } else if (income <= 0) {
      score -= 28;
      factors.push("Registra ingresos para tener una lectura completa.");
    } else if (expenseRatio <= 0.65) {
      score += 18;
      factors.push("Tus gastos están por debajo del 65% de tus ingresos.");
    } else if (expenseRatio <= 0.9) {
      score += 8;
      factors.push("Tu gasto está dentro de un rango manejable.");
    } else if (expenseRatio <= 1) {
      score -= 5;
      factors.push("Tu margen mensual está muy justo.");
    } else {
      score -= 24;
      factors.push("Este mes los gastos superan los ingresos.");
    }

    if (balance > 0) {
      score += 8;
      factors.push(`Tienes ${money(balance)} disponibles antes de cerrar el mes.`);
    }
  }

  if (netWorth) {
    const assets = Math.max(0, Number(netWorth.assets) || 0);
    const debts = Math.max(0, Number(netWorth.debts) || 0);

    if (assets <= 0 && debts <= 0) {
      score -= 4;
      factors.push("Agrega activos o deudas para completar tu patrimonio.");
    } else if (debts <= 0) {
      score += 8;
      factors.push("No hay deudas registradas en tu patrimonio.");
    } else if (assets > 0 && debts / assets <= 0.35) {
      score += 8;
      factors.push("Tu deuda se mantiene por debajo del 35% de tus activos.");
    } else if (assets > 0 && debts > assets) {
      score -= 18;
      factors.push("Tus deudas superan tus activos registrados.");
    } else {
      score -= 4;
      factors.push("Conviene vigilar el peso de tus deudas.");
    }
  }

  if (goals.length > 0) {
    score += 5;
    factors.push("Ya tienes objetivos financieros visibles.");
  } else {
    score -= 5;
    factors.push("Una meta clara ayudaría a enfocar el ahorro.");
  }

  const finalScore = clampScore(score);
  const signals = buildFinancialSignals(input);
  const projection = buildMonthlyProjection(input);

  return {
    health: {
      score: finalScore,
      label: scoreLabel(finalScore, loading),
      tone: scoreTone(finalScore),
      factors: factors.slice(0, 3),
    },
    nextAction: buildNextAction(summary, netWorth, goals, family),
    risks: buildRisks(summary, netWorth, goals, dataError),
    familySummary: buildFamilySummary(family),
    signals,
    projection,
  };
}

function buildNextAction(
  summary: PremiumSummaryInput,
  netWorth: PremiumNetWorthInput,
  goals: PremiumGoalInput[],
  family: PremiumFamilyInput
): PremiumActionModel {
  if (!summary) {
    return {
      title: "Captura tu primer movimiento",
      body: "Registra un ingreso o gasto para activar una lectura más precisa.",
      href: "/gastos",
      actionLabel: "Ir a movimientos",
    };
  }

  if (summary.incomes <= 0 && summary.expenses > 0) {
    return {
      title: "Completa tus ingresos",
      body: "Hay gastos registrados, pero faltan ingresos. Eso distorsiona tu balance del mes.",
      href: "/gastos",
      actionLabel: "Registrar ingreso",
    };
  }

  if (summary.balance < 0) {
    return {
      title: "Reduce presión del mes",
      body: "Tu gasto supera tus ingresos. Revisa movimientos variables antes de cerrar el periodo.",
      href: "/gastos",
      actionLabel: "Revisar gastos",
    };
  }

  if (netWorth && netWorth.debts > Math.max(0, netWorth.assets)) {
    return {
      title: "Prioriza deuda",
      body: "Tus deudas pesan más que tus activos registrados. El siguiente avance está en ordenar saldos.",
      href: "/patrimonio",
      actionLabel: "Ver patrimonio",
    };
  }

  if (goals.length === 0) {
    return {
      title: "Define una meta",
      body: family?.familyId
        ? "Crea una meta familiar para convertir el excedente en una decisión compartida."
        : "Crea una meta simple para darle dirección a tu ahorro.",
      href: family?.familyId ? "/familia/objetivos/nuevo" : "/familia",
      actionLabel: family?.familyId ? "Crear meta" : "Configurar familia",
    };
  }

  return {
    title: "Protege el excedente",
    body: "Tu mes va con margen. Separa una parte antes de que se diluya en gasto operativo.",
    href: "/familia/objetivos",
    actionLabel: "Ver metas",
  };
}

function buildRisks(
  summary: PremiumSummaryInput,
  netWorth: PremiumNetWorthInput,
  goals: PremiumGoalInput[],
  dataError?: string | null
): PremiumRiskModel[] {
  const risks: PremiumRiskModel[] = [];

  if (dataError) {
    risks.push({
      title: "Datos incompletos",
      body: "Algunas lecturas no se actualizaron. Intenta de nuevo con conexión estable.",
      severity: "warning",
    });
  }

  if (!summary) {
    risks.push({
      title: "Sin lectura mensual",
      body: "Aún no hay movimientos suficientes para detectar tendencias.",
      severity: "info",
    });
  } else {
    if (summary.incomes <= 0 && summary.expenses > 0) {
      risks.push({
        title: "Ingresos faltantes",
        body: "Hay gastos sin ingresos registrados, así que el balance puede verse peor de lo real.",
        severity: "warning",
      });
    }

    if (summary.balance < 0) {
      risks.push({
        title: "Flujo negativo",
        body: `El mes va ${money(Math.abs(summary.balance))} abajo. Conviene revisar gastos variables.`,
        severity: "critical",
      });
    }

    if (summary.incomes > 0 && summary.expenses / summary.incomes > 0.9) {
      risks.push({
        title: "Margen reducido",
        body: "Más del 90% del ingreso está comprometido en gastos del mes.",
        severity: "warning",
      });
    }
  }

  if (netWorth && netWorth.debts > Math.max(0, netWorth.assets)) {
    risks.push({
      title: "Deuda sobre activos",
      body: "Tus deudas superan los activos registrados. Revisa saldos y prioridades.",
      severity: "critical",
    });
  }

  if (goals.length === 0) {
    risks.push({
      title: "Sin meta activa",
      body: "Una meta visible ayuda a convertir el ahorro en una decisión concreta.",
      severity: "info",
    });
  }

  if (risks.length === 0) {
    risks.push({
      title: "Sin riesgos fuertes",
      body: "No detectamos alertas importantes con los datos actuales.",
      severity: "info",
    });
  }

  return risks.slice(0, 3);
}

function buildFamilySummary(family: PremiumFamilyInput): PremiumFamilySummaryModel {
  if (!family?.familyId) {
    return {
      title: "Modo familiar disponible",
      body: "Crea o une tu familia para leer metas, gastos y decisiones compartidas en un mismo tablero.",
      href: "/familia",
      actionLabel: "Ir a Familia",
    };
  }

  const members = Number(family.activeMembers ?? 0);
  return {
    title: family.familyName ? `Familia ${family.familyName}` : "Familia activa",
    body:
      members > 1
        ? `${members} miembros activos para revisar decisiones y metas en conjunto.`
        : "Tu espacio familiar ya está listo. Invita miembros para colaborar.",
    href: "/familia/dashboard",
    actionLabel: "Ver familia",
  };
}
