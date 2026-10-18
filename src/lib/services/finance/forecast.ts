import { addMonths } from "date-fns";
import { SCENARIO_META, type ForecastAssumptions, type ForecastPoint, type ForecastResult, type Scenario } from "@/lib/types";
import { startOfToday, toISODate } from "@/lib/utils/date";
import { safeDivide, formatMoney } from "@/lib/utils/money";
import { DEFAULT_CURRENCY } from "@/lib/utils/currency";

/**
 * Savings & net-worth forecasting engine.
 *
 * The model walks forward month by month and, for every month:
 *
 *   income(m)     = average income × scenario factor × (1 + income trend)^(m−1)
 *   expenses(m)   = average expenses × scenario factor × (1 + expense trend)^(m−1)
 *   surplus(m)    = income(m) − expenses(m)
 *   savings(m)    = savings(m−1) + max(0, surplus(m) − planned goal contributions)
 *   portfolio(m)  = portfolio(m−1) × (1 + monthly return) + contributions
 *
 * This is deliberately not "current monthly savings × number of months": trends,
 * scheduled obligations and investment growth all move independently, and the
 * trend terms are estimated from your own history rather than assumed.
 *
 * Everything produced here is an estimate, never a promise.
 */

/** Monthly trend is clamped to ±2.5% so old data cannot produce runaway curves. */
const MAX_MONTHLY_TREND = 0.025;

/** Fallback annual return used only when the user has no investment history. */
const DEFAULT_ANNUAL_RETURN = 0.05;

export type ForecastOverrides = {
  /** Percentage change applied to average monthly income, e.g. 5 for +5%. */
  incomeDeltaPercent?: number;
  /** Percentage change applied to average monthly expenses, e.g. -10 for −10%. */
  expenseDeltaPercent?: number;
  /** Extra cash diverted to savings each month. */
  extraSavingsContributionCents?: number;
  /** Extra cash invested each month. */
  extraInvestmentContributionCents?: number;
};

export type ForecastInput = {
  assumptions: ForecastAssumptions;
  months: number;
  overrides?: ForecastOverrides;
};

/**
 * Least-squares slope of `values` against their index, expressed as a monthly
 * growth ratio. Returned as a ratio (0.02 = +2% per month).
 */
export function monthlyTrend(values: number[]): number {
  const n = values.length;
  if (n < 3) return 0;

  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    numerator += (i - meanX) * (values[i] - meanY);
    denominator += (i - meanX) ** 2;
  }
  if (denominator === 0) return 0;

  const slope = numerator / denominator;
  // Convert an absolute slope into a ratio against the mean so a bigger
  // balance base does not automatically imply faster percentage growth.
  const ratio = safeDivide(slope, Math.abs(meanY));
  return Math.max(-MAX_MONTHLY_TREND, Math.min(MAX_MONTHLY_TREND, ratio));
}

