"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Switch, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/card";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_META } from "@/lib/types";

export type NewAccountFormProps = {
  currency: string;
};

const LIABILITY_TYPES = new Set(["credit_card", "loan"]);

/** Create form for an account. */
export function NewAccountForm({ currency: defaultCurrency }: NewAccountFormProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});

  const [type, setType] = React.useState<string>("checking");
  const [balanceCents, setBalanceCents] = React.useState(0);
  const [creditLimitCents, setCreditLimitCents] = React.useState(0);
  const [includeInNetWorth, setIncludeInNetWorth] = React.useState(true);

  const isLiability = LIABILITY_TYPES.has(type);
  const currency = defaultCurrency || "CAD";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const form = new FormData(event.currentTarget);

    try {
      await apiFetch("/api/accounts", {
        method: "POST",
        json: {
          name: String(form.get("name") ?? "").trim(),
          type,
          institution: String(form.get("institution") ?? "").trim() || null,
          openingBalanceCents: balanceCents,
          creditLimitCents: isLiability ? creditLimitCents : 0,
          currency,
          note: String(form.get("note") ?? "").trim() || null,
          includeInNetWorth,
        },
      });
      router.push("/accounts");
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
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Link
        href="/accounts"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to accounts
      </Link>

      <div>
        <h1 className="text-lg font-semibold">Add an account</h1>
        <p className="text-xs text-muted-foreground">
          Start from what the balance is today. Transactions move it from there.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-negative-soft px-3 py-2 text-xs text-negative">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader title="Account" />
        <CardBody className="space-y-4">
          <Field label="Name" htmlFor="name" error={fields.name} required>
            <Input id="name" name="name" placeholder="Everyday checking" invalid={Boolean(fields.name)} />
          </Field>

          <Field label="Type" htmlFor="type" required>
            <Select id="type" value={type} onChange={(event) => setType(event.target.value)}>
              {ACCOUNT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {ACCOUNT_TYPE_META[value].label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Currency" htmlFor="currency" hint="Amounts are stored in CAD.">
            <Input id="currency" value="CAD" readOnly disabled />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={isLiability ? "Current balance owed" : "Current balance"}
              htmlFor="balance"
              hint={isLiability ? "What you owe right now." : "What is in it right now."}
            >
              <MoneyInput id="balance" valueCents={balanceCents} onValueChange={setBalanceCents} />
            </Field>
            {isLiability ? (
              <Field label="Credit limit" htmlFor="limit" hint="Optional. Cards only.">
                <MoneyInput
                  id="limit"
                  valueCents={creditLimitCents}
                  onValueChange={setCreditLimitCents}
                />
              </Field>
            ) : (
              <Field label="Institution" htmlFor="institution" hint="Optional.">
                <Input id="institution" name="institution" placeholder="Bank name" />
              </Field>
            )}
          </div>

          <Switch
            checked={includeInNetWorth}
            onCheckedChange={setIncludeInNetWorth}
            label="Count towards net worth"
            description="Turn this off for accounts you want tracked but excluded from totals."
          />

          <Field label="Note" htmlFor="note" hint="Optional.">
            <Textarea id="note" name="note" />
          </Field>
        </CardBody>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending}>
          Add account
        </Button>
        <Link href="/accounts" className={buttonClass({ variant: "ghost" })}>
          Cancel
        </Link>
        {isLiability ? (
          <Badge tone="negative" className="ml-auto">
            Counts as a liability
          </Badge>
        ) : null}
      </div>
    </form>
  );
}