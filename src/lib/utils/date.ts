import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  isValid,
  parse,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";

/** `YYYY-MM-DD` — the canonical wire/storage format for all dates. */
export function toISODate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** `YYYY-MM-DDTHH:mm:ss` — used for timestamps. */
export function toISODateTime(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm:ss");
}

/** Parse `YYYY-MM-DD` into a local-midnight Date (no UTC shifting). */
export function fromISODate(value: string): Date {
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  if (isValid(parsed)) return parsed;
  const fallback = new Date(`${value}T00:00:00`);
  return isValid(fallback) ? fallback : new Date();
}

/** Parse `YYYY-MM` into the first instant of that month. */
export function fromISOMonth(value: string): Date {
  return parse(value, "yyyy-MM", new Date());
}

export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function monthKey(date: Date): string {
  return format(date, "yyyy-MM");
}

export function addMonthsKeepingDay(date: Date, months: number): Date {
  return addMonths(date, months);
}

/**
 * Monthly aggregation key used everywhere in analytics. Keeping this in one
 * function guarantees dashboard, analytics and forecast agree on buckets.
 */
export function monthRangeKeys(count: number, from = new Date()): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    keys.push(monthKey(subMonths(from, i)));
  }
  return keys;
}

export function daysBetween(from: Date, to: Date): number {
  return differenceInCalendarDays(to, from);
}

export function daysInRange(from: Date, to: Date): Date[] {
  if (from > to) return [];
  return eachDayOfInterval({ start: from, end: to });
}

export function formatDate(value: string | Date, pattern = "MMM d, yyyy"): string {
  const date = typeof value === "string" ? fromISODate(value) : value;
  return isValid(date) ? format(date, pattern) : "—";
}

export function formatDateShort(value: string | Date): string {
  return formatDate(value, "MMM d");
}

export function formatMonthLabel(value: string): string {
  return formatDate(fromISOMonth(value), "MMM yyyy");
}

/** Human relative time, e.g. "3 days ago", "in 2 months". */
export function formatRelative(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const diff = differenceInCalendarDays(date, startOfToday());
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff > 0) {
    if (diff < 30) return `in ${diff} day${diff === 1 ? "" : "s"}`;
    const months = Math.round(diff / 30);
    if (months < 12) return `in ${months} month${months === 1 ? "" : "s"}`;
    return `in ${Math.round(diff / 365)} year${Math.round(diff / 365) === 1 ? "" : "s"}`;
  }
  const past = Math.abs(diff);
  if (past < 30) return `${past} day${past === 1 ? "" : "s"} ago`;
  const months = Math.round(past / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  return `${Math.round(past / 365)} year${Math.round(past / 365) === 1 ? "" : "s"} ago`;
}

/** "3 days remaining" / "Today" — used by the payday countdown. */
export function formatCountdown(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "1 day remaining";
  return `${days} days remaining`;
}

export function startOfWeekISO(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

export function endOfMonthISO(date: Date): Date {
  return endOfMonth(date);
}

export { addDays, addMonths, endOfMonth, startOfMonth, subMonths };