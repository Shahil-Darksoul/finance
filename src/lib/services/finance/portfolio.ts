import { listInvestments } from "@/lib/repo/investments";
import { getUserMarketSettings } from "@/lib/repo/user-settings";
import { getUserById } from "@/lib/repo/users";
import { getQuotes, activeProvider } from "../marketData";
import { quoteLookupSymbol } from "../marketData/symbols";
import { safeDivide } from "@/lib/utils/money";
import type { CurrencySubtotal, Holding, Investment, PortfolioSummary } from "@/lib/types";

/**
 * Holdings + portfolio valuation.
 *
 * Market values come from the market-data service, which may be the simulator
 * when no API key is configured. `simulated` is threaded all the way to the UI
 * so simulated prices are always displayed with that caveat.
 *
 * Holdings keep their own currency and are never converted. The summary totals
 * are therefore the subtotal for the account's primary currency, with any other
 * currencies listed separately in `otherCurrencyTotals`.
 */
export async function getHoldings(userId: string): Promise<{
  holdings: Holding[];
  summary: PortfolioSummary;
  errors: string[];
}> {
  const [investments, credentials, user] = await Promise.all([
    listInvestments(userId),
    getUserMarketSettings(userId),
    getUserById(userId),
  ]);
  const primaryCurrency = user?.currency ?? "USD";

  if (investments.length === 0) {
    return {
      holdings: [],
      summary: emptySummary(primaryCurrency),
      errors: [],
    };
  }

  // Providers need exchange-qualified tickers for some listings (e.g. TSX
  // `VFV.TO`); the holding keeps the bare symbol the user typed.
  const lookup = (investment: Investment) =>
    quoteLookupSymbol({
      symbol: investment.symbol,
      currency: investment.currency,
      assetType: investment.assetType,
    });

  const { quotes, errors } = await getQuotes(
    investments.map((investment) => lookup(investment)),
    { credentials },
  );

  const holdings: Holding[] = investments.map((investment) => {
    const quote = quotes.get(lookup(investment)) ?? null;
    const priceCents = quote?.priceCents ?? investment.avgCostCents;
    const quantity = investment.quantity;

    // Fall back to cost basis when no quote is available so the portfolio still
    // adds up, and mark it so the UI can say prices are unavailable.
    const marketValueCents = Math.round(priceCents * quantity);
    const costBasisCents = Math.round(investment.avgCostCents * quantity);
    const unrealizedGainCents = marketValueCents - costBasisCents;
    const dayChangeCents = quote ? Math.round(quote.changeCents * quantity) : 0;

    return {
      investment,
      quote,
      marketValueCents,
      costBasisCents,
      unrealizedGainCents,
      unrealizedGainRatio: safeDivide(unrealizedGainCents, costBasisCents),
      dayChangeCents,
      dayChangeRatio: quote ? quote.changeRatio : 0,
      allocationRatio: 0,
      simulated: quote?.simulated ?? true,
    };
  });

  // Allocation is relative to holdings in the same currency, so a CAD position
  // is never shown as a fraction of a USD total.
  const valueByCurrency = new Map<string, number>();
  for (const row of holdings) {
    const currency = row.investment.currency;
    valueByCurrency.set(
      currency,
      (valueByCurrency.get(currency) ?? 0) + row.marketValueCents,
    );
  }
  for (const row of holdings) {
    const currencyTotal = valueByCurrency.get(row.investment.currency) ?? 0;
    row.allocationRatio = safeDivide(row.marketValueCents, currencyTotal);
  }

  const groups = new Map<
    string,
    { value: number; invested: number; dayChange: number }
  >();
  for (const row of holdings) {
    const currency = row.investment.currency;
    const group = groups.get(currency) ?? { value: 0, invested: 0, dayChange: 0 };
    group.value += row.marketValueCents;
    group.invested += row.costBasisCents;
    group.dayChange += row.dayChangeCents;
    groups.set(currency, group);
  }

  const primary = groups.get(primaryCurrency) ?? {
    value: 0,
    invested: 0,
    dayChange: 0,
  };
  const otherCurrencyTotals: CurrencySubtotal[] = [...groups.entries()]
    .filter(([currency]) => currency !== primaryCurrency)
    .map(([currency, group]) => ({
      currency,
      valueCents: group.value,
      investedCents: group.invested,
      gainCents: group.value - group.invested,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  const totalGain = primary.value - primary.invested;
  const previousValue = primary.value - primary.dayChange;
  const provider = activeProvider(credentials);
  const anySimulated = holdings.some((row) => row.simulated);

  return {
    holdings,
    summary: {
      currency: primaryCurrency,
      totalValueCents: primary.value,
      investedCents: primary.invested,
      totalGainCents: totalGain,
      totalGainRatio: safeDivide(totalGain, primary.invested),
      dayChangeCents: primary.dayChange,
      dayChangeRatio: safeDivide(primary.dayChange, Math.abs(previousValue)),
      holdingsCount: holdings.length,
      otherCurrencyTotals,
      asOf: new Date().toISOString(),
      simulated: anySimulated,
      provider: provider.name,
    },
    errors,
  };
}

export async function getPortfolioSummary(userId: string): Promise<PortfolioSummary> {
  const { summary } = await getHoldings(userId);
  return summary;
}

function emptySummary(currency: string): PortfolioSummary {
  return {
    currency,
    totalValueCents: 0,
    investedCents: 0,
    totalGainCents: 0,
    totalGainRatio: 0,
    dayChangeCents: 0,
    dayChangeRatio: 0,
    holdingsCount: 0,
    otherCurrencyTotals: [],
    asOf: new Date().toISOString(),
    simulated: true,
    provider: null,
  };
}

/** Human "as of" label that never claims real-time data. */
export function marketTimestampLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Last updated: unknown";
  return `Last updated: ${date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  })}`;
}
