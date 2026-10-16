import { formatMoney } from "@/lib/utils/money";
import { getDisplayCurrency } from "@/lib/repo/user-settings";
import {
  DISPLAY_CURRENCY_CODES,
  isDisplayCurrency,
  type DisplayCurrencyCode,
  type DisplayView,
} from "@/lib/utils/currency";

/**
 * Display-currency conversion.
 *
 * Amounts are always *stored* in the account's base currency (users.currency)
 * so the ledger stays exact. This service lets the whole UI be viewed in
 * another currency — INR, for example — converting at live market rates.
 * Rates come from a key-free public feed and fall back to approximate static
 * cross-rates when the network is unavailable, and every converted figure is
 * labelled so it is never mistaken for the stored amount.
 */

export {
  DISPLAY_CURRENCY_CODES,
  DISPLAY_CURRENCY_LABELS,
  isDisplayCurrency,
  type DisplayCurrencyCode,
  type DisplayView,
} from "@/lib/utils/currency";

/** Approximate units per 1 USD — offline fallback only, never claimed as live. */
const FALLBACK_PER_USD: Record<DisplayCurrencyCode, number> = {
  USD: 1,
  CAD: 1.38,
  INR: 88.5,
  EUR: 0.92,
  GBP: 0.79,
  AUD: 1.52,
};

const RATE_TTL_MS = 15 * 60 * 1000;

type RateTable = {
  base: string;
  /** Units of each currency per 1 unit of `base`. */
  rates: Record<string, number>;
  live: boolean;
  asOf: Date;
};

let rateCache: RateTable | null = null;

/**
 * Live rates from open.er-api.com (no API key required), cached for 15 minutes.
 * On any failure we build a USD cross-rate table from the static fallbacks and
 * mark it `live: false` so the UI can say so.
 */
async function fetchRates(base: string): Promise<RateTable> {
  if (
    rateCache &&
    rateCache.base === base &&
    Date.now() - rateCache.asOf.getTime() < RATE_TTL_MS
  ) {
    return rateCache;
  }

  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      // The route handlers that call this are already force-dynamic; this
      // additionally tells Next's fetch cache not to sit on a stale table.
      next: { revalidate: 0 },
    });
    if (!response.ok) throw new Error(`rate feed responded ${response.status}`);
    const payload = (await response.json()) as {
      result?: string;
      rates?: Record<string, number>;
      time_last_update_unix?: number;
    };
    if (payload.result !== "success" || !payload.rates) {
      throw new Error("rate feed returned an unexpected payload");
    }

    const rates: Record<string, number> = {};
    for (const code of DISPLAY_CURRENCY_CODES) {
      const value = payload.rates[code];
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        rates[code] = value;
      }
    }
    if (base !== "USD" && typeof payload.rates.USD === "number") {
      rates.USD = payload.rates.USD;
    }
    if (Object.keys(rates).length === 0) throw new Error("rate feed had no usable rates");

    rateCache = {
      base,
      rates,
      live: true,
      asOf: payload.time_last_update_unix
        ? new Date(payload.time_last_update_unix * 1000)
        : new Date(),
    };
    return rateCache;
  } catch {
    const basePerUsd = FALLBACK_PER_USD[base as DisplayCurrencyCode] ?? 1;
    const rates: Record<string, number> = {};
    for (const code of DISPLAY_CURRENCY_CODES) {
      rates[code] = FALLBACK_PER_USD[code] / basePerUsd;
    }
    rateCache = { base, rates, live: false, asOf: new Date() };
    return rateCache;
  }
}

export type DisplayContext = {
  /** Currency amounts are stored and computed in. */
  baseCurrency: string;
  /** Currency currently shown in the UI. */
  currency: string;
  /** Display units per 1 base unit. */
  rate: number;
  live: boolean;
  asOf: Date | null;
  converted: boolean;
};

export function toDisplayView(ctx: DisplayContext): DisplayView {
  return {
    baseCurrency: ctx.baseCurrency,
    currency: ctx.currency,
    rate: ctx.rate,
    live: ctx.live,
    asOf: ctx.asOf ? ctx.asOf.toISOString() : null,
    converted: ctx.converted,
  };
}

/**
 * Resolves the signed-in user's display context: their stored base currency
 * plus the saved display preference, priced at the latest available rate.
 */
export async function resolveDisplay(
  baseCurrency: string,
  userId: string,
): Promise<DisplayContext> {
  const stored = await getDisplayCurrency(userId);
  const currency =
    stored && isDisplayCurrency(stored) && stored !== baseCurrency
      ? stored
      : baseCurrency;

  if (currency === baseCurrency) {
    return {
      baseCurrency,
      currency,
      rate: 1,
      live: true,
      asOf: null,
      converted: false,
    };
  }

  const table = await fetchRates(baseCurrency);
  const rate = table.rates[currency] ?? 1;
  return {
    baseCurrency,
    currency,
    rate,
    live: table.live,
    asOf: table.asOf,
    converted: true,
  };
}

/** Converts stored base-currency cents into display-currency cents. */
export function convertCents(cents: number, ctx: DisplayContext): number {
  if (!ctx.converted || ctx.rate === 1) return cents;
  return Math.round(cents * ctx.rate);
}

export type DisplayMoneyOptions = {
  signed?: boolean;
  compact?: boolean;
  trimZeroes?: boolean;
  hideSymbol?: boolean;
};

/**
 * A formatter bound to the display context. Pass stored (base-currency) cents
 * and get a correctly converted, correctly symbolised string.
 */
export function displayMoney(ctx: DisplayContext) {
  return (cents: number, options: DisplayMoneyOptions = {}): string =>
    formatMoney(convertCents(cents, ctx), { currency: ctx.currency, ...options });
}

/** "1 CAD ≈ 88.52 INR" — for the note next to converted figures. */
export function rateLabel(ctx: DisplayContext): string | null {
  if (!ctx.converted) return null;
  const precision = ctx.rate >= 100 ? 1 : ctx.rate >= 10 ? 2 : 4;
  return `1 ${ctx.baseCurrency} ≈ ${ctx.rate.toFixed(precision)} ${ctx.currency}`;
}

/** Converts cents from an arbitrary currency into display-currency cents. */
export async function convertCurrencyToDisplay(
  cents: number,
  fromCurrency: string,
  ctx: DisplayContext,
): Promise<number> {
  if (fromCurrency === ctx.baseCurrency && !ctx.converted) return cents;
  if (fromCurrency === ctx.currency) return cents;
  if (fromCurrency === ctx.baseCurrency) return convertCents(cents, ctx);
  const table = await fetchRates(fromCurrency);
  const rateToDisplay = table.rates[ctx.currency] ?? (ctx.currency === "USD" ? 1 : undefined);
  if (rateToDisplay === undefined) {
    // try via base
    if (ctx.baseCurrency === "USD") return Math.round(cents * (FALLBACK_PER_USD[ctx.currency as DisplayCurrencyCode] ?? 1));
    // fallback: no conversion
    return cents;
  }
  return Math.round(cents * rateToDisplay);
}
