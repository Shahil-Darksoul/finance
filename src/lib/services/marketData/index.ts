import { getDb } from "@/lib/db";
import type { PricePoint, Quote } from "@/lib/types";
import {
  type HistoryRange,
  type MarketDataProvider,
  type ProviderHealth,
  MarketDataError,
} from "./types";
import { tsxLookupSymbol } from "./symbols";

/**
 * Credentials for a request. When omitted the environment is used, so callers
 * that have no per-user settings (or a user with none) keep working unchanged.
 */
export type MarketCredentials = {
  apiKey?: string | null;
  provider?: string | null;
};

/**
 * Market data facade.
 *
 * Responsibilities:
 *   1. pick a provider from the environment (never hardcode one),
 *   2. fall back to the simulator when no key is configured,
 *   3. cache quotes in the database so repeated page loads are cheap,
 *   4. retry transient failures with backoff and rate-limit handling.
 *
 * Credentials are read here, on the server, and are never sent to the browser.
 */

export type { HistoryRange, MarketDataProvider, ProviderHealth } from "./types";
export { MarketDataError, HISTORY_RANGES, KNOWN_SYMBOLS } from "./types";

const QUOTE_TTL_MS = 60_000;
const HISTORY_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;

/**
 * Hard ceiling on one quote round-trip.
 *
 * Prices come from a third party, so the request can hang or be slow. The
 * pages that show a portfolio must not inherit that latency: after this
 * budget the page renders with the prices it already has (or with cost basis)
 * and reports the gap, rather than holding the whole request open.
 */
const QUOTE_DEADLINE_MS = 5_000;

/** Message used for the timeout, so the breaker below can recognise it. */
const DEADLINE_MESSAGE = "Market data took too long to load.";

/**
 * How long a provider that just missed the deadline is left alone.
 *
 * A page can ask for prices more than once while it renders (the dashboard
 * summarises the portfolio, then builds insights from it). Paying the full
 * deadline twice would double the wait, so the provider is skipped for a
 * moment and the prices already in the cache are used instead.
 */
const SLOW_PROVIDER_COOLDOWN_MS = 30_000;

/** Set while the active provider is known to be too slow to answer. */
let slowProviderUntil = 0;

function env(key: string): string | undefined {
  const value = process.env[key];
  return value && value.trim() ? value.trim() : undefined;
}

/** Per-user credentials take precedence; the environment is the fallback. */
function resolveCredentials(credentials?: MarketCredentials): {
  apiKey: string | undefined;
  requested: string;
} {
  const apiKey =
    (credentials?.apiKey?.trim() || undefined) ?? env("MARKET_API_KEY");
  const requested = (
    credentials?.provider?.trim() ||
    env("MARKET_DATA_PROVIDER") ||
    "auto"
  ).toLowerCase();
  return { apiKey, requested };
}

/**
 * Providers are cached per credential set, not per process: two users with
 * different keys must not share a resolved provider. The key is public data
 * access credentials, but still never leaves the server.
 */
const providerCache = new Map<string, MarketDataProvider>();

/**
 * Resolve the active provider for a credential set.
 *
 * Order of preference:
 *   1. an explicit `finnhub|alphavantage|mock` choice,
 *   2. `auto` — a live provider when an API key exists, otherwise the simulator.
 */
export async function getProvider(
  credentials?: MarketCredentials,
): Promise<MarketDataProvider> {
  const { apiKey, requested } = resolveCredentials(credentials);
  const cacheKey = `${requested}:${apiKey ?? ""}`;
  const cached = providerCache.get(cacheKey);
  if (cached) return cached;

  const resolved = await buildProvider(requested, apiKey);
  providerCache.set(cacheKey, resolved);
  return resolved;
}

