"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Textarea } from "@/components/ui/input";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/utils/money";
import { DeleteTransactionButton, type DeletableTransaction } from "./delete-transaction-button";
import type { CalendarEventInput } from "./calendar-view";

/** Event sources whose single occurrence can be hidden without deleting the rule. */
const SKIPPABLE = new Set(["bill", "emi", "sip", "recurring", "payday", "goal"]);

const MIN_NOTE_LENGTH = 3;

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
 * Delete action for one agenda row.
 *
 * Scheduled items (bills, EMIs, subscriptions, paydays, goal contributions) get
 * that specific date hidden while the repeating item survives. Recorded
 * transactions use the standard finalised deletion instead.
 */
export function DeleteAgendaItem({
  event,
  currency,
}: {
  event: CalendarEventInput;
  currency: string;
}) {
  const router = useRouter();
  const { success } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (event.source === "transaction") {
    const id = event.id.startsWith("tx-") ? event.id.slice(3) : event.id;
    const transaction: DeletableTransaction = {
      id,
      date: event.date,
      description: event.title,
      merchant: null,
      type: (event.type as DeletableTransaction["type"] | undefined) ?? "expense",
      amountCents: Math.abs(event.amountCents),
    };
    return <DeleteTransactionButton transaction={transaction} currency={currency} />;
  }

  if (!SKIPPABLE.has(event.source)) return null;

  const { id, date } = parseOccurrenceId(event);
  // Bills, EMIs and SIP plans are all stored in the bills table, so the skip
  // endpoint receives `bill` for each of them.
  const source =
    event.source === "emi" || event.source === "sip" ? "bill" : event.source;

  async function confirmDelete() {
    const trimmed = note.trim();
    if (trimmed.length < MIN_NOTE_LENGTH) {
      setFieldError("Add a short note explaining why you're removing this date.");
      return;
    }
    setPending(true);
    setError(null);
    setFieldError(null);
    try {
      await apiFetch("/api/calendar/skips", {
        method: "POST",
        json: { source, id, date, note: trimmed },
      });
      setOpen(false);
      setPending(false);
      success("Entry removed", "This one date was removed. It still repeats on other dates.");
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
        onClick={() => {
          setNote("");
          setFieldError(null);
          setError(null);
          // A delete that succeeded leaves the dialog closed, so the pending
          // flag has to be cleared here as well: otherwise the next open shows
          // a spinner that never stops and the dialog cannot be dismissed.
          setPending(false);
          setOpen(true);
        }}
        aria-label={`Remove ${event.title} on ${formatDay(date)}`}
        title="Delete this date's entry"
        className="text-muted-foreground transition-colors hover:text-negative"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title="Delete this entry"
        description="Only this one date is removed from your calendar."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void confirmDelete()} loading={pending}>
              Remove this date
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-2 px-4 py-3">
            <p className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {event.title}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-negative">
                {formatMoney(event.amountCents, { currency })}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDay(date)}
              {event.recurring
                ? " · this is one repeated occurrence"
                : " · this item will be gone for good"}
            </p>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            {event.recurring
              ? "The bill, loan or subscription keeps repeating as usual — only this date stops showing."
              : "This is the only occurrence, so removing it clears the item from your calendar."}
          </p>

          <Field
            label="Note"
            htmlFor="occurrence-deletion-note"
            error={fieldError}
            hint="Required. Saved with the record of the deletion."
            required
          >
            <Textarea
              id="occurrence-deletion-note"
              rows={4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Paid via another method this month, bank dispute filed"
              invalid={Boolean(fieldError)}
              disabled={pending}
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