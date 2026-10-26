import { addDays, endOfMonth, startOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { listBills, listEmiPayments } from "@/lib/repo/bills";
import { listRecurring } from "@/lib/repo/recurring";
import { listGoals } from "@/lib/repo/goals";
import { listTransactions } from "@/lib/repo/transactions";
import { listInvestments } from "@/lib/repo/investments";
import { listOccurrenceSkips } from "@/lib/repo/occurrence-skips";
import { getPaydayOccurrences } from "./payday";
import { billRule, billSource, recurringRule } from "./obligations";
import { occurrencesInRange } from "./recurrence";
import { toISODate } from "@/lib/utils/date";
import type { CalendarEvent } from "@/lib/types";

/** Colour hints per event source; the UI maps these to tokens. */
const SOURCE_TONE: Record<CalendarEvent["source"], string> = {
  payday: "var(--positive)",
  bill: "var(--warning)",
  emi: "var(--negative)",
  recurring: "var(--info)",
  goal: "var(--primary)",
  sip: "var(--accent)",
  investment: "var(--accent)",
  transaction: "var(--muted-foreground)",
};

/**
 * Builds every event that falls inside a date window.
 *
 * Two event kinds overlap by design: scheduled obligations (bills, EMIs,
 * subscriptions, planned goal deposits) are *expected* money movements, while
 * recorded transactions are what actually happened. The UI labels them
 * differently so a projection is never mistaken for a posted transaction.
 */
export async function getCalendarEvents(
  userId: string,
  from: Date,
  to: Date,
): Promise<CalendarEvent[]> {
  const [bills, recurring, goals, paydays, investments, skips] = await Promise.all([
    listBills(userId),
    listRecurring(userId),
    listGoals(userId),
    getPaydayOccurrences(userId, from, to),
    listInvestments(userId),
    listOccurrenceSkips(userId),
  ]);

  const events: CalendarEvent[] = [];
  // Hidden single dates: `<source>:<id>:<date>`.
  const skippedDates = new Set(
    skips.map((skip) => `${skip.sourceType}:${skip.sourceId}:${skip.date}`),
  );
  const isSkipped = (source: string, id: string, date: string) =>
    skippedDates.has(`${source}:${id}:${date}`);

  for (const occurrence of paydays) {
    if (isSkipped("payday", occurrence.paydayId, occurrence.date)) continue;
    events.push({
      id: `payday-${occurrence.paydayId}-${occurrence.date}`,
      source: "payday",
      title: `${occurrence.label} payday`,
      date: occurrence.date,
      amountCents: occurrence.amountCents,
      amountEdited: occurrence.amountEdited,
      recurring: true,
      accountId: occurrence.accountId,
      color: SOURCE_TONE.payday,
    });
  }

  for (const bill of bills) {
    if (bill.kind === "emi") {
      // A loan's instalments shrink as interest falls, so the stored schedule is
      // the only accurate source for the calendar.
      const schedule = await listEmiPayments(userId, bill.id);
      const inRange = schedule.filter(
        (payment) =>
          payment.dueDate >= toISODate(from) &&
          payment.dueDate <= toISODate(to) &&
          !isSkipped("bill", bill.id, payment.dueDate),
      );

      if (inRange.length > 0) {
        for (const payment of inRange) {
          events.push({
            id: `emi-${bill.id}-${payment.dueDate}`,
            source: "emi",
            title: bill.name,
            date: payment.dueDate,
            amountCents: -payment.amountCents,
            recurring: true,
            accountId: bill.accountId,
            color: SOURCE_TONE.emi,
          });
        }
        continue;
      }
      // No schedule stored yet: fall through to the recurring rule.
    }

    const source = billSource(bill);
    for (const date of occurrencesInRange(billRule(bill), from, to, 24)) {
      const iso = toISODate(date);
      if (isSkipped("bill", bill.id, iso)) continue;
      events.push({
        id: `bill-${bill.id}-${iso}`,
        source,
        // The plan's target is part of its identity on the calendar, so it
        // reads as an investment contribution rather than a generic bill.
        title: bill.kind === "sip" && bill.investmentSymbol
          ? `${bill.name} (${bill.investmentSymbol})`
          : bill.name,
        date: iso,
        amountCents: -bill.amountCents,
        recurring: bill.startDate !== bill.endDate,
        accountId: bill.accountId,
        color: SOURCE_TONE[source],
      });
    }
  }

  for (const item of recurring) {
    for (const date of occurrencesInRange(recurringRule(item), from, to, 24)) {
      const iso = toISODate(date);
      if (isSkipped("recurring", item.id, iso)) continue;
      events.push({
        id: `recurring-${item.id}-${iso}`,
        source: "recurring",
        title: item.name,
        date: iso,
        // Recurring amounts are stored as magnitudes; only income arrives.
        amountCents: item.type === "income" ? item.amountCents : -item.amountCents,
        recurring: true,
        accountId: item.accountId,
        color: SOURCE_TONE.recurring,
      });
    }
  }

  for (const goal of goals) {
    if (goal.archived || goal.monthlyContributionCents <= 0) continue;
    for (const date of occurrencesInRange(
      {
        frequency: "monthly",
        startDate: goal.createdAt.slice(0, 10),
        dayOfMonth: Number(goal.createdAt.slice(8, 10)),
      },
      from,
      to,
      3,
    )) {
      const iso = toISODate(date);
      if (isSkipped("goal", goal.id, iso)) continue;
      events.push({
        id: `goal-${goal.id}-${iso}`,
        source: "goal",
        title: `${goal.name} contribution`,
        date: iso,
        // Money moving out of the account and into the goal.
        amountCents: -goal.monthlyContributionCents,
        recurring: true,
        accountId: goal.accountId,
        color: goal.color ?? SOURCE_TONE.goal,
      });
    }
  }

  // Actual recorded movements inside the window.
  const transactions = await listTransactions(userId, {
    from: toISODate(from),
    to: toISODate(to),
    limit: 400,
    sort: "date_asc",
  });
  for (const transaction of transactions) {
    events.push({
      id: `tx-${transaction.id}`,
      source: "transaction",
      title:
        transaction.description ??
        transaction.categoryName ??
        `${transaction.type} transaction`,
      date: transaction.date,
      amountCents:
        transaction.type === "expense" || transaction.type === "investment"
          ? -transaction.amountCents
          : transaction.amountCents,
      recurring: transaction.isRecurring,
      accountId: transaction.accountId,
      color: SOURCE_TONE.transaction,
      type: transaction.type,
      merchant: transaction.merchant,
    });
  }

  void investments;
  return events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return Math.abs(b.amountCents) - Math.abs(a.amountCents);
  });
}

export type CalendarWindow = {
  from: Date;
  to: Date;
};

/** Date window for each supported view. */
export function calendarWindow(
  view: "month" | "week" | "agenda",
  anchor: Date,
): CalendarWindow {
  if (view === "week") {
    return {
      from: startOfWeek(anchor, { weekStartsOn: 1 }),
      to: endOfWeek(anchor, { weekStartsOn: 1 }),
    };
  }
  if (view === "agenda") {
    return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
  }
  return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
}

/** Groups events by ISO date for quick lookup during rendering. */
export function groupByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const bucket = map.get(event.date);
    if (bucket) bucket.push(event);
    else map.set(event.date, [event]);
  }
  return map;
}

/** Totals per day, used by the agenda view summary. */
export function summariseByDay(
  events: CalendarEvent[],
): { date: string; bills: number; income: number }[] {
  const map = new Map<string, { date: string; bills: number; income: number }>();
  for (const event of events) {
    if (event.source === "transaction") continue;
    const entry = map.get(event.date) ?? {
      date: event.date,
      bills: 0,
      income: 0,
    };
    if (event.amountCents >= 0) entry.income += event.amountCents;
    else entry.bills += Math.abs(event.amountCents);
    map.set(event.date, entry);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export { addDays };