import type { PricePoint, Quote } from "@/lib/types";
import {
  type HistoryRange,
  type MarketDataProvider,
  type ProviderHealth,
  MarketDataError,
} from "../types";
import { finnhubCryptoPair, parseSymbol } from "../symbols";

/**
 * Finnhub adapter (https://finnhub.io).
 *
 * The key is read from `MARKET_API_KEY` on the server only and is never sent to
 * the browser: all calls happen inside Route Handlers via this module.
 */
export function createFinnhubProvider(apiKey: string): MarketDataProvider {
  const baseUrl =
    process.env.MARKET_API_BASE_URL?.replace(/\/$/, "") || "https://finnhub.io/api/v1";
  const name = "finnhub";

  const request = async <T>(path: string, params: Record<string, string>) => {
    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set("token", apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      // Quotes are cached in the database layer; avoid re-fetching per render.
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "application/json" },
    });

    if (response.status === 429) {
      throw new MarketDataError("Market data rate limit reached.", {
        status: 429,
        provider: name,
        retryable: true,
      });
    }
    if (response.status === 401 || response.status === 403) {
      throw new MarketDataError("Market data credentials were rejected.", {
        status: response.status,
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
    return (await response.json()) as T;
  };

  const toQuote = (symbol: string, payload: { c?: number; pc?: number; t?: number }): Quote => {
    const priceCents = Math.round(Number(payload.c ?? 0) * 100);
    const previousCloseCents = Math.round(Number(payload.pc ?? 0) * 100);
    const changeCents = priceCents - previousCloseCents;
    const fetchedAt = new Date().toISOString();
    return {
      symbol: symbol.toUpperCase(),
      priceCents,
      previousCloseCents,
      changeCents,
      changeRatio: previousCloseCents === 0 ? 0 : changeCents / previousCloseCents,
      currency: "USD",
      marketTime: payload.t ? new Date(payload.t * 1000).toISOString() : fetchedAt,
      fetchedAt,
      provider: name,
      // Finnhub free tier is end-of-day delayed.
      delayed: true,
      simulated: false,
    };
  };

  /**
   * Crypto prices come from `/crypto/price`, which has no previous-close
   * field. A single `/crypto/candle` request supplies both the latest and prior
   * close, so the quote reports a real day change instead of a fabricated one.
   */
  const toCryptoQuote = async (
    symbol: string,
    pair: string,
  ): Promise<Quote> => {
    const now = Math.floor(Date.now() / 1000);
    const payload = await request<{ s?: string; t?: number[]; c?: number[] }>(
      "/crypto/candle",
      {
        symbol: pair,
        resolution: "D",
        from: String(now - 5 * 86_400),
        to: String(now),
      },
    );

    const closes = (payload.c ?? []).map(Number).filter((value) => value > 0);
    if (closes.length === 0 || payload.s === "error") {
      throw new MarketDataError(`No quote available for ${symbol}.`, {
        status: 404,
        provider: name,
        retryable: false,
      });
    }

    const priceCents = Math.round(closes[closes.length - 1] * 100);
    // A single candle cannot express a day change; treat it as unchanged rather
    // than inventing a comparison against itself.
    const previousCloseCents =
      closes.length > 1 ? Math.round(closes[closes.length - 2] * 100) : priceCents;
    const changeCents = priceCents - previousCloseCents;
    const fetchedAt = new Date().toISOString();
    const stamps = payload.t ?? [];

    return {
      symbol: symbol.toUpperCase(),
      priceCents,
      previousCloseCents,
      changeCents,
      changeRatio: previousCloseCents === 0 ? 0 : changeCents / previousCloseCents,
      currency: "USD",
      marketTime: stamps.length
        ? new Date(stamps[stamps.length - 1] * 1000).toISOString()
        : fetchedAt,
      fetchedAt,
      provider: name,
      // Free tier crypto candles are delayed, and crypto trades 24/7 so the
      // "trading day" framing of equities does not apply.
      delayed: true,
      simulated: false,
    };
  };

  const fetchQuote = async (symbol: string): Promise<Quote> => {
    const parsed = parseSymbol(symbol);

    if (parsed.kind === "crypto") {
      const pair = finnhubCryptoPair(parsed);
      if (!pair) {
        throw new MarketDataError(
          `No crypto price mapping for ${symbol.toUpperCase()}. Try an exchange pair such as BINANCE:BTCUSDT.`,
          { status: 404, provider: name, retryable: false },
        );
      }
      return toCryptoQuote(symbol, pair);
    }

    const payload = await request<{ c?: number; pc?: number; t?: number }>("/quote", {
      symbol: parsed.symbol,
    });
    if (!payload.c) {
      throw new MarketDataError(`No quote available for ${parsed.symbol}.`, {
        status: 404,
        provider: name,
        retryable: false,
      });
    }
    return toQuote(symbol, payload);
  };

  return {
    name,
    label: "Finnhub",
    configured: true,
    simulated: false,

    async getQuote(symbol: string) {
      return fetchQuote(symbol);
    },

    async getQuotes(symbols: string[]) {
      // Finnhub's quote endpoint takes a single symbol, so requests are issued
      // concurrently and partial failures are tolerated.
      const entries = await Promise.allSettled(
        symbols.map(async (symbol) => [symbol.toUpperCase(), await this.getQuote(symbol)] as const),
      );
      const map = new Map<string, Quote>();
      for (const entry of entries) {
        if (entry.status === "fulfilled") map.set(entry.value[0], entry.value[1]);
      }
      if (map.size === 0 && symbols.length > 0) {
        throw new MarketDataError("No quotes could be retrieved.", {
          status: 502,
          provider: name,
        });
      }
      return map;
    },

    async getHistoricalPrices(symbol: string, range: HistoryRange) {
      const parsed = parseSymbol(symbol);
      const isCrypto = parsed.kind === "crypto";
      const to = Math.floor(Date.now() / 1000);
      const from = Math.floor((Date.now() - 365 * 86_400_000 * 4) / 1000);

      // Crypto has no intraday candles on the free tier, so it always uses daily.
      const endpoint = isCrypto ? "/crypto/candle" : "/stock/candle";
      const providerSymbol = isCrypto ? finnhubCryptoPair(parsed) : parsed.symbol;
      if (!providerSymbol) {
        throw new MarketDataError(
          `No price history for ${symbol.toUpperCase()}.`,
          { status: 404, provider: name, retryable: false },
        );
      }

      const payload = await request<{
        s?: string;
        t?: number[];
        c?: number[];
      }>(endpoint, {
        symbol: providerSymbol,
        resolution: isCrypto ? "D" : range === "1mo" || range === "3mo" ? "30" : "D",
        from: String(from),
        to: String(to),
      });

      const times = payload.t ?? [];
      const closes = payload.c ?? [];
      if (times.length === 0 || payload.s === "error") {
        throw new MarketDataError(`No price history for ${symbol.toUpperCase()}.`, {
          status: 404,
          provider: name,
          retryable: false,
        });
      }

      const points: PricePoint[] = times.map((seconds, index) => ({
        date: new Date(seconds * 1000).toISOString().slice(0, 10),
        closeCents: Math.round(Number(closes[index] ?? 0) * 100),
      }));
      return points;
    },
  };
}

export function describeFinnhub(apiKey?: string): ProviderHealth {
  return {
    name: "finnhub",
    label: "Finnhub",
    kind: "live",
    configured: Boolean(apiKey),
    detail: apiKey
      ? "Live quotes via Finnhub. Free tier data is end-of-day delayed."
      : "Set MARKET_API_KEY to enable live quotes.",
  };
}