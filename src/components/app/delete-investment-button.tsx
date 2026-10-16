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
import { cn } from "@/lib/utils/cn";

export type DeletableInvestment = {
  id: string;
  symbol: string;
  name: string | null;
  quantity: number;
  avgCostCents: number;
  currency: string;
};

const MIN_NOTE_LENGTH = 3;

export function DeleteInvestmentButton({
  investment,
}: {
  investment: DeletableInvestment;
}) {
  const router = useRouter();
  const { success } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  const label = investment.name || investment.symbol;
  const cost = formatMoney(investment.avgCostCents, { currency: investment.currency });

  function openDialog() {
    setNote("");
    setFieldError(null);
    setOpen(true);
  }

  async function confirmDelete() {
    const trimmed = note.trim();
    if (trimmed.length < MIN_NOTE_LENGTH) {
      setFieldError("Add a short note explaining why you're deleting this holding.");
      return;
    }
    setPending(true);
    setFieldError(null);
    try {
      await apiFetch(`/api/investments/${investment.id}`, {
        method: "DELETE",
        json: { note: trimmed },
      });
      setOpen(false);
      success("Holding deleted", "The finalisation note was saved with the deletion record.");
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
        aria-label={`Delete ${investment.symbol}`}
        title="Delete holding"
        className="text-muted-foreground transition-colors hover:text-negative"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title="Delete holding"
        description="This permanently removes the holding from your records."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void confirmDelete()} loading={pending}>
              Delete holding
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-2 px-4 py-3">
            <p className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {investment.symbol}
              </span>
              <span className={cn("shrink-0 text-sm font-semibold tabular-nums text-muted-foreground")}>
                {investment.quantity.toFixed(2)} @ {cost}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {label}
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
              placeholder="e.g. Sold all shares, closed the position"
              invalid={Boolean(fieldError)}
              disabled={pending}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
