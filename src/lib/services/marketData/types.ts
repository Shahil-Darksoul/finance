import type { AssetType, PricePoint, Quote } from "@/lib/types";
import { CRYPTO_SYMBOLS } from "./symbols";

export type HistoryRange = "1mo" | "3mo" | "6mo" | "1y" | "3y" | "max";

export const HISTORY_RANGES: { value: HistoryRange; label: string; days: number }[] = [
  { value: "1mo", label: "1M", days: 30 },
  { value: "3mo", label: "3M", days: 91 },
  { value: "6mo", label: "6M", days: 182 },
  { value: "1y", label: "1Y", days: 365 },
  { value: "3y", label: "3Y", days: 1095 },
  { value: "max", label: "Max", days: 3650 },
];

export type ProviderHealth = {
  name: string;
  label: string;
  kind: "live" | "simulated";
  configured: boolean;
  detail: string;
  /** Set by `describeProviders` on the provider currently in use. */
  active?: boolean;
};

/** Provider selections offered in Settings. `auto` picks a live feed when a key exists. */
export const MARKET_PROVIDER_CHOICES = ["auto", "finnhub", "alphavantage", "mock"] as const;
export type MarketProviderChoice = (typeof MARKET_PROVIDER_CHOICES)[number];

export const MARKET_PROVIDER_LABELS: Record<MarketProviderChoice, string> = {
  auto: "Auto (live when a key is set)",
  finnhub: "Finnhub",
  alphavantage: "Alpha Vantage",
  mock: "Simulator (no live prices)",
};

/** What Settings needs to render the market-data panel. Never includes the key. */
export type MarketSettingsView = {
  provider: MarketProviderChoice;
  hasKey: boolean;
  /** Last four characters of the stored key, for reassurance only. */
  keyHint: string | null;
  /** True when the key came from `.env` rather than the user's saved settings. */
  fromEnv: boolean;
  providers: ProviderHealth[];
};

/**
 * The contract every market-data backend must satisfy.
 *
 * Keeping this narrow means the investment pages never know whether prices came
 * from a real exchange feed or the built-in simulator, and swapping providers is
 * a configuration change rather than a rewrite.
 */
export interface MarketDataProvider {
  readonly name: string;
  readonly label: string;
  /** False when credentials are missing, so the UI can explain why. */
  readonly configured: boolean;
  /** True for generated data that must never be presented as real quotes. */
  readonly simulated: boolean;

  getQuote(symbol: string): Promise<Quote>;
  getQuotes(symbols: string[]): Promise<Map<string, Quote>>;
  getHistoricalPrices(symbol: string, range: HistoryRange): Promise<PricePoint[]>;
}

export class MarketDataError extends Error {
  readonly status: number;
  readonly provider: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { status?: number; provider: string; retryable?: boolean } = {
      provider: "unknown",
    },
  ) {
    super(message);
    this.name = "MarketDataError";
    this.status = options.status ?? 502;
    this.provider = options.provider;
    this.retryable = options.retryable ?? true;
  }
}

/**
 * Symbols used by the demo dataset and offered as suggestions.
 *
 * Crypto is appended from the shared registry so the picker and the providers
 * can never disagree about which coins are supported.
 */
export const KNOWN_SYMBOLS: { symbol: string; name: string; assetType: AssetType }[] = [
  { symbol: "AAPL", name: "Apple Inc.", assetType: "stock" },
  { symbol: "MSFT", name: "Microsoft Corporation", assetType: "stock" },
  { symbol: "GOOGL", name: "Alphabet Inc.", assetType: "stock" },
  { symbol: "AMZN", name: "Amazon.com, Inc.", assetType: "stock" },
  { symbol: "NVDA", name: "NVIDIA Corporation", assetType: "stock" },
  { symbol: "TSLA", name: "Tesla, Inc.", assetType: "stock" },
  { symbol: "META", name: "Meta Platforms, Inc.", assetType: "stock" },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", assetType: "stock" },
  { symbol: "VTI", name: "Vanguard Total Stock Market ETF", assetType: "etf" },
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", assetType: "etf" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", assetType: "etf" },
  { symbol: "SCHD", name: "Schwab U.S. Dividend Equity ETF", assetType: "etf" },
  { symbol: "BND", name: "Vanguard Total Bond Market ETF", assetType: "bond" },
  { symbol: "IEMG", name: "iShares Core MSCI Emerging Markets ETF", assetType: "etf" },
  ...Object.entries(CRYPTO_SYMBOLS).map(([symbol, meta]) => ({
    symbol,
    name: meta.name,
    assetType: "crypto" as AssetType,
  })),
];