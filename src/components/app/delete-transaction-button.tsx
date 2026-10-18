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
import { DEFAULT_CURRENCY } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { TRANSACTION_TYPE_META, type TransactionType } from "@/lib/types";

export type DeletableTransaction = {
  id: string;
  date: string;
  description: string | null;
  merchant: string | null;
  type: TransactionType;
  amountCents: number;
};

const MIN_NOTE_LENGTH = 3;

/**
 * Per-row delete action. Deleting is final: the transaction is permanently
 * removed, and the confirmation dialog requires a closing note that is saved
 * alongside the record of the deletion.
 */
export function DeleteTransactionButton({
  transaction,
  currency = DEFAULT_CURRENCY,
}: {
  transaction: DeletableTransaction;
  currency?: string;
}) {
  const router = useRouter();
  const { success } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  const meta = TRANSACTION_TYPE_META[transaction.type];
  const label = transaction.description ?? transaction.merchant ?? meta.label;
  const tone =
    meta.cashImpact === "in"
      ? "text-positive"
      : meta.cashImpact === "out"
        ? "text-negative"
        : "text-muted-foreground";
  const amount = formatMoney(
    meta.cashImpact === "out" ? -transaction.amountCents : transaction.amountCents,
    {
      currency,
      signed: transaction.type !== "transfer",
    },
  );

  function openDialog() {
    setNote("");
    setFieldError(null);
    setOpen(true);
  }

  async function confirmDelete() {
    const trimmed = note.trim();
    if (trimmed.length < MIN_NOTE_LENGTH) {
      setFieldError("Add a short note explaining why you're deleting this transaction.");
      return;
    }
    setPending(true);
    setFieldError(null);
    try {
      await apiFetch(`/api/transactions/${transaction.id}`, {
        method: "DELETE",
        json: { note: trimmed },
      });
      setOpen(false);
      success("Transaction deleted", "The finalisation note was saved with the deletion record.");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setFieldError(caught.message);
      } else {
        setFieldError("Something went wrong. Please try again.");
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
        aria-label={`Delete ${label}`}
        title="Delete transaction"
        className="text-muted-foreground transition-colors hover:text-negative"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title="Delete transaction"
        description="This permanently removes the entry from your records."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void confirmDelete()} loading={pending}>
              Delete transaction
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-2 px-4 py-3">
            <p className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {label}
              </span>
              <span className={cn("shrink-0 text-sm font-semibold tabular-nums", tone)}>
                {amount}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(transaction.date + "T00:00:00").toLocaleDateString()} · {meta.label}
            </p>
          </div>

          <Field
            label="Finalisation note"
            htmlFor="deletion-note"
            error={fieldError}
            hint="Required. Saved permanently with the record of the deletion."
            required
          >
            <Textarea
              id="deletion-note"
              rows={4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Entered twice by mistake, superseded by a corrected entry"
              invalid={Boolean(fieldError)}
              disabled={pending}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}