async function buildProvider(
  requested: string,
  apiKey: string | undefined,
): Promise<MarketDataProvider> {
  // Yahoo is keyless, so it must be resolved before the "no key → simulator"
  // rule below; selecting it is all the configuration it needs.
  if (requested === "yahoo") {
    const { createYahooProvider } = await import("./providers/yahoo");
    return createYahooProvider();
  }

  if (requested === "mock" || !apiKey) {
    const { mockProvider } = await import("./providers/mock");
    return mockProvider;
  }

  if (requested === "alphavantage") {
    const { createAlphaVantageProvider } = await import("./providers/alphavantage");
    return createAlphaVantageProvider(apiKey);
  }

  if (requested === "finnhub") {
    const { createFinnhubProvider } = await import("./providers/finnhub");
    return createFinnhubProvider(apiKey);
  }

  // auto: pick by key shape, defaulting to Finnhub.
  const looksLikeAlphaKey = apiKey.length > 20 && !/^[a-z0-9]{40}$/i.test(apiKey);
  if (looksLikeAlphaKey) {
    const { createAlphaVantageProvider } = await import("./providers/alphavantage");
    return createAlphaVantageProvider(apiKey);
  }
  const { createFinnhubProvider } = await import("./providers/finnhub");
  return createFinnhubProvider(apiKey);
}

/* --------------------------------------------------------------- retries */

