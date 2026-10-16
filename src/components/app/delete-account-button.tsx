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
import { ACCOUNT_TYPE_META, type AccountType } from "@/lib/types";

export type DeletableAccount = {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  currentBalanceCents: number;
};

const MIN_NOTE_LENGTH = 3;

/**
 * Per-account delete action.
 *
 * Deleting is final: the account is permanently removed, and the confirmation
 * dialog requires a closing note that is saved with the record of the deletion.
 * Transactions that touched the account are kept — only their link is cleared.
 */
export function DeleteAccountButton({ account }: { account: DeletableAccount }) {
  const router = useRouter();
  const { success } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  const balance = formatMoney(account.currentBalanceCents, { currency: account.currency });

  function openDialog() {
    setNote("");
    setFieldError(null);
    setOpen(true);
  }

  async function confirmDelete() {
    const trimmed = note.trim();
    if (trimmed.length < MIN_NOTE_LENGTH) {
      setFieldError("Add a short note explaining why you're deleting this account.");
      return;
    }
    setPending(true);
    setFieldError(null);
    try {
      await apiFetch(`/api/accounts/${account.id}`, {
        method: "DELETE",
        json: { note: trimmed },
      });
      setOpen(false);
      success("Account deleted", "The finalisation note was saved with the deletion record.");
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
        aria-label={`Delete ${account.name}`}
        title="Delete account"
        className="text-muted-foreground transition-colors hover:text-negative"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title="Delete account"
        description="This permanently removes the account from your records."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void confirmDelete()} loading={pending}>
              Delete account
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-2 px-4 py-3">
            <p className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {account.name}
              </span>
              <span
                className={cn(
                  "shrink-0 text-sm font-semibold tabular-nums",
                  account.currentBalanceCents < 0 ? "text-negative" : "text-muted-foreground",
                )}
              >
                {balance}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {ACCOUNT_TYPE_META[account.type].label} · {account.currency}
            </p>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Transactions recorded against this account are kept, but they will no
            longer be linked to it. Its balance stops counting towards your net
            worth.
          </p>

          <Field
            label="Finalisation note"
            htmlFor="account-deletion-note"
            error={fieldError}
            hint="Required. Saved permanently with the record of the deletion."
            required
          >
            <Textarea
              id="account-deletion-note"
              rows={4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Closed this account after switching banks"
              invalid={Boolean(fieldError)}
              disabled={pending}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