/** Resolves the assumptions used by a run, applying scenario + user overrides. */
export function resolveAssumptions(
  base: ForecastAssumptions,
  scenario: Scenario,
  overrides: ForecastOverrides = {},
): ForecastAssumptions {
  const meta = SCENARIO_META[scenario];

    const incomeDelta = 1 + (overrides.incomeDeltaPercent ?? 0) / 100;
    const expenseDelta = 1 + (overrides.expenseDeltaPercent ?? 0) / 100;
    // Extra savings is a monthly flow consumed by runForecast, not a balance
    // level, so only the investment side belongs in these assumptions.
    const extraInvestment = overrides.extraInvestmentContributionCents ?? 0;

  const averageMonthlyIncomeCents = Math.max(
    0,
    Math.round(base.averageMonthlyIncomeCents * meta.incomeFactor * incomeDelta),
  );
  const averageMonthlyExpenseCents = Math.max(
    0,
    Math.round(base.averageMonthlyExpenseCents * meta.expenseFactor * expenseDelta),
  );

  return {
    averageMonthlyIncomeCents,
    averageMonthlyExpenseCents,
    averageMonthlySavingsCents:
      averageMonthlyIncomeCents - averageMonthlyExpenseCents,
    // Scenario + user overrides both act on the investment contribution.
    monthlyInvestmentContributionCents: Math.max(
      0,
      Math.round(
        (base.monthlyInvestmentContributionCents + extraInvestment) *
          meta.contributionFactor,
      ),
    ),
    investmentReturnRatio: base.investmentReturnRatio * meta.returnFactor,
    currentSavingsCents: base.currentSavingsCents,
    plannedGoalContributionCents: Math.max(
      0,
      Math.round(base.plannedGoalContributionCents * meta.contributionFactor),
    ),
    currentInvestmentsCents: base.currentInvestmentsCents,
    // Trends scale with how much is being saved, so a user cutting expenses
    // keeps the improved pace.
    trendIncomeRatio: base.trendIncomeRatio * meta.incomeFactor,
    trendExpenseRatio: base.trendExpenseRatio * meta.expenseFactor,
  };
}

/** Extra savings injected each month by the what-if simulator. */
export function overrideSavings(overrides?: ForecastOverrides): number {
  return Math.max(0, overrides?.extraSavingsContributionCents ?? 0);
}

export function runForecast(input: ForecastInput, scenario: Scenario): ForecastResult {
  const months = Math.max(1, Math.min(600, Math.round(input.months)));
  const assumptions = resolveAssumptions(input.assumptions, scenario, input.overrides);
  const extraSavings = overrideSavings(input.overrides);

  const today = startOfToday();

  // Planned goal contributions come out of the surplus before it reaches savings.
  const plannedGoalContributionCents = Math.max(
    0,
    assumptions.plannedGoalContributionCents,
  );

  const monthlyReturn =
    (Math.pow(1 + assumptions.investmentReturnRatio, 1 / 12) || 1) - 1;

  let savingsCents = assumptions.currentSavingsCents;
  let investmentsCents = assumptions.currentInvestmentsCents;
  let cumulativeContributions = 0;
  let cumulativeGrowth = 0;

  const points: ForecastPoint[] = [];
  const milestones: ForecastResult["milestones"] = [];
  const crossed = new Set<number>();

  for (let month = 1; month <= months; month += 1) {
    const incomeCents = Math.round(
      assumptions.averageMonthlyIncomeCents *
        Math.pow(1 + assumptions.trendIncomeRatio, month - 1),
    );
    const expenseCents = Math.round(
      assumptions.averageMonthlyExpenseCents *
        Math.pow(1 + assumptions.trendExpenseRatio, month - 1),
    );

    const surplusCents = incomeCents - expenseCents;

    // Savings grow by the surplus minus whatever is earmarked for goals, plus
    // any extra the user dialled in on the simulator.
    const toSavings = Math.max(0, surplusCents - plannedGoalContributionCents) + extraSavings;
    savingsCents = Math.max(0, savingsCents + toSavings);

    // Investments compound then receive the monthly contribution.
    const growth = Math.round(investmentsCents * monthlyReturn);
    investmentsCents = Math.max(0, investmentsCents + growth) + assumptions.monthlyInvestmentContributionCents;
    cumulativeContributions += assumptions.monthlyInvestmentContributionCents;
    cumulativeGrowth += growth;

    const netWorthCents = savingsCents + investmentsCents;

    const date = toISODate(addMonths(today, month));
    points.push({
      month: date.slice(0, 7),
      savingsCents,
      investmentsCents,
      netWorthCents,
      cumulativeContributionsCents: cumulativeContributions,
      cumulativeGrowthCents: cumulativeGrowth,
    });

    for (const threshold of MILESTONES) {
      if (netWorthCents >= threshold && !crossed.has(threshold)) {
        crossed.add(threshold);
        milestones.push({ label: milestoneLabel(threshold), date, cents: threshold });
      }
    }
  }

  const last = points[points.length - 1];

  return {
    scenario,
    months,
    assumptions,
    points,
    finalSavingsCents: last?.savingsCents ?? assumptions.currentSavingsCents,
    finalInvestmentsCents:
      last?.investmentsCents ?? assumptions.currentInvestmentsCents,
    finalNetWorthCents: last?.netWorthCents ?? 0,
    totalContributionsCents: cumulativeContributions,
    totalGrowthCents: cumulativeGrowth,
    milestones,
  };
}

