import type { PricePoint, Quote } from "@/lib/types";
import {
  type HistoryRange,
  type MarketDataProvider,
  type ProviderHealth,
  MarketDataError,
} from "../types";
import { parseSymbol, yahooSymbol } from "../symbols";

const BASE_URL = "https://query1.finance.yahoo.com";

/**
 * Yahoo Finance adapter (unofficial, keyless).
 *
 * Yahoo publishes no API contract; this uses the same `chart` endpoint the
 * website itself calls. It needs no API key and, unlike Finnhub's free tier, it
 * covers Canadian (`.TO`) listings — which is the reason it exists here.
 *
 * A single endpoint is used deliberately: one `chart` response carries the
 * latest price, the previous close, the traded currency and the daily series,
 * so quotes and history share one code path instead of two vocabularies.
 */

type YahooChartResult = {
  meta?: {
    currency?: string;
    symbol?: string;
    regularMarketPrice?: number;
    chartPreviousClose?: number;
    previousClose?: number;
    regularMarketTime?: number;
  };
  timestamp?: number[];
  indicators?: {
    quote?: { close?: (number | null)[] }[];
    adjclose?: { adjclose?: (number | null)[] }[];
  };
};

type YahooChartPayload = {
  chart?: {
    result?: YahooChartResult[] | null;
    error?: { code?: string; description?: string } | null;
  };
};

/** Days of history per range; `max` is handled by Yahoo's own `range=max`. */
const RANGE_DAYS: Record<HistoryRange, number> = {
  "1mo": 30,
  "3mo": 91,
  "6mo": 182,
  "1y": 365,
  "3y": 1095,
  max: 0,
};

/** Yahoo rate-limits bursts, so batch symbols in small concurrent groups. */
const QUOTE_CONCURRENCY = 5;

