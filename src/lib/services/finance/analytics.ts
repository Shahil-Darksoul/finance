import { addDays, endOfMonth, startOfMonth, subMonths } from "date-fns";
import {
  getCategoryBreakdown,
  getMonthlyTotals,
  getNetWorthSeries,
  getRangeTotals,
  getFirstTransactionDate,
  type MonthlyTotals,
} from "@/lib/repo/transactions";
import { getAccountTotals } from "@/lib/repo/accounts";
import { getImpliedAnnualReturn } from "@/lib/repo/investments";
import { safeDivide } from "@/lib/utils/money";
import { fromISODate, fromISOMonth, startOfToday, toISODate } from "@/lib/utils/date";
import type { CategoryBreakdown, MonthlySeriesPoint } from "@/lib/types";

/** Range presets shared by analytics and the charts. */
export const RANGE_PRESETS = [
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "3m", label: "3 months", days: 91 },
  { value: "6m", label: "6 months", days: 182 },
  { value: "1y", label: "1 year", days: 365 },
  { value: "3y", label: "3 years", days: 1095 },
  { value: "all", label: "All time", days: null },
] as const;

export type RangeValue = (typeof RANGE_PRESETS)[number]["value"];

/** Lower bound used by the "All time" preset. */
const EPOCH = "1970-01-01";

export type ResolvedRange = {
  from: string;
  to: string;
  label: string;
  /** How many calendar months the range covers (at least 1). */
  months: number;
  value: RangeValue | "custom";
};

export function resolveRange(
  value: RangeValue | "custom",
  custom?: { from?: string; to?: string },
): ResolvedRange {
  const today = startOfToday();
  const to = toISODate(today);

  if (value === "custom" && custom?.from && custom?.to) {
    const from = custom.from <= custom.to ? custom.from : custom.to;
    const end = custom.from <= custom.to ? custom.to : custom.from;
    const months =
      Math.max(
        1,
        (endOfMonth(fromISODate(end)).getFullYear() -
          fromISODate(from).getFullYear()) *
          12 +
          (endOfMonth(fromISODate(end)).getMonth() -
            fromISODate(from).getMonth()) +
          1,
      ) || 1;
    return { from, to: end, label: "Custom range", months, value: "custom" };
  }

  const preset = RANGE_PRESETS.find((entry) => entry.value === value);
  if (!preset || preset.days === null) {
    // Effectively unbounded lower bound; real queries still only read stored rows.
    return {
      from: EPOCH,
      to,
      label: "All time",
      months: monthsBetween(fromISODate(EPOCH), today),
      value: "all",
    };
  }

  const from = toISODate(subMonths(today, Math.max(0, Math.round(preset.days / 30.44))));
  return {
    from,
    to,
    label: preset.label,
    months: monthsBetween(fromISODate(from), today),
    value,
  };
}

function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1
  );
}

export type AnalyticsData = {
  range: ResolvedRange;
  hasData: boolean;
  firstTransactionDate: string | null;
  monthlySeries: MonthlySeriesPoint[];
  totals: MonthlyTotals & { savingsCents: number; savingsRate: number };
  averages: {
    monthlyIncomeCents: number;
    monthlyExpenseCents: number;
    monthlySavingsCents: number;
    savingsRate: number;
  };
  growth: {
    incomeRatio: number;
    expenseRatio: number;
    savingsRatio: number;
  };
  expenseByCategory: CategoryBreakdown[];
  incomeByCategory: CategoryBreakdown[];
  netWorthSeries: { date: string; netWorthCents: number }[];
  currentNetWorthCents: number;
  investmentReturnRatio: number | null;
  /** Raw per-month income/expense/investment/refund totals. */
  monthlyTotals: Map<string, MonthlyTotals>;
};

const EMPTY_TOTALS: MonthlyTotals & { savingsCents: number; savingsRate: number } = {
  incomeCents: 0,
  expenseCents: 0,
  investmentCents: 0,
  refundCents: 0,
  savingsCents: 0,
  savingsRate: 0,
};

/**
 * Everything the analytics page renders, computed from stored transactions.
 * No value here is invented — empty history yields zeros, not placeholders.
 */
