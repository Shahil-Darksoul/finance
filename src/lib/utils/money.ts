/**
 * Money helpers.
 *
 * Every monetary amount in the app is stored as an integer number of minor
 * units (cents) so that arithmetic is exact and free of floating point drift.
 * These helpers are the only place that converts between cents and display
 * strings, which keeps rounding behaviour consistent across the UI and exports.
 */

export const MINOR_UNITS_PER_MAJOR = 100;

/** Parse a user-typed dollar amount ("1,250.50", "$40", "-12") into cents. */
export function parseAmountToCents(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return 0;
    return Math.round(input * MINOR_UNITS_PER_MAJOR);
  }
  const cleaned = input.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * MINOR_UNITS_PER_MAJOR);
}

export function centsToMajor(cents: number): number {
  return cents / MINOR_UNITS_PER_MAJOR;
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string, compact: boolean): Intl.NumberFormat {
  const key = `${currency}:${compact ? "compact" : "full"}`;
  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      minimumFractionDigits: compact ? 0 : 2,
      maximumFractionDigits: compact ? 1 : 2,
    });
    currencyFormatters.set(key, formatter);
  }
  return formatter;
}

export type FormatMoneyOptions = {
  currency?: string;
  /** Always prefix a leading + (used for deltas). */
  signed?: boolean;
  /** 12.3K style, for tight spaces like stat tiles. */
  compact?: boolean;
  /** Hide the currency symbol, e.g. for axis ticks. */
  hideSymbol?: boolean;
  /** Drop the trailing ".00" on whole amounts. */
  trimZeroes?: boolean;
};

/** Format integer cents for display. */
export function formatMoney(
  cents: number,
  options: FormatMoneyOptions = {},
): string {
  const {
    currency = "USD",
    signed = false,
    compact = false,
    hideSymbol = false,
    trimZeroes = false,
  } = options;

  const major = centsToMajor(cents);
  const negative = major < 0;

  if (Number.isNaN(major) || !Number.isFinite(major)) return "—";

  let text = getFormatter(currency, compact).format(Math.abs(major));
  if (trimZeroes) {
    text = text.replace(/\.00$/, "");
  }
  if (hideSymbol) {
    text = text.replace(currency === "USD" ? /^\$/ : /^[^\d\s-]+/, "");
  }

  const prefix = negative ? "-" : signed ? "+" : "";
  return `${prefix}${text}`;
}

/** Parse a number that is a plain ratio (0.42) into a display percentage. */
export function formatPercent(
  ratio: number,
  options: { signed?: boolean; digits?: number } = {},
): string {
  const { signed = false, digits = 1 } = options;
  if (!Number.isFinite(ratio)) return "—";
  const pct = ratio * 100;
  const sign = signed && pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)}%`;
}

/** Clamp a ratio into 0..1 (for progress bars). */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Safe division that yields 0 instead of NaN/Infinity. */
export function safeDivide(numerator: number, denominator: number): number {
  if (!denominator || !Number.isFinite(denominator)) return 0;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : 0;
}

/** Format a cents delta with an explicit sign for trend comparisons. */
export function formatDelta(cents: number, currency = "USD"): string {
  return formatMoney(cents, { currency, signed: true });
}

/**
 * Parse a CSV cell into cents, understanding:
 *  - "1234.56"            -> dollars
 *  - "-1234.56", "(45.20)" -> negative
 *  - "1234", "1,234"      -> whole dollars
 *  - "45.20-", "45.20 CR" -> positive
 */
export function parseCsvAmount(cell: string): number {
  const raw = cell.trim();
  if (!raw) return 0;
  const isParenthetical = /^\(.*\)$/.test(raw);
  const isTrailingMinus = /-$/.test(raw);
  const isCr = /\b(CR|credit)\b/i.test(raw);
  const isDr = /\b(DR|debit)\b/i.test(raw);
  const numeric = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(numeric)) return 0;
  let cents = Math.round(numeric * 100);
  if (isParenthetical || isTrailingMinus) cents = -Math.abs(cents);
  if (isCr) cents = Math.abs(cents);
  if (isDr) cents = -Math.abs(cents);
  return cents;
}