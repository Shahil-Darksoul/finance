/**
 * Symbol parsing shared by every market-data provider.
 *
 * The app stores what the user typed, so a holding can be `AAPL`, `BTC`, or an
 * explicit exchange pair like `BINANCE:BTCUSDT`. Each provider then maps that
 * onto its own vocabulary:
 *
 *   equity  `AAPL`      Finnhub `/quote`            Alpha Vantage `GLOBAL_QUOTE`
 *   crypto  `BTC`       Finnhub `/crypto/price`     Alpha Vantage `CURRENCY_EXCHANGE_RATE`
 *   crypto  `BINANCE:BTCUSDT`  passed through verbatim to Finnhub
 *
 * Routing is registry-driven rather than inferred from the string shape: an
 * unknown bare ticker is always treated as an equity, because guessing that
 * `XYZ` is a coin would send equity requests to a crypto endpoint and return a
 * misleading failure. Crypto that is not in the registry can still be priced by
 * entering the exchange-qualified pair directly.
 */

/** Canonical base symbols we know how to price as crypto. */
export const CRYPTO_SYMBOLS: Record<
  string,
  { name: string; finnhub: string; alphavantage: string }
> = {
  BTC: { name: "Bitcoin", finnhub: "BINANCE:BTCUSDT", alphavantage: "BTC" },
  ETH: { name: "Ethereum", finnhub: "BINANCE:ETHUSDT", alphavantage: "ETH" },
  SOL: { name: "Solana", finnhub: "BINANCE:SOLUSDT", alphavantage: "SOL" },
  XRP: { name: "XRP", finnhub: "BINANCE:XRPUSDT", alphavantage: "XRP" },
  BNB: { name: "BNB", finnhub: "BINANCE:BNBUSDT", alphavantage: "BNB" },
  DOGE: { name: "Dogecoin", finnhub: "BINANCE:DOGEUSDT", alphavantage: "DOGE" },
  ADA: { name: "Cardano", finnhub: "BINANCE:ADAUSDT", alphavantage: "ADA" },
  AVAX: { name: "Avalanche", finnhub: "BINANCE:AVAXUSDT", alphavantage: "AVAX" },
  DOT: { name: "Polkadot", finnhub: "BINANCE:DOTUSDT", alphavantage: "DOT" },
  LINK: { name: "Chainlink", finnhub: "BINANCE:LINKUSDT", alphavantage: "LINK" },
  MATIC: { name: "Polygon", finnhub: "BINANCE:MATICUSDT", alphavantage: "MATIC" },
  LTC: { name: "Litecoin", finnhub: "BINANCE:LTCUSDT", alphavantage: "LTC" },
  BCH: { name: "Bitcoin Cash", finnhub: "BINANCE:BCHUSDT", alphavantage: "BCH" },
  ATOM: { name: "Cosmos", finnhub: "BINANCE:ATOMUSDT", alphavantage: "ATOM" },
  UNI: { name: "Uniswap", finnhub: "BINANCE:UNIUSDT", alphavantage: "UNI" },
};

/** Quote currencies accepted in a `BASE-QUOTE` pair, e.g. `ETH-BTC`. */
const KNOWN_QUOTE_CURRENCIES = new Set([
  "USD",
  "USDT",
  "USDC",
  "BTC",
  "ETH",
  "EUR",
  "GBP",
  "JPY",
]);

export type ParsedSymbol =
  | { kind: "equity"; symbol: string }
  | { kind: "crypto"; base: string; quote: string };

/**
 * Classify a stored symbol.
 *
 * Three crypto forms are recognised: a bare registered base (`BTC`), an
 * exchange-qualified pair (`BINANCE:BTCUSDT`), and a hyphenated pair
 * (`ETH-BTC`). Anything else is an equity.
 */