export async function getAnalytics(
  userId: string,
  rangeValue: RangeValue | "custom",
  custom?: { from?: string; to?: string },
): Promise<AnalyticsData> {
  const range = resolveRange(rangeValue, custom);
  const firstTransactionDate = await getFirstTransactionDate(userId);

  const [monthly, rangeTotals, expenseByCategory, incomeByCategory, netWorthSeries, totals, investmentReturnRatio] =
    await Promise.all([
      getMonthlyTotals(userId, range.from, range.to),
      getRangeTotals(userId, range.from, range.to),
      getCategoryBreakdown(userId, range.from, range.to, "expense", 12),
      getCategoryBreakdown(userId, range.from, range.to, "income", 8),
      getNetWorthSeries(userId, range.from, range.to),
      getAccountTotals(userId),
      getImpliedAnnualReturn(userId),
    ]);

  // Build a continuous month axis so gaps render as real zeroes, not nulls.
  const months = monthKeysBetween(range.from, range.to);
  const monthlySeries: MonthlySeriesPoint[] = months.map((month) => {
    const entry = monthly.get(month);
    const incomeCents = entry?.incomeCents ?? 0;
    const expenseCents = entry?.expenseCents ?? 0;
    return {
      month,
      incomeCents,
      expenseCents,
      savingsCents: incomeCents - expenseCents,
      savingsRate: safeDivide(incomeCents - expenseCents, incomeCents),
    };
  });

  const activeMonths = Math.max(1, monthly.size);
  const averages = {
    monthlyIncomeCents: Math.round(rangeTotals.incomeCents / activeMonths),
    monthlyExpenseCents: Math.round(rangeTotals.expenseCents / activeMonths),
    monthlySavingsCents: Math.round(
      (rangeTotals.incomeCents - rangeTotals.expenseCents) / activeMonths,
    ),
    savingsRate: safeDivide(
      rangeTotals.incomeCents - rangeTotals.expenseCents,
      rangeTotals.incomeCents,
    ),
  };

  // Growth compares the first and second halves of the window so a single
  // unusual month does not dominate the trend.
  const half = Math.floor(monthlySeries.length / 2);
  const firstHalf = monthlySeries.slice(0, half);
  const secondHalf = monthlySeries.slice(half);

  const sum = (rows: MonthlySeriesPoint[], key: keyof MonthlySeriesPoint) =>
    rows.reduce((total, row) => total + Number(row[key]), 0);

  const growth = {
    incomeRatio: ratioChange(
      sum(firstHalf, "incomeCents"),
      sum(secondHalf, "incomeCents"),
    ),
    expenseRatio: ratioChange(
      sum(firstHalf, "expenseCents"),
      sum(secondHalf, "expenseCents"),
    ),
    savingsRatio: ratioChange(
      sum(firstHalf, "savingsCents"),
      sum(secondHalf, "savingsCents"),
    ),
  };

  return {
    range,
    hasData: firstTransactionDate !== null,
    firstTransactionDate,
    monthlySeries,
    totals: {
      ...rangeTotals,
      savingsCents: rangeTotals.incomeCents - rangeTotals.expenseCents,
      savingsRate: safeDivide(
        rangeTotals.incomeCents - rangeTotals.expenseCents,
        rangeTotals.incomeCents,
      ),
    },
    averages,
    growth,
    expenseByCategory,
    incomeByCategory,
    netWorthSeries,
    currentNetWorthCents: totals.netWorthCents,
    investmentReturnRatio: investmentReturnRatio,
    monthlyTotals: monthly,
  };
}

function ratioChange(before: number, after: number): number {
  if (before === 0) return 0;
  return (after - before) / Math.abs(before);
}

export function monthKeysBetween(from: string, to: string): string[] {
  const start = fromISOMonth(from.slice(0, 7));
  const end = fromISOMonth(to.slice(0, 7));
  const keys: string[] = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const limit = new Date(end.getFullYear(), end.getMonth(), 1);
  let guard = 0;
  while (cursor <= limit && guard < 600) {
    keys.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
    );
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    guard += 1;
  }
  return keys;
}

export function emptyAnalytics(rangeValue: RangeValue | "custom"): AnalyticsData {
  return {
    range: resolveRange(rangeValue),
    hasData: false,
    firstTransactionDate: null,
    monthlySeries: [],
    totals: EMPTY_TOTALS,
    averages: {
      monthlyIncomeCents: 0,
      monthlyExpenseCents: 0,
      monthlySavingsCents: 0,
      savingsRate: 0,
    },
    growth: { incomeRatio: 0, expenseRatio: 0, savingsRatio: 0 },
    expenseByCategory: [],
    incomeByCategory: [],
    netWorthSeries: [],
    currentNetWorthCents: 0,
    investmentReturnRatio: null,
    monthlyTotals: new Map(),
  };
}

export { addDays, startOfMonth };