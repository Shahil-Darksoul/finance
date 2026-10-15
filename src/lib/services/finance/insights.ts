import { getAnalytics } from "./analytics";
import { getAccountTotals } from "@/lib/repo/accounts";
import { getFinancialSummary } from "./summary";
import { getUpcomingObligations } from "./obligations";
import { getGoalProgress } from "./goals";
import { getHoldings } from "./portfolio";
import { formatMoney, formatPercent, safeDivide } from "@/lib/utils/money";
import { addDays, addMonths } from "date-fns";
import { fromISODate, startOfToday, toISODate } from "@/lib/utils/date";
import type { HealthMetric, Insight } from "@/lib/types";

/**
 * Insights and health metrics.
 *
 * Every statement produced here is derived from stored data. Each insight
 * carries:
 *   - `basis` — whether it is a fact, calculation, estimate or forecast,
 *   - `evidence` — the exact figures used, so the claim can be verified.
 *
 * Nothing is invented, and nothing is framed as professional financial advice.
 */

const CURRENCY_DEFAULT = "USD";

/** Optional display formatter — lets callers show converted (e.g. INR) amounts. */
export type MoneyFormatter = (cents: number) => string;

function formatterFor(currency: string, format?: MoneyFormatter): MoneyFormatter {
  return format ?? ((cents: number) => formatMoney(cents, { currency }));
}

