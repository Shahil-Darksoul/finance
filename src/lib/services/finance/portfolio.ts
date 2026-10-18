import { listInvestments } from "@/lib/repo/investments";
import { getUserMarketSettings } from "@/lib/repo/user-settings";
import { getUserById } from "@/lib/repo/users";
import { getQuotes, activeProvider } from "../marketData";
import { safeDivide } from "@/lib/utils/money";
import { DEFAULT_CURRENCY } from "@/lib/utils/currency";
import type { Holding, Investment, PortfolioSummary } from "@/lib/types";

/**
 * Holdings + portfolio valuation.
 *
 * Market values come from the market-data service, which may be the simulator
 * when no API key is configured. `simulated` is threaded all the way to the UI
 * so simulated prices are always displayed with that caveat.
 *
 * The app is single-currency: every holding is recorded in CAD and the totals
 * are the plain sum of all positions.
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
  const currency = user?.currency ?? DEFAULT_CURRENCY;

  if (investments.length === 0) {
    return {
      holdings: [],
      summary: emptySummary(currency),
      errors: [],
    };
  }

  // Providers need exchange-qualified tickers for some listings (e.g. TSX
  // `VFV.TO`); the holding keeps the bare symbol the user typed and the market
  // data layer falls back to the exchange suffix when the bare symbol misses.
  const lookup = (investment: Investment) => investment.symbol.trim().toUpperCase();

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

  const totalValue = holdings.reduce((sum, row) => sum + row.marketValueCents, 0);
  for (const row of holdings) {
    row.allocationRatio = safeDivide(row.marketValueCents, totalValue);
  }

  const invested = holdings.reduce((sum, row) => sum + row.costBasisCents, 0);
  const dayChange = holdings.reduce((sum, row) => sum + row.dayChangeCents, 0);

  const totalGain = totalValue - invested;
  const previousValue = totalValue - dayChange;
  const provider = activeProvider(credentials);
  const anySimulated = holdings.some((row) => row.simulated);

  return {
    holdings,
    summary: {
      currency,
      totalValueCents: totalValue,
      investedCents: invested,
      totalGainCents: totalGain,
      totalGainRatio: safeDivide(totalGain, invested),
      dayChangeCents: dayChange,
      dayChangeRatio: safeDivide(dayChange, Math.abs(previousValue)),
      holdingsCount: holdings.length,
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
