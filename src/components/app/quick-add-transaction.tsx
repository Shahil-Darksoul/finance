"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/utils/money";
import { TRANSACTION_TYPE_META, type AccountType, type TransactionType, type UpcomingObligation } from "@/lib/types";

type TxAccount = { id: string; name: string; type: AccountType; currentBalanceCents: number };
type PayMode = "obligation" | "other";
const TYPES: TransactionType[] = ["expense", "income", "refund", "lending", "investment"];

export function QuickAddTransaction({
  open,
  onClose,
  date,
  currency,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  currency: string;
  accounts: TxAccount[];
}) {
  const router = useRouter();
  const { success } = useToast();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<PayMode>("obligation");
  const [obligations, setObligations] = React.useState<UpcomingObligation[]>([]);
  const [loadingObl, setLoadingObl] = React.useState(false);
  const [obligationKey, setObligationKey] = React.useState("");
  const [type, setType] = React.useState<TransactionType>("expense");
  const [amountCents, setAmountCents] = React.useState(0);
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [description, setDescription] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setLoadingObl(true);
    });
    void (async () => {
      try {
        const res = await apiFetch<{ obligations: UpcomingObligation[]; nextPaydayDate: string | null }>(
          "/api/obligations/payable",
          { method: "POST", json: { from: date } },
        );
        if (!active) return;
        const due = res.obligations.filter((o) => ["bill", "emi", "sip"].includes(o.source) && o.amountCents > 0);
        setObligations(due);
        if (due.length === 0) setMode("other");
      } catch {
        if (active) setMode("other");
      } finally {
        if (active) setLoadingObl(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, date]);

  const selected = obligations.find((o) => `${o.source}:${o.id}:${o.dueDate}` === obligationKey);

  function selectObligation(key: string) {
    setObligationKey(key);
    const next = obligations.find((o) => `${o.source}:${o.id}:${o.dueDate}` === key);
    if (!next) return;
    setAmountCents(next.amountCents);
    if (next.accountId) setAccountId(next.accountId);
    setDescription(next.name);
    setType("expense");
  }

  async function submit() {
    setPending(true);
    setError(null);
    try {
        if (mode === "obligation") {
        if (!selected) throw new ApiClientError("Choose a bill, loan or investment to pay.", 400, "bad_request");
        if (amountCents <= 0) throw new ApiClientError("Enter an amount greater than zero.", 400, "bad_request");
        await apiFetch("/api/transactions", {
          method: "POST",
          json: {
            type: "expense",
            amountCents,
            date,
            accountId,
            description: description.trim() || selected.name,
            payObligation: { source: "bill", id: selected.id, date: selected.dueDate },
          },
        });
      } else {
        if (amountCents <= 0) throw new ApiClientError("Enter an amount greater than zero.", 400, "bad_request");
        await apiFetch("/api/transactions", {
          method: "POST",
          json: {
            type,
            amountCents,
            date,
            accountId,
            description: description.trim() || null,
          },
        });
      }
      success("Transaction added");
      onClose();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Something went wrong. Please try again.");
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      title={`Add transaction on ${new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
      description="Record a transaction. Paying a bill/loan/investment reduces that calendar amount."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={() => void submit()} loading={pending}>Add transaction</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <p role="alert" className="rounded-lg bg-negative-soft px-3 py-2 text-xs text-negative">{error}</p> : null}
        <div role="radiogroup" aria-label="Transaction kind" className="grid gap-2 sm:grid-cols-2">
          {([
            ["obligation", "Pay upcoming bill/loan/investment", "Reduces scheduled amount on calendar"],
            ["other", "Other transaction", "Regular income/expense record"],
          ] as const).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={`rounded-xl border p-2.5 text-left ${mode === value ? "border-primary bg-primary-soft" : "border-border bg-surface hover:border-border-strong"}`}
            >
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-[11px] text-muted-foreground">{hint}</span>
            </button>
          ))}
        </div>

        {mode === "obligation" ? (
          <Field
            label="Upcoming bill/loan/investment"
            htmlFor="tx-obligation"
            hint={loadingObl ? "Loading..." : "Bills/EMIs due before next payday; SIPs for this month"}
          >
            <Select id="tx-obligation" value={obligationKey} onChange={(e) => selectObligation(e.target.value)}>
              <option value="">Select an item</option>
              {obligations.map((o) => {
                const key = `${o.source}:${o.id}:${o.dueDate}`;
                return (
                  <option key={key} value={key}>
                    {o.source === "sip" ? "SIP: " : ""}{o.name} · {o.dueDate} · {formatMoney(o.amountCents, { currency })}
                  </option>
                );
              })}
            </Select>
          </Field>
        ) : (
          <Field label="Type" htmlFor="tx-type">
            <Select id="tx-type" value={type} onChange={(e) => setType(e.target.value as TransactionType)}>
              {TYPES.map((t) => <option key={t} value={t}>{TRANSACTION_TYPE_META[t].label}</option>)}
            </Select>
          </Field>
        )}

        <Field label="Amount" htmlFor="tx-amount" required>
          <MoneyInput id="tx-amount" valueCents={amountCents} onValueChange={setAmountCents} />
        </Field>
        <Field label="Account" htmlFor="tx-account" required>
          <Select id="tx-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Select account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Description" htmlFor="tx-desc">
          <Input id="tx-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
        </Field>
        {mode === "obligation" && selected ? (
          <p className="text-xs text-muted-foreground">
            This will record the transaction and reduce {selected.name} on {selected.dueDate} by {formatMoney(amountCents, { currency })} on the calendar.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
