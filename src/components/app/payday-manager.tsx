"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  Input,
  MoneyInput,
  Select,
} from "@/components/ui/input";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { PAYDAY_FREQUENCIES, type Payday } from "@/lib/types";
import { toISODate } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { ConfirmDialog } from "@/components/ui/modal";

const PAYDAY_FREQ_LABEL: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  semimonthly: "Twice a month (day X and day Y)",
  monthly: "Monthly",
};

export function PaydayManager({
  paydays,
  accounts,
  currency,
}: {
  paydays: Payday[];
  accounts: { id: string; name: string }[];
  currency: string;
}) {
  const router = useRouter();
  const { success } = useToast();

  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});

  const [label, setLabel] = React.useState("");
  const [amountCents, setAmountCents] = React.useState(0);
  const [startDate, setStartDate] = React.useState(toISODate(new Date()));
  const [frequency, setFrequency] = React.useState<string>("biweekly");
  const [secondDay, setSecondDay] = React.useState("");
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");

  const [toDelete, setToDelete] = React.useState<Payday | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function addPayday(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});
    try {
      await apiFetch("/api/paydays", {
        method: "POST",
        json: {
          label: label.trim(),
          amountCents,
          startDate,
          frequency,
          secondDay: frequency === "semimonthly" ? Number(secondDay) || null : null,
          anchorDay: frequency === "monthly" ? new Date(`${startDate}T00:00:00`).getDate() : null,
          accountId: accountId || null,
        },
      });
      success("Payday added", "It now shows on your calendar.");
      setLabel("");
      setAmountCents(0);
      setSecondDay("");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(caught.message);
        setFields(caught.fields);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setPending(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/paydays/${toDelete.id}`, { method: "DELETE" });
      success("Payday removed");
      setToDelete(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Something went wrong.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={addPayday} noValidate className="rounded-xl border border-border bg-surface p-4">
        <p className="text-xs font-medium text-foreground">Add a payday</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Pay is written to your calendar on its schedule — weekly, every two weeks, twice a month
          or monthly.
        </p>

        {error ? (
          <p role="alert" className="mt-3 rounded-lg bg-negative-soft px-3 py-2 text-xs text-negative">
            {error}
          </p>
        ) : null}

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Label" htmlFor="payday-label" error={fields.label} required>
            <Input
              id="payday-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Primary salary"
            />
          </Field>
          <Field label="Net amount" htmlFor="payday-amount" error={fields.amountCents} required>
            <MoneyInput id="payday-amount" valueCents={amountCents} onValueChange={setAmountCents} />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Happens" htmlFor="payday-frequency" required>
            <Select
              id="payday-frequency"
              value={frequency}
              onChange={(event) => setFrequency(event.target.value)}
            >
              {PAYDAY_FREQUENCIES.map((value) => (
                <option key={value} value={value}>
                  {PAYDAY_FREQ_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Starts" htmlFor="payday-start" error={fields.startDate} required>
            <Input
              id="payday-start"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Deposit to"
            htmlFor="payday-account"
            error={fields.accountId}
            hint="Where each check lands. Stays the same for future paydays until you change it."
          >
            <Select
              id="payday-account"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              {accounts.length === 0 ? <option value="">No account available</option> : null}
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {frequency === "semimonthly" ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Second day"
              htmlFor="payday-second"
              error={fields.secondDay}
              hint="The other day of the month you get paid."
              required
            >
              <Select id="payday-second" value={secondDay} onChange={(event) => setSecondDay(event.target.value)}>
                <option value="">Pick a day</option>
                {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>
                    Day {day}
                  </option>
                ))}
                <option value="31">Last day of month</option>
              </Select>
            </Field>
          </div>
        ) : null}

        <div className="mt-4">
          <Button type="submit" loading={pending}>
            <Plus className="h-4 w-4" aria-hidden />
            Add payday
          </Button>
        </div>
      </form>

      {paydays.length > 0 ? (
        <div>
          <p className="mb-2 text-[11px] text-muted-foreground">
            The amount below is the default. Each individual payday on the calendar can use a
            different amount (e.g. for hours worked) — edit it on the calendar and only that date
            changes.
          </p>
          <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border bg-surface">
          {paydays.map((payday) => {
            const depositAccount = accounts.find((account) => account.id === payday.accountId);
            return (
            <li key={payday.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{payday.label}</p>
                <p className="text-xs text-muted-foreground">
                  {PAYDAY_FREQ_LABEL[payday.frequency]}
                  {payday.frequency === "semimonthly" && payday.secondDay
                    ? ` (day ${payday.secondDay})`
                    : ""}
                  {" · "}
                  starts {new Date(`${payday.startDate}T00:00:00`).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {depositAccount ? ` · deposits to ${depositAccount.name}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-medium tabular-nums text-positive">
                  {formatMoney(payday.amountCents, { currency })}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${payday.label}`}
                  title="Delete this payday"
                  onClick={() => setToDelete(payday)}
                  className="text-muted-foreground transition-colors hover:text-negative"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </li>
            );
          })}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No paydays yet. Add one above and its dates appear on your calendar and dashboard.
        </p>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => {
          if (!deleting) setToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Delete this payday?"
        message={
          <>
            <span className="font-medium text-foreground">{toDelete?.label}</span> will be removed
            from your calendar. Past paydays you recorded as transactions are not affected.
          </>
        }
        confirmLabel="Delete payday"
        loading={deleting}
      />
    </div>
  );
}