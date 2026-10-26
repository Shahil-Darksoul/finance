import { addDays } from "date-fns";
import { listBills } from "@/lib/repo/bills";
import { listRecurring } from "@/lib/repo/recurring";
import { listGoals } from "@/lib/repo/goals";
import { listOccurrenceSkips } from "@/lib/repo/occurrence-skips";
import type { Bill, CalendarEvent, RecurringTransaction, UpcomingObligation } from "@/lib/types";
import { firstOccurrenceOnOrAfter, occurrencesInRange } from "./recurrence";
import { fromISODate, startOfToday, toISODate } from "@/lib/utils/date";

export function billSource(bill: Bill): CalendarEvent["source"] {
  if (bill.kind === "emi") return "emi";
  if (bill.kind === "sip") return "sip";
  return "bill";
}

/**
 * Everything that is expected to leave an account between now and `until`.
 *
 * Bills, EMI instalments, subscriptions and planned goal contributions are all
 * included, because they all compete for the same paycheck. Recurring
 * *templates* are only counted once a dated transaction for that occurrence
 * exists, so nothing is double counted with a bill of the same name.
 */

export function billRule(bill: Bill) {
  return {
    frequency: bill.frequency,
    intervalCount: 1,
    dayOfMonth: bill.dueDay,
    startDate: bill.startDate,
    endDate: bill.endDate,
  };
}

export function recurringRule(item: RecurringTransaction) {
  const daysOfWeek = item.daysOfWeek
    ? item.daysOfWeek.split(",").map((value) => Number.parseInt(value, 10))
    : null;
  return {
    frequency: item.frequency,
    intervalCount: item.intervalCount,
    daysOfWeek: daysOfWeek && daysOfWeek.length ? daysOfWeek : null,
    dayOfMonth: item.dayOfMonth,
    monthOfYear: item.monthOfYear,
    startDate: item.startDate,
    endDate: item.endDate,
  };
}

export type UpcomingOptions = {
  from?: Date;
  until?: Date;
  includeGoalContributions?: boolean;
  excludeRecurringTemplates?: boolean;
};

export async function getUpcomingObligations(
  userId: string,
  options: UpcomingOptions = {},
): Promise<UpcomingObligation[]> {
  const from = options.from ?? startOfToday();
  const until = options.until ?? addDays(from, 45);
  const results: UpcomingObligation[] = [];

  const [bills, recurring, goals, skips] = await Promise.all([
    listBills(userId, { includeInactive: false }),
    options.excludeRecurringTemplates
      ? Promise.resolve([])
      : listRecurring(userId),
    options.includeGoalContributions === false
      ? Promise.resolve([])
      : listGoals(userId),
    listOccurrenceSkips(userId),
  ]);

  const skippedDates = new Set(
    skips.map((skip) => `${skip.sourceType}:${skip.sourceId}:${skip.date}`),
  );
  const isSkipped = (source: string, id: string, date: string) =>
    skippedDates.has(`${source}:${id}:${date}`);

  // Bills and EMI instalments.
  for (const bill of bills) {
    for (const date of occurrencesInRange(billRule(bill), from, until, 24)) {
      const iso = toISODate(date);
      if (isSkipped("bill", bill.id, iso)) continue;
      results.push({
        id: bill.id,
        source: billSource(bill) as UpcomingObligation["source"],
        name: bill.kind === "sip" && bill.investmentSymbol
          ? `${bill.name} (${bill.investmentSymbol})`
          : bill.name,
        dueDate: iso,
        amountCents: bill.amountCents,
        accountId: bill.accountId,
        autopay: bill.autopay,
      });
    }
  }

  // Recurring subscriptions and charges.
  for (const item of recurring) {
    if (item.type === "income") continue;
    for (const date of occurrencesInRange(recurringRule(item), from, until, 24)) {
      const iso = toISODate(date);
      if (isSkipped("recurring", item.id, iso)) continue;
      results.push({
        id: item.id,
        source: "recurring",
        name: item.name,
        dueDate: iso,
        amountCents: item.amountCents,
        accountId: item.accountId,
        autopay: false,
      });
    }
  }

  // Planned savings-goal contributions.
  for (const goal of goals) {
    if (goal.archived || goal.monthlyContributionCents <= 0) continue;
    const next = monthlyOccurrence(goal.targetDate, goal.createdAt, from);
    if (!next || next > until) continue;
    const iso = toISODate(next);
    if (isSkipped("goal", goal.id, iso)) continue;
    results.push({
      id: goal.id,
      source: "goal",
      name: `Goal: ${goal.name}`,
      dueDate: iso,
      amountCents: goal.monthlyContributionCents,
      accountId: goal.accountId,
      autopay: false,
    });
  }

  return results.sort((a, b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return b.amountCents - a.amountCents;
  });
}

/** Next month boundary for a goal, anchored on its creation month. */
function monthlyOccurrence(
  targetDate: string | null,
  createdAt: string,
  from: Date,
): Date | null {
  const anchor = fromISODate(createdAt.slice(0, 10));
  let candidate = new Date(from.getFullYear(), from.getMonth(), anchor.getDate());
  if (candidate < from) {
    candidate = new Date(from.getFullYear(), from.getMonth() + 1, anchor.getDate());
  }
  if (targetDate) {
    const limit = fromISODate(targetDate);
    if (candidate > limit) return null;
  }
  return candidate;
}

/** The next due date for a single bill — used on bill cards. */
export function nextBillDate(bill: Bill, from = startOfToday()): string | null {
  const next = firstOccurrenceOnOrAfter(billRule(bill), from);
  return next ? toISODate(next) : null;
}

/** Monthly-equivalent cost of all active obligations. */
export async function getMonthlyObligationTotal(
  userId: string,
): Promise<number> {
  const obligations = await getUpcomingObligations(userId, {
    from: startOfToday(),
    until: addDays(startOfToday(), 31),
  });
  return obligations.reduce((sum, item) => sum + item.amountCents, 0);
}