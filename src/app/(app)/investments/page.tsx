import { requireUser } from "@/lib/auth/guard";
import { getHoldings, marketTimestampLabel } from "@/lib/services/finance/portfolio";
import { Card, CardBody, CardHeader, EmptyState, Badge } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { TrendingUp, Plus } from "lucide-react";
import Link from "next/link";
import { formatMoney, formatPercent } from "@/lib/utils/money";
import { resolveDisplay, convertCurrencyToDisplay } from "@/lib/services/finance/currency";
import { listAccounts } from "@/lib/repo/accounts";
import { EditInvestmentDialog } from "@/components/app/edit-investment-dialog";
import { DeleteInvestmentButton } from "@/components/app/delete-investment-button";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  const user = await requireUser();
  const { holdings, summary, errors } = await getHoldings(user.id);
  const accounts = await listAccounts(user.id);
  const display = await resolveDisplay(user.currency, user.id);

  // convertCurrencyToDisplay already yields display-currency cents, so these
  // must be formatted directly — running them through displayMoney() again
  // would convert a second time.
  const convertedMoney = (cents: number, options?: { signed?: boolean }) =>
    formatMoney(cents, { currency: display.currency, ...options });
  const totalValueConverted = await (async () => {
    let total = 0;
    for (const h of holdings) {
      total += await convertCurrencyToDisplay(h.marketValueCents, h.investment.currency, display);
    }
    return total;
  })();
  const totalInvestedConverted = await (async () => {
    let total = 0;
    for (const h of holdings) {
      total += await convertCurrencyToDisplay(h.costBasisCents, h.investment.currency, display);
    }
    return total;
  })();
  const totalGainConverted = totalValueConverted - totalInvestedConverted;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Investments</h1>
          <p className="text-xs text-muted-foreground">
            Track your portfolio value and holdings
            {summary.asOf ? ` — ${marketTimestampLabel(summary.asOf)}` : ""}
          </p>
        </div>
        <Link href="/investments/new" className={buttonClass({ size: "sm" })}>
          <Plus className="h-4 w-4" />
          Add holding
        </Link>
      </div>

      {summary.simulated ? (
        <p className="text-xs text-muted-foreground">
          Prices come from a simulated feed.{" "}
          <Link href="/settings" className="text-foreground underline underline-offset-2">
            Add a market API key
          </Link>{" "}
          to use live data.
        </p>
      ) : null}

      {errors.length > 0 ? (
        <Card>
          <CardBody className="space-y-1">
            {errors.map((message) => (
              <p key={message} className="text-xs text-warning">
                {message}
              </p>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-xs text-muted-foreground">Total value</p>
            <p className="text-xl font-semibold tabular-nums">{convertedMoney(totalValueConverted)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-muted-foreground">Cost basis</p>
            <p className="text-xl font-semibold tabular-nums">{convertedMoney(totalInvestedConverted)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-muted-foreground">Unrealized P/L</p>
            <p
              className={`text-xl font-semibold tabular-nums ${totalGainConverted >= 0 ? "text-positive" : "text-negative"}`}
            >
              {convertedMoney(totalGainConverted, { signed: true })}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {formatPercent(totalValueConverted === 0 || totalInvestedConverted === 0 ? 0 : totalGainConverted / totalInvestedConverted, { signed: true })} all time
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Holdings" description={`${summary.holdingsCount} active holding${summary.holdingsCount === 1 ? "" : "s"}`} />
        <CardBody>
          {holdings.length === 0 ? (
            <EmptyState
              icon={<TrendingUp className="h-6 w-6" />}
              title="No holdings yet"
              description="Add your investment holdings to track performance."
              action={
                <Link href="/investments/new" className={buttonClass({ size: "sm" })}>
                  <Plus className="h-4 w-4" />
                  Add holding
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-2 text-left">Symbol</th>
                    <th className="py-2 text-left">Name</th>
                    <th className="py-2 text-right">Quantity</th>
                    <th className="py-2 text-right">Avg cost</th>
                    <th className="py-2 text-right">Price</th>
                    <th className="py-2 text-right">Value</th>
                    <th className="py-2 text-right">Allocation</th>
                    <th className="py-2 text-right">P/L</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => {
                    const rowMoney = (cents: number, options?: { signed?: boolean }) =>
                      formatMoney(cents, { currency: h.investment.currency, ...options });
                    return (
                      <tr key={h.investment.id} className="border-b border-border/50">
                        <td className="py-2 font-medium">
                          <div className="flex items-center gap-1.5">
                            {h.investment.symbol}
                            <span className="text-xs text-muted-foreground">
                              {h.investment.currency}
                            </span>
                            {h.simulated ? <Badge tone="warning">sim</Badge> : null}
                          </div>
                        </td>
                        <td className="py-2 text-muted-foreground">{h.investment.name || "—"}</td>
                        <td className="py-2 text-right tabular-nums">{h.investment.quantity.toFixed(2)}</td>
                        <td className="py-2 text-right tabular-nums">{rowMoney(h.investment.avgCostCents)}</td>
                        <td className="py-2 text-right tabular-nums">
                          {h.quote ? rowMoney(h.quote.priceCents) : "—"}
                        </td>
                        <td className="py-2 text-right tabular-nums font-medium">{rowMoney(h.marketValueCents)}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {formatPercent(h.allocationRatio, { digits: 0 })}
                        </td>
                        <td
                          className={`py-2 text-right tabular-nums ${h.unrealizedGainCents >= 0 ? "text-positive" : "text-negative"}`}
                        >
                          {rowMoney(h.unrealizedGainCents, { signed: true })}
                          <span className="ml-1 text-xs opacity-80">
                            ({formatPercent(h.unrealizedGainRatio, { signed: true, digits: 1 })})
                          </span>
                        </td>
                        <td className="py-2">
                          <div className="flex items-center justify-end gap-1">
                            <EditInvestmentDialog
                              investment={{
                                id: h.investment.id,
                                symbol: h.investment.symbol,
                                name: h.investment.name,
                                assetType: h.investment.assetType,
                                quantity: h.investment.quantity,
                                avgCostCents: h.investment.avgCostCents,
                                currency: h.investment.currency as import("@/lib/types").InvestmentCurrency,
                                accountId: h.investment.accountId,
                                notes: h.investment.notes,
                              }}
                              accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
                            />
                            <DeleteInvestmentButton
                              investment={{
                                id: h.investment.id,
                                symbol: h.investment.symbol,
                                name: h.investment.name,
                                quantity: h.investment.quantity,
                                avgCostCents: h.investment.avgCostCents,
                                currency: h.investment.currency,
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {summary.otherCurrencyTotals.length > 0 ? (
            <div className="mt-3 space-y-1 border-t border-border/50 pt-3">
              <p className="text-xs text-muted-foreground">
                Totals above are in {display.currency} and already include other currencies,
                converted at current rates. Native breakdown:
              </p>
              {summary.otherCurrencyTotals.map((total) => (
                <p key={total.currency} className="text-xs text-muted-foreground tabular-nums">
                  {total.currency}: {formatMoney(total.valueCents, { currency: total.currency })}{" "}
                  <span className={total.gainCents >= 0 ? "text-positive" : "text-negative"}>
                    ({formatMoney(total.gainCents, { currency: total.currency, signed: true })})
                  </span>
                </p>
              ))}
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}