export function parseSymbol(raw: string): ParsedSymbol {
  const symbol = raw.trim().toUpperCase();
  if (!symbol) return { kind: "equity", symbol };

  // Exchange-qualified: EXCHANGE:PAIR, passed through to the provider as-is.
  const exchangeSeparator = symbol.indexOf(":");
  if (exchangeSeparator > 0) {
    const exchange = symbol.slice(0, exchangeSeparator);
    const pair = symbol.slice(exchangeSeparator + 1);
    if (/^[A-Z0-9_]+$/.test(exchange) && /^[A-Z0-9]+$/.test(pair)) {
      const base = stripQuoteSuffix(pair, "USDT");
      return { kind: "crypto", base, quote: "USDT" };
    }
  }

  // Hyphenated pair: BASE-QUOTE.
  const hyphen = symbol.lastIndexOf("-");
  if (hyphen > 0) {
    const base = symbol.slice(0, hyphen);
    const quote = symbol.slice(hyphen + 1);
    if (KNOWN_QUOTE_CURRENCIES.has(quote)) {
      return { kind: "crypto", base, quote };
    }
  }

  if (CRYPTO_SYMBOLS[symbol]) {
    return { kind: "crypto", base: symbol, quote: "USD" };
  }

  return { kind: "equity", symbol };
}

export function isCryptoSymbol(raw: string): boolean {
  return parseSymbol(raw).kind === "crypto";
}

/** Asset types that trade on an exchange like an equity. */
const EQUITY_ASSET_TYPES = new Set(["stock", "etf", "mutual_fund", "bond"]);

/**
 * The symbol to ask a market-data provider for.
 *
 * Holdings store the ticker the user typed (`VFV`), but a TSX-listed security
 * only resolves when addressed with an exchange suffix (`VFV.TO`). Currency is
 * the honest signal we already have: a Canadian-dollar equity is TSX-listed, so
 * it is qualified here without changing what the user sees or what we store.
 * Anything already qualified (a `.TO`, `.V`, `BINANCE:` pair, etc.) is left
 * alone, and non-equities (crypto) are never suffixed.
 */
export function quoteLookupSymbol(input: {
  symbol: string;
  currency: string;
  assetType: string;
}): string {
  const symbol = input.symbol.trim().toUpperCase();
  if (!symbol || symbol.includes(".") || symbol.includes(":")) return symbol;
  const isEquity = EQUITY_ASSET_TYPES.has(input.assetType);
  return isEquity && input.currency.trim().toUpperCase() === "CAD"
    ? `${symbol}.TO`
    : symbol;
}

/** Drop a trailing quote asset, so `BTCUSDT` becomes `BTC`. */
function stripQuoteSuffix(pair: string, suffix: string): string {
  if (pair.length > suffix.length && pair.endsWith(suffix)) {
    return pair.slice(0, -suffix.length);
  }
  return pair;
}

/** Finnhub crypto pair for a parsed symbol, or null if we cannot map it. */
export function finnhubCryptoPair(symbol: ParsedSymbol): string | null {
  if (symbol.kind !== "crypto") return null;

  const original = symbol.base;
  // Preserve a fully-qualified symbol exactly as the user typed it.
  const raw = original.includes(":") ? original : undefined;
  if (raw) return raw;

  const entry = CRYPTO_SYMBOLS[original];
  if (entry) {
    if (symbol.quote === "USD") return entry.finnhub;
    // Non-USD pairs are spelled by hand as EXCHANGE:BASEQUOTE.
    return `BINANCE:${original}${symbol.quote}`;
  }

  const upperQuote = symbol.quote.toUpperCase();
  if (KNOWN_QUOTE_CURRENCIES.has(upperQuote)) {
    return `BINANCE:${original}${upperQuote}`;
  }
  return null;
}

/** Alpha Vantage base currency for a parsed symbol, or null if unmappable. */
export function alphaVantageCryptoCurrency(symbol: ParsedSymbol): string | null {
  if (symbol.kind !== "crypto") return null;
  if (symbol.base.includes(":")) return null; // Finnhub-only syntax

  const entry = CRYPTO_SYMBOLS[symbol.base];
  if (entry) return entry.alphavantage;
  return null;
}

/**
 * Quote currency for a crypto holding.
 *
 * Alpha Vantage only indexes fiat pairs on the free tier, so an unknown base
 * paired with a fiat quote falls back to USD rather than requesting a pair that
 * will not resolve.
 */
export function alphaVantageQuoteCurrency(symbol: ParsedSymbol): string {
  if (symbol.kind !== "crypto") return "USD";
  const quote = symbol.quote.toUpperCase();
  return KNOWN_QUOTE_CURRENCIES.has(quote) && quote !== "USDT" && quote !== "USDC"
    ? quote
    : "USD";
}