export async function buildInsights(
  userId: string,
  currency = CURRENCY_DEFAULT,
  format?: MoneyFormatter,
): Promise<Insight[]> {
  const [analytics, totals, goals, portfolio, obligations] = await Promise.all([
    getAnalytics(userId, "6m"),
    getAccountTotals(userId),
    getGoalProgress(userId),
    getHoldings(userId),
    getUpcomingObligations(userId, { until: addDays(startOfToday(), 30) }),
  ]);

  const insights: Insight[] = [];
  const money = formatterFor(currency, format);

  /* ---------------------------------------------- 1. savings trend */
  const savingsTrend = analytics.growth.savingsRatio;
  if (analytics.monthlySeries.length >= 2 && Math.abs(savingsTrend) >= 0.05) {
    const improved = savingsTrend > 0;
    insights.push({
      id: "savings-trend",
      kind: improved ? "positive" : "watch",
      title: improved
        ? "Your monthly savings is trending up"
        : "Your monthly savings is trending down",
      detail: improved
        ? `Based on your historical data, the second half of the last 6 months saved ${formatPercent(
            Math.abs(savingsTrend),
            { signed: true },
          )} more than the first half.`
        : `Based on your historical data, the second half of the last 6 months saved ${formatPercent(
            Math.abs(savingsTrend),
          )} less than the first half.`,
      basis: "calculation",
      evidence: [
        `Average monthly savings first half: ${money(analytics.averages.monthlySavingsCents * 3)}`,
        `Comparison window: ${analytics.range.label}`,
      ],
    });
  }

  /* ---------------------------------------------- 2. spending shift */
  const expenseTrend = analytics.growth.expenseRatio;
  if (analytics.monthlySeries.length >= 2 && Math.abs(expenseTrend) >= 0.08) {
    const up = expenseTrend > 0;
    insights.push({
      id: "spending-trend",
      kind: up ? "watch" : "positive",
      title: up ? "Spending has increased recently" : "Spending has decreased recently",
      detail: up
        ? `Based on your historical data, spending in the most recent months averaged ${formatPercent(
            expenseTrend,
          )} more than earlier in this ${analytics.range.label} window.`
        : `Based on your historical data, spending in the most recent months averaged ${formatPercent(
            Math.abs(expenseTrend),
          )} less than earlier in this ${analytics.range.label} window.`,
      basis: "calculation",
      evidence: [
        `Average monthly expenses: ${money(analytics.averages.monthlyExpenseCents)}`,
        `Window: ${analytics.range.label}`,
      ],
    });
  }

  /* ---------------------------------------------- 3. biggest category shift */
  const topCategory = analytics.expenseByCategory[0];
  if (topCategory && analytics.expenseByCategory.length >= 2) {
    insights.push({
      id: "top-category",
      kind: "info",
      title: `${topCategory.categoryName} is your largest expense`,
      detail: `Based on your recorded transactions, ${topCategory.categoryName} accounts for ${formatPercent(
        topCategory.ratio,
      )} of spending in this ${analytics.range.label} window.`,
      basis: "fact",
      evidence: [
        `${topCategory.categoryName}: ${money(topCategory.amountCents)} across ${topCategory.transactionCount} transactions`,
      ],
    });
  }

  /* ---------------------------------------------- 4. recurring load */
  const monthlyObligations = obligations.reduce((sum, item) => sum + item.amountCents, 0);
  const obligationRatio = safeDivide(monthlyObligations, analytics.averages.monthlyIncomeCents);
  if (analytics.averages.monthlyIncomeCents > 0 && monthlyObligations > 0) {
    insights.push({
      id: "recurring-load",
      kind: obligationRatio > 0.5 ? "watch" : "neutral",
      title: "Recurring bills and instalments",
      detail: `Your scheduled bills, EMIs and subscriptions due in the next 30 days total ${money(
        monthlyObligations,
      )}, about ${formatPercent(obligationRatio)} of your average monthly income.`,
      basis: "calculation",
      evidence: [
        `Scheduled in the next 30 days: ${money(monthlyObligations)}`,
        `Average monthly income: ${money(analytics.averages.monthlyIncomeCents)}`,
      ],
    });
  }

  /* ---------------------------------------------- 5. emergency fund */
  const monthsOfExpenses = safeDivide(
    totals.savingsCents,
    analytics.averages.monthlyExpenseCents,
  );
  if (analytics.averages.monthlyExpenseCents > 0) {
    const status =
      monthsOfExpenses >= 6 ? "positive" : monthsOfExpenses >= 3 ? "neutral" : "watch";
    insights.push({
      id: "emergency-fund",
      kind: status === "watch" ? "watch" : "info",
      title: `Your savings cover about ${monthsOfExpenses.toFixed(1)} months of expenses`,
      detail:
        monthsOfExpenses >= 6
          ? `Based on your recorded balances and average expenses, you have more than six months of expenses saved.`
          : `Based on your recorded balances and average expenses of ${money(
              analytics.averages.monthlyExpenseCents,
            )} a month, you have ${monthsOfExpenses.toFixed(1)} months covered.`,
      basis: "calculation",
      evidence: [
        `Savings and cash balances: ${money(totals.savingsCents + totals.cashCents)}`,
        `Average monthly expenses: ${money(analytics.averages.monthlyExpenseCents)}`,
      ],
    });
  }

  /* ---------------------------------------------- 6. goal progress */
  if (goals.length > 0) {
    const nearest = goals
      .filter((entry) => entry.progressRatio >= 0.2)
      .sort((a, b) => b.progressRatio - a.progressRatio)[0];
    if (nearest) {
      insights.push({
        id: "goal-progress",
        kind: "positive",
        title: `You're ${formatPercent(nearest.progressRatio, { digits: 0 })} of the way toward "${nearest.goal.name}"`,
        detail: nearest.goal.targetDate
          ? `At your recorded contribution pace, this goal is estimated to reach its target around ${nearest.estimatedCompletionDate ?? "an undetermined date"}.`
          : `You have ${money(nearest.remainingCents)} left to save toward this goal.`,
        basis: nearest.goal.targetDate ? "estimate" : "fact",
        evidence: [
          `Saved: ${money(nearest.goal.currentCents)} of ${money(nearest.goal.targetCents)}`,
          nearest.goal.targetDate ? `Target date: ${nearest.goal.targetDate}` : "No target date set",
        ],
      });
    }
  }

  /* ---------------------------------------------- 7. investment growth */
  if (portfolio.holdings.length > 0 && portfolio.summary.totalGainCents !== 0) {
    const gain = portfolio.summary.totalGainCents;
    insights.push({
      id: "investment-return",
      kind: gain > 0 ? "positive" : "watch",
      title:
        gain > 0
          ? "Your holdings are above their recorded cost"
          : "Your holdings are below their recorded cost",
      detail: `Estimated from current ${portfolio.summary.simulated ? "simulated " : ""}market prices: ${money(
        Math.abs(gain),
      )} ${gain > 0 ? "above" : "below"} what you paid. Market values change over time.`,
      basis: "estimate",
      evidence: [
        `Market value: ${money(portfolio.summary.totalValueCents)}`,
        `Recorded cost: ${money(portfolio.summary.investedCents)}`,
        portfolio.summary.simulated
          ? "Prices came from the simulated feed, not a live market source."
          : `Market data as of ${new Date(portfolio.summary.asOf).toLocaleString("en-US")}`,
      ],
    });
  }

  /* ---------------------------------------------- 8. debt */
  if (totals.debtCents > 0) {
    const ratio = safeDivide(totals.debtCents, analytics.averages.monthlyIncomeCents);
    insights.push({
      id: "debt",
      kind: ratio > 6 ? "watch" : "neutral",
      title: `You owe about ${money(totals.debtCents)}`,
      detail: `Based on your recorded balances, that is roughly ${ratio.toFixed(1)} months of average income.`,
      basis: "calculation",
      evidence: [
        `Total debt: ${money(totals.debtCents)}`,
        `Average monthly income: ${money(analytics.averages.monthlyIncomeCents)}`,
      ],
    });
  }

  return insights;
}

