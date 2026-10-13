"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Calculator } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import {
  Field,
  Input,
  MoneyInput,
  Select,
  Switch,
} from "@/components/ui/input";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { buildAmortization } from "@/lib/services/finance/emi";
import { PAYDAY_FREQUENCIES } from "@/lib/types";
import { formatMoney } from "@/lib/utils/money";

type Kind = "bill" | "emi" | "payday";

const KIND_META: Record<Kind, { label: string; hint: string }> = {
  bill: { label: "Bill", hint: "Fixed amount, repeats" },
  emi: { label: "Loan / EMI", hint: "Calculated from loan terms" },
  payday: { label: "Payday", hint: "Income on a schedule" },
};

const PAYDAY_FREQ_LABEL: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  semimonthly: "Twice a month",
  monthly: "Monthly",
};

function dayOfMonth(value: string): number {
  return new Date(`${value}T00:00:00`).getDate();
}

/**
 * Quick-add for one calendar date. Sits next to the agenda so a bill, loan or
 * payday can be dropped straight onto a picked day without leaving the calendar.
 */
export function QuickAddItem({
  open,
  onClose,
  date,
  currency,
  defaultKind = "bill",
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  currency: string;
  defaultKind?: Kind;
}) {
  const router = useRouter();
  const { success } = useToast();

  const [kind, setKind] = React.useState<Kind>(defaultKind);
  const [dueDate, setDueDate] = React.useState(date);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});

  // Bill.
  const [billName, setBillName] = React.useState("");
  const [billAmount, setBillAmount] = React.useState(0);
  const [repeat, setRepeat] = React.useState(true);

  // EMI.
  const [emiName, setEmiName] = React.useState("");
  const [principal, setPrincipal] = React.useState(0);
  const [rate, setRate] = React.useState("");
  const [term, setTerm] = React.useState("");

  // Payday.
  const [paydayLabel, setPaydayLabel] = React.useState("");
  const [paydayAmount, setPaydayAmount] = React.useState(0);
  const [paydayFrequency, setPaydayFrequency] = React.useState<string>("biweekly");
  const [secondDay, setSecondDay] = React.useState("");

  const preview = React.useMemo(() => {
    if (kind !== "emi") return null;
    const rateNumber = Number(rate);
    const termNumber = Number(term);
    if (!principal || !termNumber || termNumber <= 0 || !Number.isFinite(rateNumber)) {
      return null;
    }
    return buildAmortization({
      principalCents: principal,
      annualRatePercent: rateNumber,
      termMonths: termNumber,
      firstDueDate: dueDate,
    });
  }, [kind, principal, rate, term, dueDate]);

  async function submit() {
    setPending(true);
    setError(null);
    setFields({});

    const common = {
      dueDay: dayOfMonth(dueDate) || undefined,
      startDate: dueDate,
    };

    try {
      if (kind === "payday") {
        await apiFetch("/api/paydays", {
          method: "POST",
          json: {
            label: paydayLabel.trim(),
            amountCents: paydayAmount,
            startDate: dueDate,
            frequency: paydayFrequency,
            secondDay:
              paydayFrequency === "semimonthly"
                ? Number(secondDay) || undefined
                : null,
            anchorDay: paydayFrequency === "monthly" ? common.dueDay : null,
          },
        });
      } else if (kind === "bill") {
        await apiFetch("/api/bills", {
          method: "POST",
          json: {
            name: billName.trim(),
            kind: "bill",
            amountCents: billAmount,
            frequency: "monthly",
            repeat,
            ...common,
          },
        });
      } else {
        await apiFetch("/api/bills", {
          method: "POST",
          json: {
            name: emiName.trim(),
            kind: "emi",
            principalCents: principal,
            annualRatePercent: Number(rate),
            termMonths: Number(term),
            frequency: "monthly",
            repeat: true,
            ...common,
          },
        });
      }
      success("Added", "It now shows on this date in your calendar.");
      onClose();
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
    <Modal
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      title={`Add on ${new Date(`${dueDate}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })}`}
      description="A bill, loan or payday is placed on this date and repeats on your calendar."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={pending}>
            Add {KIND_META[kind].label.toLowerCase()}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div role="radiogroup" aria-label="What are you adding" className="grid gap-2 sm:grid-cols-3">
          {Object.entries(KIND_META).map(([value, meta]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={kind === value}
              onClick={() => setKind(value as Kind)}
              className={`rounded-xl border p-2.5 text-left transition-colors ${
                kind === value
                  ? "border-primary bg-primary-soft"
                  : "border-border bg-surface hover:border-border-strong"
              }`}
            >
              <span className="block text-sm font-medium text-foreground">{meta.label}</span>
              <span className="block text-[11px] text-muted-foreground">{meta.hint}</span>
            </button>
          ))}
        </div>

        {error ? (
          <p role="alert" className="rounded-lg bg-negative-soft px-3 py-2 text-xs text-negative">
            {error}
          </p>
        ) : null}

        {kind === "payday" ? (
          <>
            <Field
              label="Label"
              htmlFor="quick-payday-label"
              error={fields.label}
              hint="e.g. Monthly salary"
              required
            >
              <Input
                id="quick-payday-label"
                value={paydayLabel}
                onChange={(event) => setPaydayLabel(event.target.value)}
                placeholder="Monthly salary"
              />
            </Field>
            <Field label="Net amount" htmlFor="quick-payday-amount" error={fields.amountCents} required>
              <MoneyInput
                id="quick-payday-amount"
                valueCents={paydayAmount}
                onValueChange={setPaydayAmount}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Happens" htmlFor="quick-payday-frequency" required>
                <Select
                  id="quick-payday-frequency"
                  value={paydayFrequency}
                  onChange={(event) => setPaydayFrequency(event.target.value)}
                >
                  {PAYDAY_FREQUENCIES.map((value) => (
                    <option key={value} value={value}>
                      {PAYDAY_FREQ_LABEL[value]}
                    </option>
                  ))}
                </Select>
              </Field>
              {paydayFrequency === "semimonthly" ? (
                <Field
                  label="Second day"
                  htmlFor="quick-payday-second"
                  error={fields.secondDay}
                  hint="Day of the month."
                  required
                >
                  <Select
                    id="quick-payday-second"
                    value={secondDay}
                    onChange={(event) => setSecondDay(event.target.value)}
                  >
                    <option value="">Pick a day</option>
                    {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                      <option key={day} value={day}>
                        Day {day}
                      </option>
                    ))}
                    <option value="31">Last day of month</option>
                  </Select>
                </Field>
              ) : null}
            </div>
            <Field label="Starts" htmlFor="quick-payday-date" error={fields.startDate} required>
              <Input
                id="quick-payday-date"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </Field>
          </>
        ) : kind === "bill" ? (
          <>
            <Field label="Name" htmlFor="quick-bill-name" error={fields.name} required>
              <Input
                id="quick-bill-name"
                value={billName}
                onChange={(event) => setBillName(event.target.value)}
                placeholder="Rent"
              />
            </Field>
            <Field label="Amount" htmlFor="quick-bill-amount" error={fields.amountCents} required>
              <MoneyInput
                id="quick-bill-amount"
                valueCents={billAmount}
                onValueChange={setBillAmount}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Due date" htmlFor="quick-bill-date" required>
                <Input
                  id="quick-bill-date"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </Field>
              <div className="items-end sm:pb-1">
                <Switch
                  checked={repeat}
                  onCheckedChange={setRepeat}
                  label="Repeat"
                  description={repeat ? "Every month from this date" : "Once only"}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <Field label="Name" htmlFor="quick-emi-name" error={fields.name} required>
              <Input
                id="quick-emi-name"
                value={emiName}
                onChange={(event) => setEmiName(event.target.value)}
                placeholder="Car loan"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Amount borrowed" htmlFor="quick-emi-principal" error={fields.principalCents} required>
                <MoneyInput
                  id="quick-emi-principal"
                  valueCents={principal}
                  onValueChange={setPrincipal}
                />
              </Field>
              <Field
                label="Annual interest rate"
                htmlFor="quick-emi-rate"
                error={fields.annualRatePercent}
                hint="Percent, e.g. 7.5"
                required
              >
                <Input
                  id="quick-emi-rate"
                  inputMode="decimal"
                  placeholder="7.5"
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Term" htmlFor="quick-emi-term" error={fields.termMonths} required>
                <Select id="quick-emi-term" value={term} onChange={(event) => setTerm(event.target.value)}>
                  <option value="">Choose a term</option>
                  {[6, 12, 24, 36, 48, 60, 72, 84, 120, 180, 240, 360].map((months) => (
                    <option key={months} value={months}>
                      {months} months
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="First instalment" htmlFor="quick-emi-date" required>
                <Input
                  id="quick-emi-date"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </Field>
            </div>
            {preview ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
                <Calculator className="h-4 w-4 text-muted" aria-hidden />
                <p className="text-xs text-muted-foreground">Monthly instalment</p>
                <p className="ml-auto text-sm font-semibold tabular-nums text-foreground">
                  {formatMoney(preview.monthlyPaymentCents, { currency })}
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}