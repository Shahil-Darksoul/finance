import { addDays, startOfMonth, subMonths } from "date-fns";
import { getAccountTotals, listAccounts } from "@/lib/repo/accounts";
import { getOutstandingLoanPrincipalCents } from "@/lib/repo/bills";
import { getMonthlyTotals } from "@/lib/repo/transactions";
import { getPortfolioSummary } from "./portfolio";
import { safeDivide } from "@/lib/utils/money";
import {
  daysBetween,
  monthKey,
  monthRangeKeys,
  startOfToday,
  toISODate,
} from "@/lib/utils/date";
import type { FinancialSummary } from "@/lib/types";

/**
 * The dashboard's headline numbers.
 *
 * Every figure here is derived from stored records — nothing is estimated. The
 * investments line is the one value that depends on market data, and it is
 * labelled as such wherever it is displayed.
 */
export async function getFinancialSummary(userId: string): Promise<FinancialSummary> {
  const today = startOfToday();
  const thisMonth = monthKey(today);
  const previousMonth = monthKey(subMonths(today, 1));
  const rangeStart = `${monthRangeKeys(13, today)[0]}-01`;

  const [totals, monthly, investmentsCents, loanPrincipalCents] = await Promise.all([
    getAccountTotals(userId),
    getMonthlyTotals(userId, rangeStart, toISODate(today)),
    getPortfolioSummary(userId)
      .then((summary) => summary.totalValueCents)
      .catch(() => 0),
    getOutstandingLoanPrincipalCents(userId),
  ]);

  const current = monthly.get(thisMonth);
  const prior = monthly.get(previousMonth);

  // Savings counts income minus expenses only. Money moved into investments is
  // excluded so investing is never framed as spending, and transfers are
  // already excluded at the SQL level.
  const monthlyIncomeCents = current?.incomeCents ?? 0;
  const monthlyExpenseCents = current?.expenseCents ?? 0;
  const monthlySavingsCents = monthlyIncomeCents - monthlyExpenseCents;

  // Net worth is rebuilt from the components shown next to it, so the identity
  // `net worth = cash + savings + investments − debt + receivables` always holds
  // on screen. Receivables are money lent out that is still owed back, so they
  // replace the cash that left the account.
  //
  // The ledger total is *not* reused directly: it values brokerage at its cash
  // balance and ignores the securities sitting in it, which understates net
  // worth by the gap between cost and market value.
  //
  // Money owed spans two records: liability accounts (their balances are already
  // negative in `totals.netWorthCents`) and EMI bills, whose outstanding
  // principal is not an account balance and so must be subtracted here.
  const netWorthCents =
    totals.netWorthCents + investmentsCents - loanPrincipalCents;

  return {
    netWorthCents,
    cashCents: totals.cashCents,
    savingsCents: totals.savingsCents,
    debtCents: totals.debtCents + loanPrincipalCents,
    investmentsCents,
    receivablesCents: totals.receivablesCents,
    monthlyIncomeCents,
    monthlyExpenseCents,
    monthlySavingsCents,
    savingsRate: safeDivide(monthlySavingsCents, monthlyIncomeCents),
    priorMonthIncomeCents: prior?.incomeCents ?? 0,
    priorMonthExpenseCents: prior?.expenseCents ?? 0,
    priorMonthSavingsCents:
      (prior?.incomeCents ?? 0) - (prior?.expenseCents ?? 0),
  };
}

/** Cash that can actually be spent right now (excludes savings and investments). */
export async function getAvailableCash(userId: string): Promise<number> {
  const accounts = await listAccounts(userId);
  const spendable = accounts.filter(
    (account) =>
      account.includeInNetWorth &&
      !account.isArchived &&
      (account.type === "checking" ||
        account.type === "cash" ||
        account.type === "savings" ||
        account.type === "high_yield" ||
        account.type === "emergency"),
  );
  return spendable.reduce(
    (sum, account) => sum + account.currentBalanceCents,
    0,
  );
}

/** Month-to-date progress through the current month, 0..1. */
export function monthProgress(today = startOfToday()): number {
  const start = startOfMonth(today);
  const daysInMonth = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0,
  ).getDate();
  return safeDivide(daysBetween(start, today) + 1, daysInMonth);
}

/** "Day 12 of 30" — shown next to month-to-date figures. */
export function monthProgressLabel(today = startOfToday()): string {
  const daysInMonth = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0,
  ).getDate();
  return `Day ${daysBetween(startOfMonth(today), today) + 1} of ${daysInMonth}`;
}

/** Compares two values and returns a signed ratio plus direction. */
export function trend(current: number, previous: number) {
  if (previous === 0) {
    return {
      ratio: 0,
      direction: current === 0 ? "flat" : "up",
      hasBaseline: false,
    } as const;
  }
  const ratio = (current - previous) / Math.abs(previous);
  return {
    ratio,
    direction: ratio > 0.01 ? "up" : ratio < -0.01 ? "down" : "flat",
    hasBaseline: true,
  } as const;
}

export { addDays };