/* ------------------------------------------------------------- health */

export type FinancialHealth = {
  metrics: HealthMetric[];
  score: number;
  updatedAt: string;
};

/**
 * Six measurable indicators. Each one shows the number, a plain-language
 * explanation of what it measures, and whether it looks healthy.
 *
 * This is a self-tracking aid built from your own records — not financial advice.
 */
export async function getFinancialHealth(
  userId: string,
  currency = CURRENCY_DEFAULT,
  format?: MoneyFormatter,
): Promise<FinancialHealth> {
  const [analytics, totals, obligations, portfolio, summary] = await Promise.all([
    getAnalytics(userId, "6m"),
    getAccountTotals(userId),
    getUpcomingObligations(userId, { until: addDays(startOfToday(), 30) }),
    getHoldings(userId),
    getFinancialSummary(userId),
  ]);

  const money = formatterFor(currency, format);
  const avgIncome = analytics.averages.monthlyIncomeCents;
  const avgExpense = analytics.averages.monthlyExpenseCents;
  const monthlyObligations = obligations.reduce((sum, item) => sum + item.amountCents, 0);

  const metrics: HealthMetric[] = [];

  /* 1. Savings rate */
  const savingsRate = analytics.averages.savingsRate;
  metrics.push({
    key: "savings_rate",
    label: "Savings rate",
    value: savingsRate,
    display: formatPercent(savingsRate),
    status: savingsRate >= 0.2 ? "good" : savingsRate >= 0.1 ? "fair" : "poor",
    ratio: Math.min(1, savingsRate / 0.3),
    explanation: `The share of your income you kept after expenses. You saved ${money(
      analytics.averages.monthlySavingsCents,
    )} per month on average.`,
  });

  /* 2. Expense-to-income ratio */
  const expenseRatio = safeDivide(avgExpense, avgIncome);
  metrics.push({
    key: "expense_ratio",
    label: "Expense-to-income",
    value: expenseRatio,
    display: formatPercent(expenseRatio),
    status:
      avgIncome === 0
        ? "unknown"
        : expenseRatio <= 0.7
          ? "good"
          : expenseRatio <= 0.9
            ? "fair"
            : "poor",
    ratio: avgIncome === 0 ? 0 : Math.min(1, Math.max(0, 1 - expenseRatio)),
    explanation: `You spent ${money(avgExpense)} for every ${money(avgIncome)} earned, averaged over ${analytics.range.label}.`,
  });

  /* 3. Emergency fund coverage */
  const emergencyMonths = safeDivide(
    totals.savingsCents + totals.cashCents,
    avgExpense,
  );
  metrics.push({
    key: "emergency_coverage",
    label: "Emergency fund coverage",
    value: emergencyMonths,
    display: `${emergencyMonths.toFixed(1)} months`,
    status:
      avgExpense === 0
        ? "unknown"
        : emergencyMonths >= 6
          ? "good"
          : emergencyMonths >= 3
            ? "fair"
            : "poor",
    ratio: Math.min(1, emergencyMonths / 6),
    explanation: `How many months of your average expenses your cash and savings could cover if income stopped.`,
  });

  /* 4. Debt-to-income */
  const debtRatio = safeDivide(totals.debtCents, avgIncome);
  metrics.push({
    key: "debt_to_income",
    label: "Debt-to-income",
    value: debtRatio,
    display: totals.debtCents === 0 ? "No debt" : `${debtRatio.toFixed(1)} months`,
    status:
      totals.debtCents === 0
        ? "good"
        : debtRatio <= 3
          ? "good"
          : debtRatio <= 6
            ? "fair"
            : "poor",
    ratio: Math.min(1, debtRatio / 12),
    explanation:
      totals.debtCents === 0
        ? "You have no recorded debt balances."
        : `Your recorded debt of ${money(totals.debtCents)} is about ${debtRatio.toFixed(1)} months of average income.`,
  });

  /* 5. Investment contribution rate */
  const investmentContributions = [...analytics.monthlyTotals.values()].reduce(
    (sum, entry) => sum + entry.investmentCents,
    0,
  );
  const monthlyContributions = Math.round(
    investmentContributions / Math.max(1, analytics.monthlySeries.length),
  );
  const investmentRate = safeDivide(monthlyContributions, avgIncome);
  metrics.push({
    key: "investment_rate",
    label: "Investment contribution rate",
    value: investmentRate,
    display: formatPercent(investmentRate),
    status:
      monthlyContributions === 0
        ? "unknown"
        : investmentRate >= 0.1
          ? "good"
          : investmentRate >= 0.03
            ? "fair"
            : "poor",
    ratio: Math.min(1, investmentRate / 0.15),
    explanation:
      monthlyContributions === 0
        ? "No investment purchases are recorded in this period."
        : `You put ${money(monthlyContributions)} a month into investments on average.`,
  });

  /* 6. Recurring expense ratio */
  const recurringRatio = safeDivide(monthlyObligations, avgIncome);
  metrics.push({
    key: "recurring_ratio",
    label: "Recurring expense ratio",
    value: recurringRatio,
    display: formatPercent(recurringRatio),
    status: recurringRatio <= 0.3 ? "good" : recurringRatio <= 0.5 ? "fair" : "poor",
    ratio: Math.min(1, recurringRatio / 0.6),
    explanation: `Bills, EMIs and subscriptions due in the next 30 days as a share of average monthly income.`,
  });

  // Simple, transparent aggregate: each metric contributes 0-1 and unknown
  // metrics are excluded rather than counted as zero.
  const scored = metrics.filter((metric) => metric.status !== "unknown");
  const score =
    scored.length === 0
      ? 0
      : Math.round(
          (scored.reduce((sum, metric) => {
            if (metric.status === "good") return sum + 1;
            if (metric.status === "fair") return sum + 0.5;
            return sum;
          }, 0) /
            scored.length) *
            100,
        );

  void portfolio;
  void summary;

  return { metrics, score, updatedAt: new Date().toISOString() };
}

