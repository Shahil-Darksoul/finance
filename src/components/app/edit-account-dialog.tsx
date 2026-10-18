"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, MoneyInput, Select, Switch, Textarea } from "@/components/ui/input";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_META, type AccountType } from "@/lib/types";

export type EditableAccount = {
  id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  currency: string;
  currentBalanceCents: number;
  creditLimitCents: number;
  note: string | null;
  includeInNetWorth: boolean;
};

const LIABILITY_TYPES = new Set<AccountType>(["credit_card", "loan"]);

/**
 * Per-account edit action. The balance shown is what the account should read
 * right now; the API shifts the opening balance so the derived balance lands on
 * it. The note is optional.
 */
export function EditAccountDialog({ account }: { account: EditableAccount }) {
  const router = useRouter();
  const { success } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});

  const [name, setName] = React.useState(account.name);
  const [type, setType] = React.useState<AccountType>(account.type);
  const [institution, setInstitution] = React.useState(account.institution ?? "");
  const [balanceCents, setBalanceCents] = React.useState(account.currentBalanceCents);
  const [creditLimitCents, setCreditLimitCents] = React.useState(account.creditLimitCents);
  const [includeInNetWorth, setIncludeInNetWorth] = React.useState(account.includeInNetWorth);
  const [note, setNote] = React.useState(account.note ?? "");

  const isLiability = LIABILITY_TYPES.has(type);
  const currency = "CAD";

  function openDialog() {
    setName(account.name);
    setType(account.type);
    setInstitution(account.institution ?? "");
    setBalanceCents(
      LIABILITY_TYPES.has(account.type)
        ? Math.abs(account.currentBalanceCents)
        : account.currentBalanceCents,
    );
    setCreditLimitCents(account.creditLimitCents);
    setIncludeInNetWorth(account.includeInNetWorth);
    setNote(account.note ?? "");
    setError(null);
    setFields({});
    setOpen(true);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});
    try {
      await apiFetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        json: {
          name: name.trim(),
          type,
          institution: institution.trim() || null,
          currency,
          balanceCents,
          creditLimitCents: isLiability ? creditLimitCents : 0,
          note: note.trim() || null,
          includeInNetWorth,
        },
      });
      setOpen(false);
      success("Account updated", `${name.trim()} has been saved.`);
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
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={openDialog}
        aria-label={`Edit ${account.name}`}
        title="Edit account"
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title="Edit account"
        description="Update the balance or details. Your transaction history is kept."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="edit-account-form"
              loading={pending}
            >
              Save changes
            </Button>
          </>
        }
      >
        <form id="edit-account-form" onSubmit={onSubmit} noValidate className="space-y-4">
          {error ? (
            <p role="alert" className="rounded-lg bg-negative-soft px-3 py-2 text-xs text-negative">
              {error}
            </p>
          ) : null}

          <Field label="Name" htmlFor="edit-name" error={fields.name} required>
            <Input
              id="edit-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              invalid={Boolean(fields.name)}
            />
          </Field>

          <Field label="Type" htmlFor="edit-type" required>
            <Select
              id="edit-type"
              value={type}
              onChange={(event) => setType(event.target.value as AccountType)}
            >
              {ACCOUNT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {ACCOUNT_TYPE_META[value].label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Currency" htmlFor="edit-currency" hint="Amounts are stored in CAD.">
            <Input id="edit-currency" value="CAD" readOnly disabled />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={isLiability ? "Current balance owed" : "Current balance"}
              htmlFor="edit-balance"
              hint={isLiability ? "What you owe right now." : "What is in it right now."}
            >
              <MoneyInput
                id="edit-balance"
                valueCents={balanceCents}
                onValueChange={setBalanceCents}
              />
            </Field>
            {isLiability ? (
              <Field label="Credit limit" htmlFor="edit-limit" hint="Optional. Cards only.">
                <MoneyInput
                  id="edit-limit"
                  valueCents={creditLimitCents}
                  onValueChange={setCreditLimitCents}
                />
              </Field>
            ) : (
              <Field label="Institution" htmlFor="edit-institution" hint="Optional.">
                <Input
                  id="edit-institution"
                  value={institution}
                  onChange={(event) => setInstitution(event.target.value)}
                  placeholder="Bank name"
                />
              </Field>
            )}
          </div>

          <Switch
            checked={includeInNetWorth}
            onCheckedChange={setIncludeInNetWorth}
            label="Count towards net worth"
            description="Turn this off for accounts you want tracked but excluded from totals."
          />

          <Field label="Note" htmlFor="edit-note" hint="Optional.">
            <Textarea
              id="edit-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
