"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, MoneyInput } from "@/components/ui/input";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import type { Bill } from "@/lib/types";
import { formatMoney } from "@/lib/utils/money";

export function BillActions({ bill, currency }: { bill: Bill; currency: string }) {
  const router = useRouter();
  const { success } = useToast();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState(bill.name);
  const [amountCents, setAmountCents] = React.useState(bill.amountCents);
  const [investmentSymbol, setInvestmentSymbol] = React.useState(
    bill.investmentSymbol ?? "",
  );

  function openEdit() {
    setName(bill.name);
    setAmountCents(bill.amountCents);
    setInvestmentSymbol(bill.investmentSymbol ?? "");
    setError(null);
    // A save that succeeded leaves the dialog closed, so the pending flag has
    // to be cleared here as well: otherwise the next open shows a spinner that
    // never stops and the dialog cannot be dismissed.
    setPending(false);
    setEditOpen(true);
  }

  function openDelete() {
    setError(null);
    setPending(false);
    setDeleteOpen(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/bills/${bill.id}`, {
        method: "PATCH",
        json: {
          title: name.trim(),
          amountCents: bill.kind === "emi" ? undefined : amountCents,
          investmentSymbol:
            bill.kind === "sip" ? investmentSymbol.trim().toUpperCase() || null : undefined,
        },
      });
      setEditOpen(false);
      setPending(false);
      success("Bill updated");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(caught.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
      setPending(false);
    }
  }

  async function confirmDelete() {
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/bills/${bill.id}`, {
        method: "DELETE",
      });
      setDeleteOpen(false);
      setPending(false);
      success("Bill deleted");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(caught.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
      setPending(false);
    }
  }

  return (
    <>
      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Bill actions"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
        {menuOpen ? (
          <div
            className="absolute right-0 z-20 mt-1 w-36 rounded-xl border border-border bg-surface p-1 shadow-lg"
            onMouseLeave={() => setMenuOpen(false)}
          >
            <button
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
              onClick={() => {
                setMenuOpen(false);
                openEdit();
              }}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-negative hover:bg-surface-2"
              onClick={() => {
                setMenuOpen(false);
                openDelete();
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        ) : null}
      </div>

      <Modal
        open={editOpen}
        onClose={() => {
          if (!pending) setEditOpen(false);
        }}
        title="Edit bill"
        description={
          bill.kind === "emi"
            ? "EMI amount is calculated from loan terms."
            : "Update details for this recurring item."
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="bill-edit-form" loading={pending}>
              Save
            </Button>
          </>
        }
      >
        <form id="bill-edit-form" onSubmit={saveEdit} className="space-y-3">
          {error ? <p className="text-xs text-negative">{error}</p> : null}
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          {bill.kind === "sip" ? (
            <Field label="Investment symbol / plan">
              <Input
                value={investmentSymbol}
                onChange={(e) => setInvestmentSymbol(e.target.value.toUpperCase())}
                placeholder="e.g. VOO, NIFTYBEES"
              />
            </Field>
          ) : null}
          {bill.kind !== "emi" ? (
            <Field label="Amount">
              <MoneyInput
                currency={currency}
                valueCents={amountCents}
                onValueChange={setAmountCents}
              />
            </Field>
          ) : (
            <p className="text-xs text-muted-foreground">
              Amount: {formatMoney(bill.amountCents, { currency })}
            </p>
          )}
        </form>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => {
          if (!pending) setDeleteOpen(false);
        }}
        title="Delete bill"
        description="This permanently removes this bill/EMI/SIP from your records."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void confirmDelete()} loading={pending}>
              Delete
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          {error ? <p className="text-xs text-negative">{error}</p> : null}
          <p className="text-sm">
            Delete <span className="font-medium">{bill.name}</span> (
            {formatMoney(bill.amountCents, { currency })})?
          </p>
        </div>
      </Modal>
    </>
  );
}