const MILESTONES = [
  10_000_00,
  25_000_00,
  50_000_00,
  100_000_00,
  250_000_00,
  500_000_00,
  1_000_000_00,
];

function milestoneLabel(cents: number): string {
  const dollars = cents / 100;
  return dollars >= 1_000_000
    ? `$${dollars / 1_000_000}M net worth`
    : dollars >= 1_000
      ? `$${Math.round(dollars / 1_000)}k net worth`
      : `$${dollars} net worth`;
}

export type ScenarioComparison = {
  baseline: ForecastResult;
  modified: ForecastResult;
  differenceCents: number;
  differenceRatio: number;
};

/** Runs the simulator: current trajectory vs a modified set of assumptions. */
export function runComparison(
  input: ForecastInput,
  overrides: ForecastOverrides,
  scenario: Scenario,
): ScenarioComparison {
  const baseline = runForecast({ ...input, overrides: {} }, scenario);
  const modified = runForecast({ ...input, overrides }, scenario);
  const differenceCents = modified.finalNetWorthCents - baseline.finalNetWorthCents;

  return {
    baseline,
    modified,
    differenceCents,
    differenceRatio: safeDivide(differenceCents, Math.abs(baseline.finalNetWorthCents)),
  };
}

/** Default return assumption when the user has no recorded investment history. */
export const FALLBACK_ANNUAL_RETURN = DEFAULT_ANNUAL_RETURN;

/** Human-readable assumption sheet shown above every projection. */
export function describeAssumptions(
  assumptions: ForecastAssumptions,
  currency = DEFAULT_CURRENCY,
): { label: string; value: string; detail: string }[] {
  const money = (cents: number) =>
    formatMoney(cents, { currency, trimZeroes: true });

  return [
    {
      label: "Average monthly income",
      value: money(assumptions.averageMonthlyIncomeCents),
      detail: "Mean of your recorded income over the analysis window.",
    },
    {
      label: "Average monthly expenses",
      value: money(assumptions.averageMonthlyExpenseCents),
      detail: "Mean of your recorded expenses. Transfers are excluded.",
    },
    {
      label: "Average monthly savings",
      value: money(assumptions.averageMonthlySavingsCents),
      detail: "Income minus expenses, averaged over the same window.",
    },
    {
      label: "Investment contribution",
      value: `${money(assumptions.monthlyInvestmentContributionCents)}/mo`,
      detail: "Average of recorded investment purchases.",
    },
    {
      label: "Investment return used",
      value: `${(assumptions.investmentReturnRatio * 100).toFixed(1)}% / yr`,
      detail:
        assumptions.investmentReturnRatio === FALLBACK_ANNUAL_RETURN
          ? "Default assumption — you have no recorded investment history yet. Returns are never guaranteed."
          : "Derived from your recorded dividends and contributions. An estimate, not a promise.",
    },
    {
      label: "Income trend",
      value: `${(assumptions.trendIncomeRatio * 100).toFixed(2)}% / mo`,
      detail: "Least-squares trend across your monthly income history, capped at ±2.5% per month.",
    },
    {
      label: "Expense trend",
      value: `${(assumptions.trendExpenseRatio * 100).toFixed(2)}% / mo`,
      detail: "Least-squares trend across your monthly expense history, capped at ±2.5% per month.",
    },
  ];
}