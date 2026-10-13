"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/input";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { toISODate } from "@/lib/utils/date";

export type NewGoalFormProps = {
  accounts: { id: string; name: string }[];
};

/** Create form for a savings goal. */
export function NewGoalForm({ accounts }: NewGoalFormProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});

  const [targetCents, setTargetCents] = React.useState(0);
  const [monthlyCents, setMonthlyCents] = React.useState(0);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const form = new FormData(event.currentTarget);

    try {
      await apiFetch("/api/goals", {
        method: "POST",
        json: {
          name: String(form.get("name") ?? "").trim(),
          description: String(form.get("description") ?? "").trim() || null,
          targetCents,
          targetDate: String(form.get("targetDate") ?? "") || null,
          monthlyContributionCents: monthlyCents,
          accountId: String(form.get("accountId") ?? "") || null,
        },
      });
      router.push("/goals");
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

  const monthsToTarget =
    monthlyCents > 0 && targetCents > 0 ? Math.ceil(targetCents / monthlyCents) : null;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Link
        href="/goals"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to goals
      </Link>

      <div>
        <h1 className="text-lg font-semibold">Add a savings goal</h1>
        <p className="text-xs text-muted-foreground">
          A monthly contribution puts this goal on your calendar automatically.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-negative-soft px-3 py-2 text-xs text-negative">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader title="Goal" />
        <CardBody className="space-y-4">
          <Field label="Name" htmlFor="name" error={fields.name} required>
            <Input id="name" name="name" placeholder="Emergency fund" invalid={Boolean(fields.name)} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Target amount" htmlFor="target" error={fields.targetCents} required>
              <MoneyInput id="target" valueCents={targetCents} onValueChange={setTargetCents} />
            </Field>
            <Field
              label="Contributing monthly"
              htmlFor="monthly"
              hint="Optional. Appears on your calendar."
            >
              <MoneyInput id="monthly" valueCents={monthlyCents} onValueChange={setMonthlyCents} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Target date" htmlFor="targetDate" hint="Optional.">
              <Input
                id="targetDate"
                name="targetDate"
                type="date"
                min={toISODate(new Date())}
              />
            </Field>
            <Field label="Savings account" htmlFor="accountId" hint="Optional.">
              <Select id="accountId" name="accountId" defaultValue="">
                <option value="">Not specified</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Description" htmlFor="description" hint="Optional.">
            <Textarea id="description" name="description" placeholder="What this is for" />
          </Field>
        </CardBody>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending}>
          Add goal
        </Button>
        <Link href="/goals" className={buttonClass({ variant: "ghost" })}>
          Cancel
        </Link>
        {monthsToTarget ? (
          <span className="ml-auto text-xs text-muted-foreground">
            Roughly {monthsToTarget} month{monthsToTarget === 1 ? "" : "s"} at this pace
          </span>
        ) : null}
      </div>
    </form>
  );
}