export function createYahooProvider(): MarketDataProvider {
  const baseUrl = process.env.MARKET_API_BASE_URL?.replace(/\/$/, "") || BASE_URL;
  const name = "yahoo";

  const request = async (
    symbol: string,
    params: Record<string, string>,
  ): Promise<YahooChartResult> => {
    const url = new URL(`${baseUrl}/v8/finance/chart/${encodeURIComponent(symbol)}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      // Quotes are cached in the database layer; avoid re-fetching per render.
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: {
        accept: "application/json",
        // Yahoo rejects some requests outright without a browser-like header.
        "user-agent": "Mozilla/5.0 (compatible; Ledgerly/1.0)",
      },
    });

    if (response.status === 429) {
      throw new MarketDataError("Market data rate limit reached.", {
        status: 429,
        provider: name,
        retryable: true,
      });
    }
    if (response.status === 404) {
      throw new MarketDataError(`No data available for ${symbol.toUpperCase()}.`, {
        status: 404,
        provider: name,
        retryable: false,
      });
    }
    if (!response.ok) {
      throw new MarketDataError("Market data is unavailable right now.", {
        status: 502,
        provider: name,
        retryable: true,
      });
    }

    const payload = (await response.json()) as YahooChartPayload;
    const result = payload.chart?.result?.[0];
    // Unknown or delisted tickers surface as `chart.error` with an HTTP 200,
    // so the body must be checked rather than relying on the status alone.
    if (payload.chart?.error || !result) {
      throw new MarketDataError(
        `No quote available for ${symbol.toUpperCase()}.`,
        { status: 404, provider: name, retryable: false },
      );
    }
    return result;
  };

  const toQuote = (input: string, result: YahooChartResult): Quote => {
    const meta = result.meta ?? {};
    const price = Number(meta.regularMarketPrice);
    if (!Number.isFinite(price) || price <= 0) {
      throw new MarketDataError(`No quote available for ${input.toUpperCase()}.`, {
        status: 404,
        provider: name,
        retryable: false,
      });
    }

    const previous = Number(meta.previousClose ?? meta.chartPreviousClose);
    const priceCents = Math.round(price * 100);
    const previousCloseCents =
      Number.isFinite(previous) && previous > 0 ? Math.round(previous * 100) : priceCents;
    const changeCents = priceCents - previousCloseCents;
    const fetchedAt = new Date().toISOString();

    return {
      symbol: input.toUpperCase(),
      priceCents,
      previousCloseCents,
      changeCents,
      changeRatio: previousCloseCents === 0 ? 0 : changeCents / previousCloseCents,
      // Yahoo reports the traded currency, so a TSX holding stays in CAD
      // rather than being mislabelled as USD.
      currency: (meta.currency ?? "USD").toUpperCase(),
      marketTime: meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : fetchedAt,
      fetchedAt,
      provider: name,
      // Yahoo's feed (especially TSX) can be delayed, so never claim real-time.
      delayed: true,
      simulated: false,
    };
  };

  const fetchQuote = async (input: string): Promise<Quote> => {
    const parsed = parseSymbol(input);
    const providerSymbol = yahooSymbol(parsed);
    if (!providerSymbol) {
      throw new MarketDataError(`No quote available for ${input.toUpperCase()}.`, {
        status: 404,
        provider: name,
        retryable: false,
      });
    }
    // A short window is enough for the latest trade and its prior close.
    const result = await request(providerSymbol, { interval: "1d", range: "5d" });
    return toQuote(input, result);
  };

  return {
    name,
    label: "Yahoo Finance",
    configured: true,
    simulated: false,

    async getQuote(symbol: string) {
      return fetchQuote(symbol);
    },

    async getQuotes(symbols: string[]) {
      const unique = [
        ...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)),
      ];
      const map = new Map<string, Quote>();

      for (let index = 0; index < unique.length; index += QUOTE_CONCURRENCY) {
        const chunk = unique.slice(index, index + QUOTE_CONCURRENCY);
        const settled = await Promise.allSettled(
          chunk.map(async (symbol) => [symbol, await fetchQuote(symbol)] as const),
        );
        for (const entry of settled) {
          if (entry.status === "fulfilled") map.set(entry.value[0], entry.value[1]);
        }
      }

      if (map.size === 0 && unique.length > 0) {
        throw new MarketDataError("No quotes could be retrieved.", {
          status: 502,
          provider: name,
        });
      }
      return map;
    },

    async getHistoricalPrices(symbol: string, range: HistoryRange) {
      const parsed = parseSymbol(symbol);
      const providerSymbol = yahooSymbol(parsed);
      if (!providerSymbol) {
        throw new MarketDataError(`No price history for ${symbol.toUpperCase()}.`, {
          status: 404,
          provider: name,
          retryable: false,
        });
      }

      // `range=max` has no fixed day count, so Yahoo's own keyword is used;
      // every other range is expressed as an explicit window.
      const days = RANGE_DAYS[range];
      const params: Record<string, string> =
        days > 0
          ? {
              interval: "1d",
              period1: String(Math.floor(Date.now() / 1000) - days * 86_400),
              period2: String(Math.floor(Date.now() / 1000)),
            }
          : { interval: "1d", range: "max" };

      const result = await request(providerSymbol, params);
      const times = result.timestamp ?? [];
      // Adjusted closes account for splits and dividends; fall back to raw
      // closes when Yahoo omits the adjusted series.
      const adjusted = result.indicators?.adjclose?.[0]?.adjclose;
      const closes =
        adjusted && adjusted.length
          ? adjusted
          : (result.indicators?.quote?.[0]?.close ?? []);

      const points: PricePoint[] = [];
      for (let index = 0; index < times.length; index += 1) {
        const close = closes[index];
        if (typeof close !== "number" || !Number.isFinite(close)) continue;
        points.push({
          date: new Date(times[index] * 1000).toISOString().slice(0, 10),
          closeCents: Math.round(close * 100),
        });
      }

      if (points.length === 0) {
        throw new MarketDataError(`No price history for ${symbol.toUpperCase()}.`, {
          status: 404,
          provider: name,
          retryable: false,
        });
      }
      return points;
    },
  };
}

export function describeYahoo(): ProviderHealth {
  return {
    name: "yahoo",
    label: "Yahoo Finance",
    kind: "live",
    configured: true,
    detail:
      "No key required. Covers US and Canadian listings. Unofficial feed, so quotes are delayed.",
  };
}
