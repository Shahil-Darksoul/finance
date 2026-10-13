import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfDay,
  getDate,
  isAfter,
  isBefore,
  lastDayOfMonth,
  startOfDay,
} from "date-fns";
import { fromISODate, toISODate } from "@/lib/utils/date";
import type { BillFrequency, RecurrenceFrequency } from "@/lib/types";

/**
 * A single recurrence rule.
 *
 * Recurring transactions, subscriptions and bills are all expressed with this
 * shape, so the calendar, the upcoming-obligation list and the paycheck
 * projection can never disagree about when money moves.
 */
export type RecurrenceRule = {
  frequency: RecurrenceFrequency | BillFrequency;
  /** Units between occurrences (e.g. 2 for "every other week"). */
  intervalCount?: number;
  /** 0 = Sunday … 6 = Saturday. Used by weekly/biweekly/custom rules. */
  daysOfWeek?: number[] | null;
  /** 1-31, clamped to the last day of shorter months. */
  dayOfMonth?: number | null;
  monthOfYear?: number | null;
  startDate: string;
  endDate?: string | null;
};

/** Loop guard: ~500 years of daily occurrences is plenty. */
const MAX_ITERATIONS = 200_000;

function clampDayOfMonth(monthDate: Date, day: number): Date {
  const last = lastDayOfMonth(monthDate).getDate();
  return new Date(monthDate.getFullYear(), monthDate.getMonth(), Math.min(day, last));
}

/** Monday-based offset (0 = Monday … 6 = Sunday) for a JS day index. */
function mondayOffset(dayOfWeek: number): number {
  return (dayOfWeek + 6) % 7;
}

/** Next eligible day-of-week on or after the anchor, stepping `stepWeeks` weeks. */
function nextWeekly(
  daysOfWeek: number[],
  start: Date,
  lowerBound: Date,
  stepWeeks: number,
): Date | null {
  const step = 7 * Math.max(1, stepWeeks);
  const anchorMonday = addDays(start, -mondayOffset(start.getDay()));
  const offsets = [...new Set(daysOfWeek.map(mondayOffset))].sort((a, b) => a - b);

  // Jump close to the target instead of walking from the anchor.
  const approxBlocks = Math.floor(
    Math.max(0, differenceInCalendarDays(lowerBound, anchorMonday)) / step,
  );

  for (let block = Math.max(0, approxBlocks - 1); block < MAX_ITERATIONS; block += 1) {
    const weekStart = addDays(anchorMonday, block * step);
    for (const offset of offsets) {
      const candidate = startOfDay(addDays(weekStart, offset));
      if (isBefore(candidate, start)) continue;
      if (isBefore(candidate, lowerBound)) continue;
      return candidate;
    }
  }
  return null;
}

/** Next eligible day-of-month on or after the anchor, stepping `stepMonths`. */
function nextMonthly(
  daysOfMonth: number[],
  start: Date,
  lowerBound: Date,
  stepMonths: number,
  monthOfYear: number | null,
): Date | null {
  const step = Math.max(1, stepMonths);
  const anchorMonth = new Date(start.getFullYear(), start.getMonth(), 1);
  const days = [...new Set(daysOfMonth)].sort((a, b) => a - b);

  // Jump close to the target month.
  const approxMonths = Math.max(
    0,
    Math.floor(
      differenceInCalendarDays(
        lowerBound,
        new Date(lowerBound.getFullYear(), lowerBound.getMonth(), 1),
      ) / 30,
    ),
  );

  let cursor = addMonths(anchorMonth, approxMonths > 0 ? approxMonths - 1 : 0);
  if (isBefore(cursor, anchorMonth)) cursor = anchorMonth;

  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const monthsBetween =
      (cursor.getFullYear() - anchorMonth.getFullYear()) * 12 +
      (cursor.getMonth() - anchorMonth.getMonth());
    // Re-align to the cadence anchored at the start month.
    if (monthsBetween % step !== 0) {
      cursor = addMonths(cursor, step - (monthsBetween % step));
      continue;
    }
    if (monthOfYear !== null && cursor.getMonth() + 1 !== monthOfYear) {
      cursor = addMonths(cursor, step);
      continue;
    }
    for (const day of days) {
      const candidate = clampDayOfMonth(cursor, day);
      if (isBefore(candidate, start)) continue;
      if (isBefore(candidate, lowerBound)) continue;
      return candidate;
    }
    cursor = addMonths(cursor, step);
  }
  return null;
}

