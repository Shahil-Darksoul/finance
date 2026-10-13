"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, MoneyInput, Select } from "@/components/ui/input";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import type { CalendarEventInput } from "./calendar-view";

/** Sources that represent a definition the user can edit from the calendar. */
const EDITABLE = new Set(["bill", "emi", "payday"]);

/** The entity id and date encoded in a `<source>-<id>-<date>` event id. */
function parseOccurrenceId(event: CalendarEventInput): { id: string; date: string } {
  const date = event.id.slice(-10);
  const rest = event.id.slice(0, -11);
  const dash = rest.indexOf("-");
  return { id: rest.slice(dash + 1), date };
}

function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Edit action for one agenda row.
 *
 * Bills and paydays can have their title, amount and date changed in place. A
 * loan's instalment is derived from its terms, so only the title and the date
 * are editable for EMI entries.
 */
export function EditAgendaItem({
  event,
  accounts,
  currency,
}: {
  event: CalendarEventInput;
  accounts: { id: string; name: string }[];
  currency: string;
}) {
  const router = useRouter();
  const { success } = useToast();

  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [title, setTitle] = React.useState("");
  const [amountCents, setAmountCents] = React.useState(0);
  const [occurrenceDate, setOccurrenceDate] = React.useState("");
  const [accountId, setAccountId] = React.useState("");

  if (!EDITABLE.has(event.source)) return null;

  const { id } = parseOccurrenceId(event);
  const isEmi = event.source === "emi";
  const isPayday = event.source === "payday";
  const initialAmount = Math.abs(event.amountCents);

  function openDialog() {
    setTitle(event.title);
    // A check can pay a different amount every time, so the payday field always
    // asks for this date's amount instead of carrying the previous one over.
    setAmountCents(event.source === "payday" ? 0 : initialAmount);
    setOccurrenceDate(event.date);
    setAccountId(event.accountId ?? "");
    setError(null);
    setFields({});
    setOpen(true);
  }

  async function save() {
    const trimmed = title.trim();
    const nextFields: Record<string, string> = {};
    if (!trimmed) nextFields.title = "Give this a name.";
    if (!isEmi && amountCents <= 0) nextFields.amountCents = "Enter an amount.";
    if (!occurrenceDate) nextFields.date = "Pick a date.";
    if (Object.keys(nextFields).length > 0) {
      setFields(nextFields);
      return;
    }

    setPending(true);
    setError(null);
    setFields({});

    try {
      if (event.source === "payday") {
        // Each payday can pay a different amount (e.g. from hours worked), so
        // the amount typed here is always recorded for this one date.
        const targetDate = occurrenceDate !== event.date ? occurrenceDate : event.date;
        await apiFetch(`/api/paydays/${id}`, {
          method: "PATCH",
          json: {
            label: trimmed,
            ...(occurrenceDate !== event.date ? { startDate: occurrenceDate } : {}),
            occurrenceDate: targetDate,
            amountCents,
            accountId: accountId || null,
            ...(occurrenceDate !== event.date ? { removeOccurrenceDate: event.date } : {}),
          },
        });
      } else {
        const json: Record<string, string | number> = {};
        if (trimmed !== event.title) json.title = trimmed;
        if (!isEmi && amountCents !== initialAmount) json.amountCents = amountCents;
        if (occurrenceDate !== event.date) json.date = occurrenceDate;
        await apiFetch(`/api/bills/${id}`, { method: "PATCH", json });
      }
      success("Updated", "The calendar has been refreshed.");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : "Something went wrong. Please try again.",
      );
      setPending(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={openDialog}
        aria-label={`Edit ${event.title} on ${formatDay(event.date)}`}
        title="Edit this payment"
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title="Edit payment"
        description={`${event.title} · ${formatDay(event.date)}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={() => void save()} loading={pending}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title" htmlFor="agenda-edit-title" error={fields.title} required>
            <Input
              id="agenda-edit-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>

          {isEmi ? (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              This instalment is calculated from the loan&apos;s terms ({currency}{" "}
              {((amountCents / 100).toFixed(2))} due here). Change the title or the date below;
              to renegotiate the amount, edit the loan itself.
            </p>
          ) : (
            <Field
              label="Amount"
              htmlFor="agenda-edit-amount"
              error={fields.amountCents}
              hint={
                event.source === "payday"
                  ? "How much did this check pay? Every payday differs (e.g. by hours worked)."
                  : "Applies to every repetition of this bill."
              }
              required
            >
              <MoneyInput
                id="agenda-edit-amount"
                valueCents={amountCents}
                onValueChange={setAmountCents}
              />
            </Field>
          )}

          {isPayday ? (
            <Field
              label="Deposit to"
              htmlFor="agenda-edit-account"
              hint="Stays the same for future paydays until you change it."
            >
              <Select
                id="agenda-edit-account"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                <option value="">Default account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field
            label="Date"
            htmlFor="agenda-edit-date"
            error={fields.date}
            hint={
              event.recurring
                ? "Moves this series. The payment repeats on the new date."
                : "The single date this appears."
            }
            required
          >
            <Input
              id="agenda-edit-date"
              type="date"
              value={occurrenceDate}
              onChange={(event) => setOccurrenceDate(event.target.value)}
            />
          </Field>

          {error ? (
            <p role="alert" className="rounded-lg bg-negative-soft px-3 py-2 text-xs text-negative">
              {error}
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}