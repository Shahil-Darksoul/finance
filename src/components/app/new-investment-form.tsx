"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/input";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import {
  ASSET_TYPES,
  type AssetType,
  type InvestmentCurrency,
} from "@/lib/types";
import {
  CRYPTO_SYMBOLS,
  isCryptoSymbol,
} from "@/lib/services/marketData/symbols";
import { KNOWN_SYMBOLS } from "@/lib/services/marketData/types";
import { formatMoney } from "@/lib/utils/money";

export type NewInvestmentFormProps = {
  accounts: { id: string; name: string }[];
  currency: string;
};

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  stock: "Stock",
  etf: "ETF",
  mutual_fund: "Mutual fund",
  crypto: "Crypto",
  bond: "Bond",
};

/**
 * Create form for an investment holding.
 *
 * Saving only needs what you paid; the live price is fetched when the
 * investments page loads. Picking a known symbol also sets the asset type, so a
 * coin is never filed as a stock.
 */
export function NewInvestmentForm({ accounts }: NewInvestmentFormProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [slowNavigation, setSlowNavigation] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});

  const [symbol, setSymbol] = React.useState("");
  const [quantityText, setQuantityText] = React.useState("");
  const [costCents, setCostCents] = React.useState(0);
  const tradeCurrency: InvestmentCurrency = "CAD";

  const lookup = React.useMemo(() => {
    const key = symbol.trim().toUpperCase();
    return key ? KNOWN_SYMBOLS.find((row) => row.symbol === key) : undefined;
  }, [symbol]);

  const crypto = isCryptoSymbol(symbol);

  // The asset type follows the symbol: a known ticker or a known coin wins, and
  // a manual choice only sticks until the symbol changes again.
  const [manualType, setManualType] = React.useState<{ symbol: string; assetType: AssetType } | null>(
    null,
  );
  const inferredType = lookup?.assetType ?? (crypto ? "crypto" : null);
  const assetType =
    manualType && manualType.symbol === symbol.trim().toUpperCase()
      ? manualType.assetType
      : (inferredType ?? "stock");

  const suggestions = React.useMemo(() => {
    const query = symbol.trim().toUpperCase();
    if (!query) return KNOWN_SYMBOLS.slice(0, 8);
    return KNOWN_SYMBOLS.filter(
      (row) => row.symbol.includes(query) || row.name.toUpperCase().includes(query),
    ).slice(0, 8);
  }, [symbol]);

  const quantity = Number(quantityText);
  const positionValue =
    Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity * costCents) : null;

  // The holding is written before the portfolio is priced, so the redirect can
  // take a moment. Offer a way forward instead of leaving the user on a
  // button that looks stuck.
  React.useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSlowNavigation(true), 4000);
    return () => clearTimeout(timer);
  }, [saved]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const form = new FormData(event.currentTarget);

    try {
      await apiFetch("/api/investments", {
        method: "POST",
        json: {
          symbol,
          name: lookup?.name ?? String(form.get("name") ?? "").trim(),
          assetType,
          quantity,
          avgCostCents: costCents,
          currency: tradeCurrency,
          accountId: String(form.get("accountId") ?? "") || null,
          notes: String(form.get("notes") ?? "").trim() || null,
        },
      });
      // The push already renders the destination with fresh data. A refresh
      // alongside it races the navigation and can leave this form on screen.
      setSaved(true);
      setPending(false);
      router.push("/investments");
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(caught.message);
        setFields(caught.fields);
      } else {
        setError("Something went wrong. Please try again.");
      }
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Link
        href="/investments"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to investments
      </Link>

      <div>
        <h1 className="text-lg font-semibold">Add a holding</h1>
        <p className="text-xs text-muted-foreground">
          Enter what you paid. Current price is looked up when you view the portfolio.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-negative-soft px-3 py-2 text-xs text-negative">
          {error}
        </p>
      ) : null}

      <Card>
        <CardBody className="space-y-4">
          <Field
            label="Symbol"
            htmlFor="symbol"
            error={fields.symbol}
            hint={
              crypto && !CRYPTO_SYMBOLS[symbol.trim().toUpperCase()]
                ? "Unlisted coin: use an exchange pair such as BINANCE:DOGEUSDT to get a live price."
                : "Ticker for a stock or ETF, or a coin like BTC."
            }
            required
          >
            <Input
              id="symbol"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              placeholder="AAPL"
              autoComplete="off"
              invalid={Boolean(fields.symbol)}
            />
          </Field>

          {suggestions.length > 0 ? (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Search className="h-3.5 w-3.5 text-muted" aria-hidden />
                {symbol.trim() ? "Matches" : "Common holdings"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((row) => (
                  <button
                    key={row.symbol}
                    type="button"
                    onClick={() => setSymbol(row.symbol)}
                    className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground transition-colors hover:border-border-strong"
                  >
                    <span className="font-medium">{row.symbol}</span>
                    <span className="ml-1.5 text-muted-foreground">{row.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <Field label="Asset type" htmlFor="assetType" hint="Set automatically from the symbol; override it if needed.">
            <Select
              id="assetType"
              value={assetType}
              onChange={(event) =>
                setManualType({
                  symbol: symbol.trim().toUpperCase(),
                  assetType: event.target.value as AssetType,
                })
              }
            >
              {ASSET_TYPES.map((value) => (
                <option key={value} value={value}>
                  {ASSET_TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Units held" htmlFor="quantity" error={fields.quantity} required>
              <Input
                id="quantity"
                inputMode="decimal"
                value={quantityText}
                onChange={(event) => setQuantityText(event.target.value)}
                placeholder="10"
              />
            </Field>
            <Field
              label="Average cost per unit (CAD)"
              htmlFor="avgCost"
              error={fields.avgCostCents}
              required
            >
              <MoneyInput id="avgCost" valueCents={costCents} onValueChange={setCostCents} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Held in" htmlFor="accountId" hint="Optional.">
              <Select id="accountId" name="accountId" defaultValue="">
                <option value="">Not specified</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Name" htmlFor="name" hint="Optional. Filled in automatically.">
              <Input
                id="name"
                name="name"
                defaultValue={lookup?.name ?? ""}
                placeholder={lookup?.name ?? "Company or fund name"}
              />
            </Field>
          </div>

          <Field label="Notes" htmlFor="notes" hint="Optional.">
            <Textarea id="notes" name="notes" />
          </Field>
        </CardBody>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending} disabled={saved}>
          {saved ? "Saved" : "Add holding"}
        </Button>
        <Link href="/investments" className={buttonClass({ variant: "ghost" })}>
          Cancel
        </Link>
        {positionValue ? (
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            Cost basis {formatCents(positionValue)}
          </span>
        ) : null}
      </div>

      {slowNavigation ? (
        <p className="text-xs text-muted-foreground">
          Saved. Pricing your portfolio can take a moment —{" "}
          <Link href="/investments" className="underline underline-offset-2">
            open your investments
          </Link>{" "}
          to continue.
        </p>
      ) : null}
    </form>
  );
}

function formatCents(cents: number): string {
  return formatMoney(cents);
}