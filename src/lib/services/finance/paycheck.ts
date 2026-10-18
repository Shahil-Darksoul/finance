import { addDays } from "date-fns";
import { listTransactions, getMonthlyTotals, getRecurringRevenueByMonth } from "@/lib/repo/transactions";
import { listAccounts } from "@/lib/repo/accounts";
import { getNextPaydays } from "./payday";
import { getUpcomingObligations } from "./obligations";
import { fromISODate, monthKey, monthRangeKeys, startOfToday, toISODate } from "@/lib/utils/date";
import { safeDivide } from "@/lib/utils/money";
import { DEFAULT_CURRENCY } from "@/lib/utils/currency";
import type { PaycheckProjection } from "@/lib/types";

/**
 * "Safe to spend" projection.
 *
 *   Projected remaining = paycheck + available cash
 *                         − bills due before payday
 *                         − EMI instalments due before payday
 *                         − planned discretionary spending for those days
 *                         − other scheduled payments
 *
 * This is a *projection* built from your own records and assumptions, not a
 * guarantee. It is labelled as such everywhere it appears.
 */

/** Accounts whose balances can actually be spent before payday. */
const SPENDABLE_TYPES = new Set(["checking", "cash", "savings", "high_yield", "emergency"]);

export async function getAvailableCashBalance(userId: string): Promise<number> {
  const accounts = await listAccounts(userId);
  return accounts
    .filter(
      (account) =>
        !account.isArchived &&
        account.includeInNetWorth &&
        SPENDABLE_TYPES.has(account.type),
    )
    .reduce((sum, account) => sum + Math.max(0, account.currentBalanceCents), 0);
}

export async function getPaycheckProjection(
  userId: string,
): Promise<PaycheckProjection> {
  const today = startOfToday();
  const [nextPaydays, availableCash, plannedMonthlyDiscretionary, currency] =
    await Promise.all([
      getNextPaydays(userId, today, 4),
      getAvailableCashBalance(userId),
      getAverageDiscretionaryMonthly(userId),
      listAccounts(userId).then(
        (accounts) => accounts[0]?.currency ?? DEFAULT_CURRENCY,
      ),
    ]);

  const next = nextPaydays[0] ?? null;
  const nextDate = next ? fromISODate(next.date) : null;
  const windowEnd = nextDate ?? addDays(today, 14);

  const obligations = await getUpcomingObligations(userId, {
    from: today,
    until: windowEnd,
    includeGoalContributions: true,
  });
  const obligationsTotalCents = obligations.reduce(
    (sum, item) => sum + item.amountCents,
    0,
  );

  // Discretionary spend is prorated to the length of the window so a 10-day
  // window does not assume a whole month's worth of eating out.
  const windowDays = Math.max(
    1,
    Math.round((windowEnd.getTime() - today.getTime()) / 86_400_000) + 1,
  );
  const monthFraction = windowDays / 30.44;
  const plannedExpensesCents = Math.round(plannedMonthlyDiscretionary * monthFraction);

  const expectedPaycheckCents = next?.amountCents ?? 0;
  const safeToSpendCents =
    availableCash + expectedPaycheckCents - obligationsTotalCents;
  const expectedSavingsCents = safeToSpendCents - plannedExpensesCents;

  return {
    payday: next
      ? {
          paydayId: next.paydayId,
          label: next.label,
          date: next.date,
          amountCents: next.amountCents,
          accountId: next.accountId,
        }
      : null,
    nextPaydayDate: next?.date ?? null,
    daysUntilPayday: next?.daysUntil ?? null,
    expectedPaycheckCents,
    availableCashCents: availableCash,
    obligations: obligations.slice(0, 12),
    obligationsTotalCents,
    plannedExpensesCents,
    projectedRemainingCents: expectedSavingsCents,
    safeToSpendCents,
    expectedSavingsCents,
    otherPaydaysInWindow: nextPaydays
      .slice(1)
      .map((item) => ({
        paydayId: item.paydayId,
        label: item.label,
        date: item.date,
        amountCents: item.amountCents,
        accountId: item.accountId,
      })),
    currency,
  };
}

/**
 * Average monthly discretionary spending.
 *
 * Deliberately excludes anything already counted as a bill, EMI, subscription
 * or recurring charge, so the paycheck projection does not subtract the same
 * dollar twice. Uses the trailing 3 months.
 */
export async function getAverageDiscretionaryMonthly(
  userId: string,
  months = 3,
): Promise<number> {
  const today = startOfToday();
  const keys = monthRangeKeys(months, today);
  const from = `${keys[0]}-01`;
  const to = toISODate(today);

  const [recurringSpend, monthlyTotals] = await Promise.all([
    getRecurringRevenueByMonth(userId, from, to),
    getMonthlyTotals(userId, from, to),
  ]);

  const totalExpense = [...monthlyTotals.values()].reduce(
    (sum, entry) => sum + entry.expenseCents,
    0,
  );
  const activeMonths = Math.max(1, monthlyTotals.size);
  const averageTotal = Math.round(totalExpense / activeMonths);
  return Math.max(0, averageTotal - Math.round(recurringSpend / activeMonths));
}

/**
 * Upcoming discretionary transactions the user has already planned
 * (any non-recurring expense dated in the future).
 */
export async function getPlannedExpenses(
  userId: string,
  until: Date,
): Promise<number> {
  const today = startOfToday();
  const future = await listTransactions(userId, {
    from: toISODate(addDays(today, 1)),
    to: toISODate(until),
    type: "expense",
    limit: 500,
  });
  return future.reduce((sum, transaction) => sum + transaction.amountCents, 0);
}

/** Income already recorded this month, for the "on track for payday" check. */
export async function getMonthToDateIncome(userId: string): Promise<number> {
  const today = startOfToday();
  const totals = await getMonthlyTotals(
    userId,
    `${monthKey(today)}-01`,
    toISODate(today),
  );
  return totals.get(monthKey(today))?.incomeCents ?? 0;
}

/** Ratio helper used by the health metrics. */
export function expenseToIncomeRatio(
  expensesCents: number,
  incomeCents: number,
): number {
  return safeDivide(expensesCents, incomeCents);
}