/**
 * The first occurrence strictly after `after`.
 *
 * "Strictly after" is what makes the engine safe to iterate: callers advance
 * their cursor to the returned date and ask again, so an inclusive bound would
 * return the same date forever. Use `firstOccurrenceOnOrAfter` when you need
 * the inclusive behaviour.
 *
 * Returns null when the rule has ended or can never produce a future date.
 */
export function nextOccurrence(
  rule: RecurrenceRule,
  after: Date,
): Date | null {
  const start = startOfDay(fromISODate(rule.startDate));
  const end = rule.endDate ? endOfDay(fromISODate(rule.endDate)) : null;
  const afterDay = startOfDay(after);

  // A rule whose window has already closed can never produce a future date.
  if (end && isAfter(start, end)) return null;

  const exclusiveBound = addDays(afterDay, 1);
  const lowerBound = isAfter(exclusiveBound, start) ? exclusiveBound : start;
  const interval = Math.max(1, rule.intervalCount ?? 1);
  let candidate: Date | null = null;

  switch (rule.frequency) {
    case "daily": {
      const diff = differenceInCalendarDays(lowerBound, start);
      const blocks = Math.max(0, Math.floor(diff / interval));
      candidate = startOfDay(addDays(start, blocks * interval));
      if (isBefore(candidate, lowerBound)) {
        candidate = startOfDay(addDays(candidate, interval));
      }
      break;
    }

    case "weekly":
    case "biweekly": {
      const weekInterval = rule.frequency === "biweekly" ? 2 * interval : interval;
      const days = rule.daysOfWeek?.length ? rule.daysOfWeek : [getDate(start)];
      candidate = nextWeekly(days, start, lowerBound, weekInterval);
      break;
    }

    case "custom": {
      if (rule.daysOfWeek?.length) {
        candidate = nextWeekly(rule.daysOfWeek, start, lowerBound, interval);
      } else {
        candidate = nextMonthly(
          [rule.dayOfMonth ?? getDate(start)],
          start,
          lowerBound,
          interval,
          rule.monthOfYear ?? null,
        );
      }
      break;
    }

    case "monthly":
    case "quarterly":
    case "yearly": {
      const step =
        rule.frequency === "yearly"
          ? interval * 12
          : rule.frequency === "quarterly"
            ? interval * 3
            : interval;
      candidate = nextMonthly(
        [rule.dayOfMonth ?? getDate(start)],
        start,
        lowerBound,
        step,
        rule.monthOfYear ?? null,
      );
      break;
    }

    default:
      candidate = null;
  }

  if (!candidate) return null;
  if (isBefore(candidate, lowerBound)) return null;
  if (end && isAfter(candidate, end)) return null;
  return candidate;
}

/** All occurrences of a rule within [from, to], inclusive. */
export function occurrencesInRange(
  rule: RecurrenceRule,
  from: Date,
  to: Date,
  maxOccurrences = 400,
): Date[] {
  const results: Date[] = [];
  let cursor = new Date(startOfDay(from).getTime() - 86_400_000);

  for (let i = 0; i < maxOccurrences; i += 1) {
    const next = nextOccurrence(rule, cursor);
    if (!next) break;
    if (isAfter(next, to)) break;
    results.push(next);
    cursor = next;
  }
  return results;
}

/** The first occurrence on or after `from` (used for "next payday"). */
export function firstOccurrenceOnOrAfter(
  rule: RecurrenceRule,
  from: Date,
): Date | null {
  // `from` itself is allowed, so ask for the day before it.
  return nextOccurrence(rule, addDays(startOfDay(from), -1));
}

/** Monthly amount a rule contributes per year, for ratio metrics. */
export function occurrencesPerYear(
  frequency: RecurrenceFrequency | BillFrequency,
  intervalCount = 1,
): number {
  const interval = Math.max(1, intervalCount);
  switch (frequency) {
    case "daily":
      return 365 / interval;
    case "weekly":
      return 52 / interval;
    case "biweekly":
      return 26 / interval;
    case "monthly":
      return 12 / interval;
    case "quarterly":
      return 4 / interval;
    case "yearly":
      return 1 / interval;
    default:
      return 12 / interval;
  }
}

export { addDays, addMonths, toISODate };