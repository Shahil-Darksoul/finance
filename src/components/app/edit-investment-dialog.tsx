"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/input";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import {
  ASSET_TYPES,
  INVESTMENT_CURRENCIES,
  type AssetType,
  type InvestmentCurrency,
} from "@/lib/types";

export type EditableInvestment = {
  id: string;
  symbol: string;
  name: string | null;
  assetType: AssetType;
  quantity: number;
  avgCostCents: number;
  currency: InvestmentCurrency;
  accountId: string | null;
  notes: string | null;
};

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  stock: "Stock",
  etf: "ETF",
  mutual_fund: "Mutual fund",
  crypto: "Crypto",
  bond: "Bond",
};

export function EditInvestmentDialog({
  investment,
  accounts,
}: {
  investment: EditableInvestment;
  accounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { success } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});

  const [symbol, setSymbol] = React.useState(investment.symbol);
  const [name, setName] = React.useState(investment.name ?? "");
  const [assetType, setAssetType] = React.useState<AssetType>(investment.assetType);
  const [quantity, setQuantity] = React.useState(investment.quantity.toString());
  const [avgCostCents, setAvgCostCents] = React.useState(investment.avgCostCents);
  const [currency, setCurrency] = React.useState<InvestmentCurrency>(investment.currency);
  const [accountId, setAccountId] = React.useState(investment.accountId ?? "");
  const [notes, setNotes] = React.useState(investment.notes ?? "");

  function openDialog() {
    setSymbol(investment.symbol);
    setName(investment.name ?? "");
    setAssetType(investment.assetType);
    setQuantity(investment.quantity.toString());
    setAvgCostCents(investment.avgCostCents);
    setCurrency(investment.currency);
    setAccountId(investment.accountId ?? "");
    setNotes(investment.notes ?? "");
    setError(null);
    setFields({});
    setOpen(true);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0) {
      setError("Enter a valid quantity.");
      setPending(false);
      return;
    }

    try {
      await apiFetch(`/api/investments/${investment.id}`, {
        method: "PATCH",
        json: {
          symbol: symbol.trim().toUpperCase() || investment.symbol,
          name: name.trim() ? name.trim() : null,
          assetType,
          quantity: qty,
          avgCostCents,
          currency,
          accountId: accountId || null,
          notes: notes.trim() || null,
        },
      });
      setOpen(false);
      success("Holding updated", `${symbol.toUpperCase()} has been saved.`);
      router.refresh();
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
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={openDialog}
        aria-label={`Edit ${investment.symbol}`}
        title="Edit holding"
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title="Edit holding"
        description="Update the position details. Price history is unaffected."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="edit-investment-form" loading={pending}>
              Save changes
            </Button>
          </>
        }
      >
        <form id="edit-investment-form" onSubmit={onSubmit} noValidate className="space-y-4">
          {error ? (
            <p role="alert" className="rounded-lg bg-negative-soft px-3 py-2 text-xs text-negative">
              {error}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Symbol" htmlFor="edit-symbol" error={fields.symbol} required>
              <Input
                id="edit-symbol"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                invalid={Boolean(fields.symbol)}
              />
            </Field>
            <Field label="Name" htmlFor="edit-name" error={fields.name}>
              <Input
                id="edit-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Optional"
                invalid={Boolean(fields.name)}
              />
            </Field>
          </div>

          <Field label="Asset type" htmlFor="edit-assetType" required>
            <Select
              id="edit-assetType"
              value={assetType}
              onChange={(event) => setAssetType(event.target.value as AssetType)}
            >
              {ASSET_TYPES.map((value) => (
                <option key={value} value={value}>
                  {ASSET_TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Units held" htmlFor="edit-quantity" error={fields.quantity} required>
              <Input
                id="edit-quantity"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </Field>
            <Field label="Average cost" htmlFor="edit-avgCost" error={fields.avgCostCents} required>
              <MoneyInput
                id="edit-avgCost"
                valueCents={avgCostCents}
                onValueChange={setAvgCostCents}
              />
            </Field>
            <Field label="Currency" htmlFor="edit-currency" required>
              <Select
                id="edit-currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value as InvestmentCurrency)}
              >
                {INVESTMENT_CURRENCIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {accounts.length > 0 ? (
            <Field label="Account" htmlFor="edit-account" hint="Optional. Link this holding to an account.">
              <Select
                id="edit-account"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                <option value="">No account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Notes" htmlFor="edit-notes" hint="Optional." error={fields.notes}>
            <Textarea
              id="edit-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              invalid={Boolean(fields.notes)}
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
