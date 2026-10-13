import type { PricePoint, Quote } from "@/lib/types";
import {
  type HistoryRange,
  type MarketDataProvider,
  type ProviderHealth,
  MarketDataError,
} from "../types";

import {
  alphaVantageCryptoCurrency,
  alphaVantageQuoteCurrency,
  parseSymbol,
  type ParsedSymbol,
} from "../symbols";

const BASE_URL = "https://www.alphavantage.co";

/** Free-tier requests are limited to ~1/sec, so sequential calls are spaced. */
const REQUEST_SPACING_MS = 1100;
const RATE_LIMIT_BACKOFF_MS = 1500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Alpha Vantage adapter.
 *
 * The free tier allows a handful of calls per minute, so this provider is rate
 * limited conservatively by the caching layer in `../index.ts`.
 *
 * Equities use `GLOBAL_QUOTE` / `TIME_SERIES_DAILY_ADJUSTED`. Crypto has no
 * coverage there, so coins route to `CURRENCY_EXCHANGE_RATE` /
 * `DIGITAL_CURRENCY_DAILY` instead, and only against registered base symbols.
 */
export function createAlphaVantageProvider(apiKey: string): MarketDataProvider {
  const baseUrl = process.env.MARKET_API_BASE_URL?.replace(/\/$/, "") || BASE_URL;
  const name = "alphavantage";

  const request = async (params: Record<string, string>) => {
    const url = new URL(`${baseUrl}/query`);
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("format", "json");
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: { accept: "application/json" },
    });

    if (response.status === 429) {
      throw new MarketDataError("Market data rate limit reached.", {
        status: 429,
        provider: name,
        retryable: true,
      });
    }
    if (!response.ok) {
      throw new MarketDataError("Market data is unavailable right now.", {
        status: 502,
        provider: name,
      });
    }

    const payload = (await response.json()) as Record<string, string>;
    // Alpha Vantage reports throttling under `Information`/`Note` (HTTP 200),
    // not an error status, so it must be surfaced as a retryable rate limit.
    if (payload["Error Message"] || payload["Information"] || payload["Note"]) {
      throw new MarketDataError(
        String(payload["Information"] ?? payload["Note"] ?? payload["Error Message"]),
        { status: 429, provider: name, retryable: true },
      );
    }
    return payload;
  };

  /**
   * Crypto spot rate. Alpha Vantage's exchange-rate endpoint carries no
   * previous close, so day change is reported as zero rather than guessed.
   */
  const toCryptoQuote = async (
    symbol: string,
    parsed: ParsedSymbol,
  ): Promise<Quote> => {
    const from = alphaVantageCryptoCurrency(parsed);
    if (!from || parsed.kind !== "crypto") {
      throw new MarketDataError(
        `No crypto mapping for ${symbol.toUpperCase()}. Supported coins can be entered as a bare symbol such as BTC.`,
        { status: 404, provider: name, retryable: false },
      );
    }
    const to = alphaVantageQuoteCurrency(parsed);

    const payload = await request({
      function: "CURRENCY_EXCHANGE_RATE",
      from_currency: from,
      to_currency: to,
    });
    const rate = payload["Realtime Currency Exchange Rate"] as unknown as
      | Record<string, string>
      | undefined;
    const raw = Number(rate?.["5. Exchange Rate"]);
    if (!rate || !Number.isFinite(raw) || raw <= 0) {
      throw new MarketDataError(`No quote available for ${symbol.toUpperCase()}.`, {
        status: 404,
        provider: name,
        retryable: false,
      });
    }

    const priceCents = Math.round(raw * 100);
    const fetchedAt = new Date().toISOString();

    return {
      symbol: symbol.toUpperCase(),
      priceCents,
      previousCloseCents: priceCents,
      changeCents: 0,
      changeRatio: 0,
      currency: to,
      marketTime: rate["7. Last Refreshed"]
        ? new Date(rate["7. Last Refreshed"].replace(" ", "T") + "Z").toISOString()
        : fetchedAt,
      fetchedAt,
      provider: name,
      // Realtime endpoint, but the free tier is throttled and may serve a
      // cached rate, so it is never presented as guaranteed live.
      delayed: true,
      simulated: false,
    };
  };

  return {
    name,
    label: "Alpha Vantage",
    configured: true,
    simulated: false,

    async getQuote(symbol: string) {
      const parsed = parseSymbol(symbol);
      if (parsed.kind === "crypto") {
        return toCryptoQuote(symbol, parsed);
      }

      const payload = await request({ function: "GLOBAL_QUOTE", symbol: parsed.symbol });
      const quote = payload["Global Quote"] as unknown as Record<string, string> | undefined;
      if (!quote || !quote["05. price"]) {
        throw new MarketDataError(`No quote available for ${parsed.symbol}.`, {
          status: 404,
          provider: name,
          retryable: false,
        });
      }

      const priceCents = Math.round(Number(quote["05. price"]) * 100);
      const previousCloseCents = Math.round(Number(quote["08. previous close"]) * 100);
      const changeCents = priceCents - previousCloseCents;
      const fetchedAt = new Date().toISOString();

      return {
        symbol: symbol.toUpperCase(),
        priceCents,
        previousCloseCents,
        changeCents,
        changeRatio: previousCloseCents === 0 ? 0 : changeCents / previousCloseCents,
        currency: "USD",
        marketTime: quote["07. latest trading day"]
          ? new Date(`${quote["07. latest trading day"]}T20:00:00Z`).toISOString()
          : fetchedAt,
        fetchedAt,
        provider: name,
        delayed: true,
        simulated: false,
      };
    },

    async getQuotes(symbols: string[]) {
      const map = new Map<string, Quote>();
      const unique = [
        ...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)),
      ];
      // The free tier has no batch endpoint and allows roughly one request per
      // second, so calls are sequential and spaced out; a throttled symbol is
      // retried once after a short backoff.
      for (let index = 0; index < unique.length; index += 1) {
        if (index > 0) await sleep(REQUEST_SPACING_MS);
        const symbol = unique[index];
        try {
          map.set(symbol, await this.getQuote(symbol));
        } catch (error) {
          if (error instanceof MarketDataError && error.retryable) {
            await sleep(RATE_LIMIT_BACKOFF_MS);
            try {
              map.set(symbol, await this.getQuote(symbol));
            } catch {
              /* skip symbols without coverage */
            }
          }
          /* skip symbols without coverage */
        }
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

      if (parsed.kind === "crypto") {
        const currency = alphaVantageCryptoCurrency(parsed);
        if (!currency) {
          throw new MarketDataError(
            `No price history for ${symbol.toUpperCase()}.`,
            { status: 404, provider: name, retryable: false },
          );
        }
        const payload = await request({
          function: "DIGITAL_CURRENCY_DAILY",
          symbol: currency,
          market: alphaVantageQuoteCurrency(parsed),
        });
        const cryptoSeries = payload["Time Series (Digital Currency Daily)"] as unknown as
          | Record<string, Record<string, string>>
          | undefined;
        if (!cryptoSeries || Object.keys(cryptoSeries).length === 0) {
          throw new MarketDataError(`No price history for ${symbol.toUpperCase()}.`, {
            status: 404,
            provider: name,
            retryable: false,
          });
        }
        return Object.entries(cryptoSeries)
          .map(([date, values]) => ({
            date,
            closeCents: Math.round(Number(values["4a. close (USD)"] ?? values["4a. close"]) * 100),
          }))
          .sort((a, b) => a.date.localeCompare(b.date));
      }

      const outputSize = range === "1mo" ? "compact" : "full";
      const payload = await request({
        function: "TIME_SERIES_DAILY_ADJUSTED",
        symbol: parsed.symbol,
        outputsize: outputSize,
      });
      const series = payload["Time Series (Daily)"] as unknown as
        | Record<string, Record<string, string>>
        | undefined;
      if (!series || Object.keys(series).length === 0) {
        throw new MarketDataError(`No price history for ${parsed.symbol}.`, {
          status: 404,
          provider: name,
          retryable: false,
        });
      }

      const points: PricePoint[] = Object.entries(series)
        .map(([date, values]) => ({
          date,
          closeCents: Math.round(Number(values["5. adjusted close"] ?? values["4. close"]) * 100),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      return points;
    },
  };
}

export function describeAlphaVantage(apiKey?: string): ProviderHealth {
  return {
    name: "alphavantage",
    label: "Alpha Vantage",
    kind: "live",
    configured: Boolean(apiKey),
    detail: apiKey
      ? "Live quotes via Alpha Vantage. Free tier is rate limited and end-of-day delayed."
      : "Set MARKET_API_KEY to enable live quotes.",
  };
}