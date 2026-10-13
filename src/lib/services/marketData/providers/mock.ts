import type { PricePoint, Quote } from "@/lib/types";
import {
  type HistoryRange,
  type MarketDataProvider,
  type ProviderHealth,
  MarketDataError,
} from "../types";
import { isCryptoSymbol } from "../symbols";

/**
 * Deterministic simulated price feed.
 *
 * Prices are *generated*, never stored: a seeded pseudo-random walk keyed on the
 * symbol produces a stable series, so a demo user sees the same chart on every
 * load while the numbers still respond to the current date. This exists so the
 * investment features are fully explorable before any API key is configured.
 *
 * Every quote it returns is flagged `simulated: true`, and the UI must display
 * that flag. It is not market data and must never be presented as such.
 */

/** FNV-1a hash → stable seed per symbol. */
function hashSymbol(symbol: string): number {
  let hash = 0x811c9dc5;
  const upper = symbol.toUpperCase();
  for (let i = 0; i < upper.length; i += 1) {
    hash ^= upper.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32 — small, fast, deterministic. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rough reference prices for symbols people commonly hold.
 *
 * Without these, a seeded symbol like SCHD could land at $364 and a demo user
 * would see a 1200% unrealised gain, which undermines trust in every other
 * number on screen. These are order-of-magnitude anchors so the generated
 * portfolio looks plausible; they are still generated data, not quotes.
 */
const REFERENCE_PRICES: Record<string, number> = {
  AAPL: 232, MSFT: 428, GOOGL: 178, AMZN: 201, NVDA: 138, TSLA: 248,
  META: 585, SPY: 573, QQQ: 500, VTI: 279, VOO: 545, SCHD: 27,
  VXUS: 62, BND: 73, IEF: 97, GLD: 244, SLV: 31, JPM: 218, BAC: 42,
  KO: 71, PEP: 145, WMT: 78, COST: 895, HD: 358, NKE: 76, DIS: 96,
  INTC: 24, AMD: 158, CRM: 275, ORCL: 172, ADBE: 512, NFLX: 921,

  // Crypto anchors. Coins trade far more violently than equities, so they get
  // their own volatility band via `isCrypto` in `profileFor`.
  BTC: 96000, ETH: 3400, SOL: 210, XRP: 2.3, BNB: 690, DOGE: 0.32,
  ADA: 0.72, AVAX: 38, DOT: 6.4, LINK: 21, MATIC: 0.42, LTC: 105,
  BCH: 480, ATOM: 7.2, UNI: 11.5,
};

/**
 * Crypto volatility multiplier.
 *
 * Coins routinely move several percent a day, so a demo holding of BTC that
 * drifted by 0.9% would read as implausibly calm next to real behaviour.
 */
const CRYPTO_VOLATILITY_MULTIPLIER = 4;

/** Rough per-symbol drift and volatility, derived from the seed. */
function profileFor(symbol: string) {
  const seed = hashSymbol(symbol);
  const random = createRandom(seed);
  const crypto = isCryptoSymbol(symbol);
  // Daily drift between roughly -0.15% and +0.15%, widened for crypto.
  const dailyDrift = (random() - 0.48) * 0.003 * (crypto ? CRYPTO_VOLATILITY_MULTIPLIER : 1);
  // Daily volatility between roughly 0.6% and 1.8%, widened for crypto.
  const volatility =
    (0.006 + random() * 0.012) * (crypto ? CRYPTO_VOLATILITY_MULTIPLIER : 1);
  const upper = symbol.toUpperCase();
  // Known symbols use their reference price; anything else gets a value in a
  // range plausible for its asset type, so an unrecognised coin is not quoted
  // at a plausible-for-an-equity price.
  const reference = REFERENCE_PRICES[upper];
  const basePrice = reference ?? (crypto ? 0.5 + random() * 40 : 18 + random() * 502);
  return { seed, dailyDrift, volatility, basePrice };
}

const MS_PER_DAY = 86_400_000;

/** Previous US trading day at or before `date`. */
function lastTradingDay(date: Date): Date {
  const cursor = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return cursor;
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Walks forward from `basePrice` over `days` trading days.
 * Deterministic for a given (symbol, day) pair, so any range can be produced
 * independently without storing historical rows.
 */
function walkForward(
  symbol: string,
  days: number,
  endDate: Date,
): { date: string; close: number }[] {
  const { seed, dailyDrift, volatility, basePrice } = profileFor(symbol);
  const random = createRandom(seed ^ days);

  let price = basePrice;
  const series: { date: string; close: number }[] = [];

  // Floor relative to the starting price. A fixed $1 floor would clamp every
  // sub-dollar coin to $1 while walking back through history, which produced
  // absurd day changes on tokens like DOGE.
  const floor = Math.max(basePrice * 0.05, 0.000001);

  let cursor = new Date(endDate.getTime());
  while (series.length < days) {
    const day = lastTradingDay(cursor);
    series.unshift({ date: toISODate(day), close: price });
    const shock = (random() - 0.5) * 2 * volatility;
    price = price * (1 + dailyDrift + shock);
    if (price < floor) price = floor;
    cursor = new Date(day.getTime() - MS_PER_DAY);
  }

  return series;
}

const RANGE_DAYS: Record<HistoryRange, number> = {
  "1mo": 30,
  "3mo": 91,
  "6mo": 182,
  "1y": 365,
  "3y": 1095,
  max: 1825,
};

export function createMockProvider(): MarketDataProvider {
  const name = "simulated";
  const now = () => new Date();

  const quoteFor = (symbol: string): Quote => {
    const upper = symbol.toUpperCase();
    // Use a 2-day window so `price` and `previousClose` are consistent.
    const series = walkForward(upper, 3, now());
    const latest = series[series.length - 1];
    const previous = series[series.length - 2];
    const priceCents = Math.round(latest.close * 100);
    const previousCloseCents = Math.round(previous.close * 100);
    const changeCents = priceCents - previousCloseCents;

    return {
      symbol: upper,
      priceCents,
      previousCloseCents,
      changeCents,
      changeRatio: previousCloseCents === 0 ? 0 : changeCents / previousCloseCents,
      currency: "USD",
      marketTime: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      provider: name,
      delayed: true,
      simulated: true,
    };
  };

  return {
    name,
    label: "Simulated feed",
    configured: true,
    simulated: true,

    async getQuote(symbol: string) {
      return quoteFor(symbol);
    },

    async getQuotes(symbols: string[]) {
      const map = new Map<string, Quote>();
      for (const symbol of symbols) map.set(symbol.toUpperCase(), quoteFor(symbol));
      return map;
    },

    async getHistoricalPrices(symbol: string, range: HistoryRange) {
      const days = RANGE_DAYS[range];
      const points: PricePoint[] = walkForward(symbol.toUpperCase(), days, now()).map(
        (row) => ({ date: row.date, closeCents: Math.round(row.close * 100) }),
      );
      return points;
    },
  };
}

export const mockProvider = createMockProvider();

export function describeMockProvider(): ProviderHealth {
  return {
    name: mockProvider.name,
    label: mockProvider.label,
    kind: "simulated",
    configured: true,
    detail:
      "Generated from a deterministic seeded walk so no API key is needed. Not real market data.",
  };
}

export { MarketDataError };