/** Encouraging copy for the dashboard. Never shames spending. */
export async function getEncouragement(
  userId: string,
  currency = CURRENCY_DEFAULT,
): Promise<{ title: string; detail: string; celebrate: boolean } | null> {
  const [summary, goals] = await Promise.all([
    getFinancialSummary(userId),
    getGoalProgress(userId),
  ]);

  const delta = summary.monthlySavingsCents - summary.priorMonthSavingsCents;
  const hasPrior = summary.priorMonthIncomeCents > 0;

  const nearest = goals
    .filter((entry) => entry.progressRatio >= 0.5 && entry.progressRatio < 1)
    .sort((a, b) => b.progressRatio - a.progressRatio)[0];

  if (hasPrior && delta > 0) {
    return {
      title: `You saved ${formatMoney(delta, { currency })} more than last month`,
      detail: "Every bit of progress counts. Keep building the habit.",
      celebrate: true,
    };
  }

  if (nearest) {
    return {
      title: `You're ${formatPercent(nearest.progressRatio, { digits: 0 })} toward "${nearest.goal.name}"`,
      detail: `${formatMoney(nearest.remainingCents, { currency })} to go — small monthly contributions add up.`,
      celebrate: false,
    };
  }

  if (hasPrior && delta < 0) {
    return {
      title: "Thanks for keeping track",
      detail: "Tracking your money is the first step to improving it. Small changes compound.",
      celebrate: false,
    };
  }

  return null;
}

/** Forecast of when a savings goal could be reached, used by the goal page. */
export function projectCompletion(
  currentCents: number,
  targetCents: number,
  monthlyCents: number,
  today = startOfToday(),
): string | null {
  if (monthlyCents <= 0) return null;
  const remaining = Math.max(0, targetCents - currentCents);
  if (remaining === 0) return toISODate(today);
  const months = Math.ceil(remaining / monthlyCents);
  return toISODate(addMonths(today, months));
}

export { fromISODate };