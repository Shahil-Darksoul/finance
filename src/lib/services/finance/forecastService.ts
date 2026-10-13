import { getAnalytics } from "./analytics";
import { getAccountTotals } from "@/lib/repo/accounts";
import { getHoldings } from "./portfolio";
import { listGoals } from "@/lib/repo/goals";
import { getImpliedAnnualReturn } from "@/lib/repo/investments";
import {
  type ForecastInput,
  type ForecastOverrides,
  FALLBACK_ANNUAL_RETURN,
  monthlyTrend,
  runComparison,
  runForecast,
} from "./forecast";
import type { ForecastAssumptions, ForecastResult, Scenario } from "@/lib/types";

/**
 * Assembles forecast inputs from a user's own records.
 *
 * Window: trailing 6 months (falls back to whatever history exists). Windows
 * shorter than 3 months are treated as having no trend, because a slope fitted
 * to one or two points is noise, not a trend.
 */
export async function buildAssumptions(
  userId: string,
  months = 6,
): Promise<ForecastAssumptions> {
  const [analytics, totals, portfolio, goals, historicalReturn] = await Promise.all([
    getAnalytics(userId, months === 6 ? "6m" : "1y"),
    getAccountTotals(userId),
    getHoldings(userId),
    listGoals(userId),
    getImpliedAnnualReturn(userId),
  ]);

  const incomeSeries = analytics.monthlySeries.map((point) => point.incomeCents);
  const expenseSeries = analytics.monthlySeries.map((point) => point.expenseCents);
  const hasEnoughHistory = analytics.monthlySeries.filter(
    (point) => point.incomeCents > 0 || point.expenseCents > 0,
  ).length >= 3;

  const investmentContributions = [...analytics.monthlyTotals.values()].reduce(
    (sum, entry) => sum + entry.investmentCents,
    0,
  );

  return {
    averageMonthlyIncomeCents: analytics.averages.monthlyIncomeCents,
    averageMonthlyExpenseCents: analytics.averages.monthlyExpenseCents,
    averageMonthlySavingsCents: analytics.averages.monthlySavingsCents,
    monthlyInvestmentContributionCents: Math.round(
      investmentContributions / Math.max(1, analytics.monthlySeries.length),
    ),
    investmentReturnRatio:
      historicalReturn === null || historicalReturn === undefined
        ? FALLBACK_ANNUAL_RETURN
        : historicalReturn,
    currentSavingsCents: totals.cashCents + totals.savingsCents,
    currentInvestmentsCents: portfolio.summary.totalValueCents,
    trendIncomeRatio: hasEnoughHistory ? monthlyTrend(incomeSeries) : 0,
    trendExpenseRatio: hasEnoughHistory ? monthlyTrend(expenseSeries) : 0,
    plannedGoalContributionCents: goals
      .filter((goal) => !goal.archived)
      .reduce((sum, goal) => sum + goal.monthlyContributionCents, 0),
  };
}

export async function getForecast(
  userId: string,
  scenario: Scenario,
  months: number,
  overrides?: ForecastOverrides,
): Promise<{ result: ForecastResult; assumptions: ForecastAssumptions }> {
  const assumptions = await buildAssumptions(userId);
  const input: ForecastInput = { assumptions, months, overrides };
  return { result: runForecast(input, scenario), assumptions };
}

export async function getAllScenarios(
  userId: string,
  months: number,
): Promise<Record<Scenario, ForecastResult>> {
  const assumptions = await buildAssumptions(userId);
  const input: ForecastInput = { assumptions, months };
  return {
    conservative: runForecast(input, "conservative"),
    trend: runForecast(input, "trend"),
    optimistic: runForecast(input, "optimistic"),
  };
}

export async function runSimulator(
  userId: string,
  scenario: Scenario,
  months: number,
  overrides: ForecastOverrides,
) {
  const assumptions = await buildAssumptions(userId);
  const input: ForecastInput = { assumptions, months };
  return runComparison(input, overrides, scenario);
}

export { runForecast, runComparison };
export type { ForecastOverrides };