"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calculator, Info, TrendingUp } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Switch, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/card";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { buildAmortization } from "@/lib/services/finance/emi";
import { BILL_FREQUENCIES, FREQUENCY_META, type BillFrequency } from "@/lib/types";
import { toISODate } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";

export type NewBillFormProps = {
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  currency: string;
  /** Pre-select a mode when arriving from a dedicated link. */
  defaultKind?: "bill" | "emi" | "sip";
};

type Kind = "bill" | "emi" | "sip";

/**
 * Create form for both recurring bills and loan instalments.
 *
 * The two modes share one page because they are the same commitment to money:
 * a named amount leaving an account on a schedule. EMI mode swaps the single
 * amount for loan terms and shows the derived instalment, so nobody has to
 * compute an EMI by hand.
 */
export function NewBillForm({
  accounts,
  categories,
  currency,
  defaultKind = "bill",
}: NewBillFormProps) {
  const router = useRouter();
  const today = React.useMemo(() => toISODate(new Date()), []);
  const dayOfMonth = new Date().getDate();

  const [kind, setKind] = React.useState<Kind>(defaultKind);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});

  const [amountCents, setAmountCents] = React.useState(0);
  const [principalCents, setPrincipalCents] = React.useState(0);
  const [rate, setRate] = React.useState<string>("");
  const [termMonths, setTermMonths] = React.useState<string>("");
  const [investmentSymbol, setInvestmentSymbol] = React.useState("");
  const [frequency, setFrequency] = React.useState<BillFrequency>("monthly");
  const [dueDay, setDueDay] = React.useState(String(dayOfMonth));
  const [startDate, setStartDate] = React.useState(today);
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = React.useState("");
  const [autopay, setAutopay] = React.useState(false);
  const [repeat, setRepeat] = React.useState(true);
  const [notes, setNotes] = React.useState("");

  // Derived instalment preview, so the loan terms can be sanity-checked before
  // saving. Recomputed only when the loan inputs actually change.
  const preview = React.useMemo(() => {
    if (kind !== "emi") return null;
    const rateNumber = Number(rate);
    const term = Number(termMonths);
    if (!principalCents || !term || term <= 0 || !Number.isFinite(rateNumber)) {
      return null;
    }
    return buildAmortization({
      principalCents,
      annualRatePercent: rateNumber,
      termMonths: term,
      firstDueDate: startDate,
    });
  }, [kind, principalCents, rate, termMonths, startDate]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();

    try {
      await apiFetch("/api/bills", {
        method: "POST",
        json: {
          name,
          kind,
          investmentSymbol: kind === "sip" ? investmentSymbol.trim().toUpperCase() || null : null,
          amountCents: kind === "bill" || kind === "sip" ? amountCents : undefined,
          principalCents: kind === "emi" ? principalCents : undefined,
          annualRatePercent: kind === "emi" ? Number(rate) : undefined,
          termMonths: kind === "emi" ? Number(termMonths) : undefined,
          frequency,
          dueDay: Number(dueDay),
          startDate,
          repeat,
          accountId: accountId || null,
          categoryId: categoryId || null,
          autopay,
          notes: notes.trim() || null,
        },
      });
      // The push already renders the destination with fresh data; a refresh
      // alongside it races the navigation and can leave this form on screen.
      router.push("/bills");
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

  const money = (cents: number) => formatMoney(cents, { currency });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Link
        href="/bills"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to bills
      </Link>

      <div>
        <h1 className="text-lg font-semibold">
          {kind === "emi" ? "Add a loan or EMI" : kind === "sip" ? "Add an investment plan / SIP" : "Add a bill"}
        </h1>
        <p className="text-xs text-muted-foreground">
          {kind === "emi"
            ? "Give the loan terms and the instalment schedule is worked out for you."
            : kind === "sip"
              ? "Plan a regular investment into a stock or fund. It tracks the commitment in your schedule and obligations — it stays off the Investments portfolio list."
              : "Anything that leaves your account on a schedule."}
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="What are you adding"
        className="grid gap-2 sm:grid-cols-3"
      >
        {(
          [
            { value: "bill", label: "Bill or subscription", hint: "Fixed amount, repeats", icon: null },
            { value: "emi", label: "Loan / EMI", hint: "Calculated from loan terms", icon: null },
            { value: "sip", label: "Investment / SIP", hint: "Plan to invest on a schedule", icon: <TrendingUp className="h-4 w-4" /> },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={kind === option.value}
            onClick={() => setKind(option.value)}
            className={`rounded-xl border p-3 text-left transition-colors ${
              kind === option.value
                ? "border-primary bg-primary-soft"
                : "border-border bg-surface hover:border-border-strong"
            }`}
          >
            <div className="flex items-start gap-2">
              {option.icon ? <span className="mt-0.5 text-muted-foreground">{option.icon}</span> : null}
              <div>
                <span className="block text-sm font-medium text-foreground">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.hint}</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-negative-soft px-3 py-2 text-xs text-negative">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader title="Details" />
        <CardBody className="space-y-4">
          <Field label="Name" htmlFor="name" error={fields.name} required>
            <Input
              id="name"
              name="name"
              placeholder={kind === "emi" ? "Car loan" : "Rent"}
              invalid={Boolean(fields.name)}
            />
          </Field>

          {kind === "bill" || kind === "sip" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {kind === "sip" ? (
                <Field
                  label="Investment target"
                  htmlFor="investmentSymbol"
                  error={fields.investmentSymbol}
                  hint="Stock, ETF, fund, index or plan name (e.g. NIFTYBEES, TATAMOTORS)."
                  required
                >
                  <Input
                    id="investmentSymbol"
                    value={investmentSymbol}
                    onChange={(event) => setInvestmentSymbol(event.target.value.toUpperCase())}
                    placeholder="RELIANCE"
                    autoComplete="off"
                    invalid={Boolean(fields.investmentSymbol)}
                  />
                </Field>
              ) : null}
              <Field
                label={kind === "sip" ? "Amount to invest" : "Amount"}
                htmlFor="amount"
                error={fields.amountCents}
                hint={kind === "sip" ? "How much you plan to invest each time." : "What you pay each time."}
                required
              >
                <MoneyInput id="amount" valueCents={amountCents} onValueChange={setAmountCents} />
              </Field>
              <Field
                label="Repeats"
                htmlFor="frequency"
                hint={repeat ? "How often it comes around." : "One-time — frequency is ignored."}
              >
                <Select
                  id="frequency"
                  value={frequency}
                  onChange={(event) => setFrequency(event.target.value as BillFrequency)}
                  disabled={!repeat}
                >
                  {BILL_FREQUENCIES.map((value) => (
                    <option key={value} value={value}>
                      {FREQUENCY_META[value].label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Amount borrowed"
                  htmlFor="principal"
                  error={fields.principalCents}
                  required
                >
                  <MoneyInput
                    id="principal"
                    valueCents={principalCents}
                    onValueChange={setPrincipalCents}
                  />
                </Field>
                <Field
                  label="Annual interest rate"
                  htmlFor="rate"
                  error={fields.annualRatePercent}
                  hint="Percent, e.g. 7.5. Use 0 for interest-free."
                  required
                >
                  <Input
                    id="rate"
                    inputMode="decimal"
                    placeholder="7.5"
                    value={rate}
                    onChange={(event) => setRate(event.target.value)}
                    invalid={Boolean(fields.annualRatePercent)}
                  />
                </Field>
              </div>
              <Field label="Term" htmlFor="term" error={fields.termMonths} required>
                <Select
                  id="term"
                  value={termMonths}
                  onChange={(event) => setTermMonths(event.target.value)}
                  invalid={Boolean(fields.termMonths)}
                >
                  <option value="">Choose a term</option>
                  {[6, 12, 24, 36, 48, 60, 72, 84, 120, 180, 240, 360].map((months) => (
                    <option key={months} value={months}>
                      {months} months ({Math.round(months / 12 * 10) / 10} years)
                    </option>
                  ))}
                </Select>
              </Field>

              {preview ? (
                <div className="rounded-xl border border-border bg-surface-2 p-3">
                  <div className="flex items-center gap-1.5">
                    <Calculator className="h-3.5 w-3.5 text-muted" aria-hidden />
                    <p className="text-xs font-medium text-foreground">Monthly instalment</p>
                  </div>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {money(preview.monthlyPaymentCents)}
                  </p>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Instalments</dt>
                      <dd className="tabular-nums">{preview.totalPayments}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Total interest</dt>
                      <dd className="tabular-nums">{money(preview.totalInterestCents)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Total payable</dt>
                      <dd className="tabular-nums">{money(preview.totalPayableCents)}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    Interest falls each month, so later instalments are slightly smaller. Each
                    one is written to your calendar at its real amount.
                  </p>
                </div>
              ) : null}
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Due day"
              htmlFor="dueDay"
              hint="Day of the month it is due."
              error={fields.dueDay}
              required
            >
              <Select id="dueDay" value={dueDay} onChange={(event) => setDueDay(event.target.value)}>
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>
                    {day === 31 ? "Last day of month" : `Day ${day}`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={kind === "emi" ? "First instalment" : "Starts"}
              htmlFor="startDate"
              error={fields.startDate}
              required
            >
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Paid from" htmlFor="accountId" hint="Optional.">
              <Select id="accountId" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                <option value="">Not specified</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category" htmlFor="categoryId" hint="Optional.">
              <Select id="categoryId" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Not specified</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Switch
            checked={autopay}
            onCheckedChange={setAutopay}
            label="Paid automatically"
            description="Marks this as autopay so reminders can treat it differently."
          />

          <Switch
            checked={repeat}
            onCheckedChange={setRepeat}
            label="Repeat"
            description={
              repeat
                ? kind === "emi"
                  ? "Every instalment is written to your calendar across the whole loan term."
                  : "Shows again on every future month automatically, including next month."
                : "One time only — appears on the start date, then nothing after."
            }
          />

          <Field label="Notes" htmlFor="notes" hint="Optional.">
            <Textarea
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything worth remembering"
            />
          </Field>
        </CardBody>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending}>
          {kind === "emi" ? "Add loan" : kind === "sip" ? "Add plan" : "Add bill"}
        </Button>
        <Link href="/bills" className={buttonClass({ variant: "ghost" })}>
          Cancel
        </Link>
        <Badge tone={kind === "sip" ? "accent" : "info"} className="ml-auto">
          {kind === "emi"
            ? repeat
              ? `${preview?.totalPayments ?? "—"} instalments on your calendar`
              : "Single instalment, once"
            : kind === "sip"
              ? repeat
                ? "Planned investment on your calendar (not in Investments list)"
                : "One-time plan, once"
              : repeat
                ? "Repeats on your calendar automatically"
                : "Appears once, then stops"}
        </Badge>
      </div>
    </form>
  );
}