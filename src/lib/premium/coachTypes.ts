export type PremiumCoachAction =
  | "explain_month"
  | "three_actions"
  | "risk_summary"
  | "family_message";

export type PremiumCoachContext = {
  health: {
    score: number;
    label: string;
    factors: string[];
  };
  projection: {
    projectedExpenses: number;
    projectedBalance: number;
    dailyExpenseAverage: number;
    confidence: "low" | "medium";
    label: string;
  };
  signals: Array<{
    title: string;
    body: string;
    severity: "info" | "warning" | "critical" | "good";
    metric?: string;
  }>;
  risks: Array<{
    title: string;
    body: string;
    severity: "info" | "warning" | "critical";
  }>;
  nextAction: {
    title: string;
    body: string;
  };
  familySummary: {
    title: string;
    body: string;
  };
};

export type PremiumCoachRequest = {
  action: PremiumCoachAction;
  context: PremiumCoachContext;
};

export type PremiumCoachSuccessResponse = {
  ok: true;
  title: string;
  bullets: string[];
  priorityAction: string;
};

export type PremiumCoachErrorResponse = {
  ok: false;
  error: string;
};

export type PremiumCoachResponse = PremiumCoachSuccessResponse | PremiumCoachErrorResponse;

export const PREMIUM_COACH_ACTIONS: PremiumCoachAction[] = [
  "explain_month",
  "three_actions",
  "risk_summary",
  "family_message",
];