async function withRetry<T>(
  operation: () => Promise<T>,
  provider: string,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof MarketDataError ? error.retryable : true;
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      // Exponential backoff: 300ms, 600ms, 1200ms (capped).
      const delay = Math.min(1200, 300 * 2 ** (attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  if (lastError instanceof MarketDataError) throw lastError;
  throw new MarketDataError("Market data is unavailable right now.", { provider });
}

/* --------------------------------------------------------------- deadline */

/**
 * Runs `operation` but gives up after `ms`.
 *
 * The provider request is not cancelled — it finishes in the background and
 * its result is simply dropped — but the caller stops waiting, so a slow
 * exchange feed can never hold a page render open.
 */
function withinDeadline<T>(
  operation: Promise<T>,
  ms: number,
  provider: string,
): Promise<T> {
  if (ms <= 0) {
    // Swallow the rejection so an abandoned request never surfaces as an
    // unhandled rejection.
    operation.catch(() => undefined);
    return Promise.reject(
      new MarketDataError(DEADLINE_MESSAGE, {
        status: 504,
        provider,
        retryable: false,
      }),
    );
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new MarketDataError(DEADLINE_MESSAGE, {
          status: 504,
          provider,
          retryable: false,
        }),
      );
    }, ms);

    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/* ----------------------------------------------------------------- cache */

async function readCachedQuote(
  symbol: string,
  provider: string,
): Promise<Quote | null> {
  const db = await getDb();
  const row = await db.get<{
    symbol: string;
    provider: string;
    price_cents: number;
    previous_close_cents: number;
    change_cents: number;
    change_ratio: number;
    currency: string;
    market_time: string | null;
    fetched_at: string;
  }>(
    `SELECT * FROM market_quotes WHERE symbol = ? AND provider = ?`,
    [symbol.toUpperCase(), provider],
  );
  if (!row) return null;

  return {
    symbol: row.symbol,
    priceCents: Number(row.price_cents),
    previousCloseCents: Number(row.previous_close_cents),
    changeCents: Number(row.change_cents),
    changeRatio: Number(row.change_ratio),
    currency: row.currency,
    marketTime: row.market_time ?? row.fetched_at,
    fetchedAt: row.fetched_at,
    provider: row.provider,
    delayed: true,
    simulated: row.provider === "simulated",
  };
}

async function writeCachedQuote(quote: Quote): Promise<void> {
  const db = await getDb();
  const existing = await db.get<{ fetched_at: string }>(
    `SELECT fetched_at FROM market_quotes WHERE symbol = ? AND provider = ?`,
    [quote.symbol, quote.provider],
  );

  if (existing) {
    await db.run(
      `UPDATE market_quotes SET
          price_cents = ?, previous_close_cents = ?, change_cents = ?,
          change_ratio = ?, currency = ?, market_time = ?, fetched_at = ?
        WHERE symbol = ? AND provider = ?`,
      [
        quote.priceCents,
        quote.previousCloseCents,
        quote.changeCents,
        quote.changeRatio,
        quote.currency,
        quote.marketTime,
        quote.fetchedAt,
        quote.symbol,
        quote.provider,
      ],
    );
    return;
  }

  await db.run(
    `INSERT INTO market_quotes (
        symbol, provider, price_cents, previous_close_cents, change_cents,
        change_ratio, currency, market_time, fetched_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      quote.symbol,
      quote.provider,
      quote.priceCents,
      quote.previousCloseCents,
      quote.changeCents,
      quote.changeRatio,
      quote.currency,
      quote.marketTime,
      quote.fetchedAt,
    ],
  );
}

function isFresh(fetchedAt: string, ttl: number): boolean {
  const timestamp = new Date(fetchedAt).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp < ttl;
}

/* ---------------------------------------------------------------- public */

/**
 * Quotes for a set of symbols. Cached quotes are returned instantly; only stale
 * or missing symbols hit the provider. Symbols the provider cannot price are
 * simply omitted, so one bad ticker never fails the whole page.
 */
export async function getQuotes(
  symbols: string[],
  options: { force?: boolean; credentials?: MarketCredentials } = {},
): Promise<{ quotes: Map<string, Quote>; errors: string[] }> {
  const provider = await getProvider(options.credentials);
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (unique.length === 0) return { quotes: new Map(), errors: [] };

  const quotes = new Map<string, Quote>();
  const stale: string[] = [];

  for (const symbol of unique) {
    const cached = options.force
      ? null
      : await readCachedQuote(symbol, provider.name);
    if (cached && isFresh(cached.fetchedAt, QUOTE_TTL_MS)) {
      quotes.set(symbol, cached);
    } else {
      if (cached) quotes.set(symbol, cached);
      stale.push(symbol);
    }
  }

  if (stale.length === 0) return { quotes, errors: [] };

  // Callers and the cache both speak the symbol the holding stores, so a quote
  // fetched under an exchange-qualified variant is filed under the bare symbol.
  const store = async (symbol: string, quote: Quote) => {
    const keyed = quote.symbol.toUpperCase() === symbol ? quote : { ...quote, symbol };
    quotes.set(symbol, keyed);
    await writeCachedQuote(keyed);
  };

  // One shared budget for the whole round-trip, so the page is never held
  // open by a slow exchange feed no matter how many retries happen.
  const deadline = Date.now() + QUOTE_DEADLINE_MS;
  const remaining = () => deadline - Date.now();

  let providerError: unknown = null;
  if (Date.now() < slowProviderUntil) {
    // The provider already missed its deadline for this render, so the rest of
    // the page is served from the cache instead of waiting again.
    providerError = new MarketDataError(DEADLINE_MESSAGE, {
      status: 504,
      provider: provider.name,
      retryable: false,
    });
  } else {
    try {
      const fetched = await withRetry(
        () => withinDeadline(provider.getQuotes(stale), remaining(), provider.name),
        provider.name,
      );
      for (const [symbol, quote] of fetched) await store(symbol.toUpperCase(), quote);
    } catch (error) {
      providerError = error;
      if (
        error instanceof MarketDataError &&
        error.message === DEADLINE_MESSAGE
      ) {
        slowProviderUntil = Date.now() + SLOW_PROVIDER_COOLDOWN_MS;
      }
    }
  }

  // TSX fallback: a Canadian listing does not resolve under its bare ticker,
  // so whatever the provider could not price is retried with the `.TO` suffix.
  // US-listed tickers resolve above and never reach this path.
  const unresolved = stale.filter((symbol) => !quotes.has(symbol));
  const tsxCandidates = new Map<string, string>();
  for (const symbol of unresolved) {
    const candidate = tsxLookupSymbol(symbol);
    if (candidate) tsxCandidates.set(candidate, symbol);
  }
  if (tsxCandidates.size > 0 && remaining() > 0 && !providerError) {
    try {
      const fetched = await withRetry(
        () =>
          withinDeadline(
            provider.getQuotes([...tsxCandidates.keys()]),
            remaining(),
            provider.name,
          ),
        provider.name,
      );
      for (const [candidate, quote] of fetched) {
        const symbol = tsxCandidates.get(candidate.toUpperCase());
        if (symbol) await store(symbol, quote);
      }
    } catch {
      // Neither spelling resolved; the report below covers what is still missing.
    }
  }

  if (providerError && !stale.some((symbol) => quotes.has(symbol))) {
    const message =
      providerError instanceof MarketDataError
        ? providerError.message
        : "Unable to load market data.";
    // Cached values (if any) are still returned; the caller surfaces the message.
    return { quotes, errors: [message] };
  }

  const missing = unique.filter((symbol) => !quotes.has(symbol));
  if (missing.length > 0) {
    return {
      quotes,
      errors: [`No price available for ${missing.join(", ")}.`],
    };
  }

  return { quotes, errors: [] };
}

export async function getQuote(
  symbol: string,
  credentials?: MarketCredentials,
): Promise<Quote> {
  const { quotes, errors } = await getQuotes([symbol], { credentials });
  const quote = quotes.get(symbol.toUpperCase());
  if (!quote) {
    throw new MarketDataError(errors[0] ?? "Unable to load market data.", {
      provider: activeProvider(credentials).name,
    });
  }
  return quote;
}

export async function getHistoricalPrices(
  symbol: string,
  range: HistoryRange,
  credentials?: MarketCredentials,
): Promise<{ points: PricePoint[]; provider: string; simulated: boolean }> {
  const provider = await getProvider(credentials);
  const upper = symbol.toUpperCase();

  return withRetry(async () => {
    const points = await provider.getHistoricalPrices(upper, range);
    // Cache the series so repeated chart loads avoid the provider entirely.
    try {
      const db = await getDb();
      const fetchedAt = new Date().toISOString();
      const staleAfter = new Date(Date.now() - HISTORY_TTL_MS).toISOString();
      const existing = await db.all<{ date: string }>(
        `SELECT date FROM market_history WHERE symbol = ? AND provider = ? AND date >= ?`,
        [upper, provider.name, staleAfter],
      );
      if (existing.length === 0) {
        for (const point of points) {
          await db.run(
            `INSERT INTO market_history (symbol, provider, date, close_cents)
             VALUES (?, ?, ?, ?)`,
            [upper, provider.name, point.date, point.closeCents],
          );
        }
      }
      void fetchedAt;
    } catch (error) {
      // History caching is an optimisation; never fail the request because of it.
      console.warn("[marketData] history cache write failed", error);
    }

    return { points, provider: provider.name, simulated: provider.simulated };
  }, provider.name);
}

/** Describes every provider so the Settings page can show what is wired up. */
export async function describeProviders(
  credentials?: MarketCredentials,
): Promise<ProviderHealth[]> {
  const { apiKey } = resolveCredentials(credentials);
  const { describeAlphaVantage } = await import("./providers/alphavantage");
  const { describeFinnhub } = await import("./providers/finnhub");
  const { describeYahoo } = await import("./providers/yahoo");
  const { describeMockProvider } = await import("./providers/mock");

  const health: ProviderHealth[] = [
    describeYahoo(),
    describeFinnhub(apiKey),
    describeAlphaVantage(apiKey),
    describeMockProvider(),
  ];

  const active = await getProvider(credentials);
  return health.map((entry) => ({
    ...entry,
    active: entry.name === active.name,
  }));
}

/** The provider actually in use right now (synchronous, best effort). */
export function activeProvider(credentials?: MarketCredentials): {
  name: string;
  label: string;
  simulated: boolean;
} {
  const { apiKey, requested } = resolveCredentials(credentials);
  // Yahoo is a live feed that needs no key, so it is not "simulated" the way an
  // unconfigured key-based provider is.
  if (requested === "yahoo") {
    return { name: "yahoo", label: "Yahoo Finance", simulated: false };
  }
  const simulated = requested === "mock" || !apiKey;
  return {
    name: simulated ? "simulated" : requested === "alphavantage" ? "alphavantage" : "finnhub",
    label: simulated ? "Simulated feed" : requested === "alphavantage" ? "Alpha Vantage" : "Finnhub",
    simulated,
  };
}