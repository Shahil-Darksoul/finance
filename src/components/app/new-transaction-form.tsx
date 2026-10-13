"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  HandCoins,
  LineChart,
  RotateCcw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge, Card, CardBody, CardHeader, type BadgeTone } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/input";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { toISODate } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { TRANSACTION_TYPE_META, type TransactionType } from "@/lib/types";

export type NewTransactionFormProps = {
  accounts: { id: string; name: string; type: string }[];
  categories: { id: string; name: string }[];
};

type TypeOption = {
  value: TransactionType;
  hint: string;
  /** Copy shown under the amount input for this type. */
  amountHint: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
};

const TYPES: TypeOption[] = [
  { value: "expense", hint: "Money leaving an account", amountHint: "What you paid.", icon: TrendingDown },
  { value: "income", hint: "Money arriving", amountHint: "What you received.", icon: TrendingUp },
  { value: "refund", hint: "Money returned to you", amountHint: "How much came back.", icon: RotateCcw },
  { value: "lending", hint: "Money you gave someone", amountHint: "How much you gave.", icon: HandCoins },
  { value: "investment", hint: "Money invested into assets", amountHint: "How much you invested.", icon: LineChart },
  { value: "transfer", hint: "Moved between your accounts", amountHint: "How much is moving.", icon: ArrowLeftRight },
];

/** Rendering details for every tone used by the type picker. */
const TYPE_STYLES: Record<
  string,
  {
    card: string;
    cardSelected: string;
    iconIdle: string;
    iconActive: string;
    bar: string;
    hintIdle: string;
    badge: BadgeTone;
    iconText: string;
    amount: string;
  }
> = {
  negative: {
    card: "border-border bg-surface hover:border-negative/50 hover:bg-negative-soft",
    cardSelected: "border-transparent bg-negative-soft ring-2 ring-negative shadow-sm",
    iconIdle: "bg-negative-soft text-negative group-hover:bg-negative/15",
    iconActive: "bg-negative text-background",
    bar: "bg-negative",
    hintIdle: "text-muted-foreground",
    badge: "negative",
    iconText: "text-negative",
    amount: "text-negative",
  },
  positive: {
    card: "border-border bg-surface hover:border-positive/50 hover:bg-positive-soft",
    cardSelected: "border-transparent bg-positive-soft ring-2 ring-positive shadow-sm",
    iconIdle: "bg-positive-soft text-positive group-hover:bg-positive/15",
    iconActive: "bg-positive text-background",
    bar: "bg-positive",
    hintIdle: "text-muted-foreground",
    badge: "positive",
    iconText: "text-positive",
    amount: "text-positive",
  },
  warning: {
    card: "border-border bg-surface hover:border-warning/50 hover:bg-warning-soft",
    cardSelected: "border-transparent bg-warning-soft ring-2 ring-warning shadow-sm",
    iconIdle: "bg-warning-soft text-warning group-hover:bg-warning/15",
    iconActive: "bg-warning text-neutral-900",
    bar: "bg-warning",
    hintIdle: "text-muted-foreground",
    badge: "warning",
    iconText: "text-warning",
    amount: "text-warning",
  },
  info: {
    card: "border-border bg-surface hover:border-info/50 hover:bg-info-soft",
    cardSelected: "border-transparent bg-info-soft ring-2 ring-info shadow-sm",
    iconIdle: "bg-info-soft text-info group-hover:bg-info/15",
    iconActive: "bg-info text-background",
    bar: "bg-info",
    hintIdle: "text-muted-foreground",
    badge: "info",
    iconText: "text-info",
    amount: "text-info",
  },
  accent: {
    card: "border-border bg-surface hover:border-accent/50 hover:bg-accent-soft",
    cardSelected: "border-transparent bg-accent-soft ring-2 ring-accent shadow-sm",
    iconIdle: "bg-accent-soft text-accent group-hover:bg-accent/15",
    iconActive: "bg-accent text-background",
    bar: "bg-accent",
    hintIdle: "text-muted-foreground",
    badge: "accent",
    iconText: "text-accent",
    amount: "text-accent",
  },
  muted: {
    card: "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
    cardSelected: "border-transparent bg-surface-3 ring-2 ring-border-strong shadow-sm",
    iconIdle: "bg-surface-3 text-muted",
    iconActive: "bg-foreground text-background",
    bar: "bg-muted",
    hintIdle: "text-muted-foreground",
    badge: "neutral",
    iconText: "text-muted-foreground",
    amount: "text-foreground",
  },
};

const CASH_COPY: Record<"in" | "out" | "none", string> = {
  out: "Leaves the account you pick below.",
  in: "Arrives in the account you pick below.",
  none: "Moves between your own accounts — totals stay the same.",
};

/** Create form for a single transaction. */
export function NewTransactionForm({ accounts, categories }: NewTransactionFormProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});

  const [type, setType] = React.useState<TransactionType>("expense");
  const [amountCents, setAmountCents] = React.useState(0);

  const optionRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const meta = TRANSACTION_TYPE_META[type];
  const style = TYPE_STYLES[meta.tone] ?? TYPE_STYLES.muted;
  const selected = TYPES.find((option) => option.value === type) ?? TYPES[0];
  const SelectedIcon = selected.icon;

  function selectType(next: TransactionType) {
    setType(next);
  }

  /** Arrow-key navigation across the radio group (roving tabindex). */
  function onTypeKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = TYPES.findIndex((option) => option.value === type);
    if (index < 0) return;

    let next = index;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (index + 1) % TYPES.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (index - 1 + TYPES.length) % TYPES.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = TYPES.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    setType(TYPES[next].value);
    optionRefs.current[next]?.focus();
  }

  const sign = meta.cashImpact === "out" ? "−" : meta.cashImpact === "in" ? "+" : "";
  const preview = amountCents > 0 ? `${sign}${formatMoney(amountCents)}` : "—";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const form = new FormData(event.currentTarget);

    try {
      await apiFetch("/api/transactions", {
        method: "POST",
        json: {
          type,
          amountCents,
          date: String(form.get("date") ?? ""),
          accountId: String(form.get("accountId") ?? ""),
          categoryId: String(form.get("categoryId") ?? "") || null,
          description: String(form.get("description") ?? "").trim() || null,
          merchant: String(form.get("merchant") ?? "").trim() || null,
          notes: String(form.get("notes") ?? "").trim() || null,
        },
      });
      router.push("/transactions");
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
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Link
        href="/transactions"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to transactions
      </Link>

      <div>
        <h1 className="text-lg font-semibold">Record a transaction</h1>
        <p className="text-xs text-muted-foreground">
          One movement of money. Your balances update immediately.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-negative-soft px-3 py-2 text-xs text-negative">
          {error}
        </p>
      ) : null}

      <div>
        <div
          role="radiogroup"
          aria-label="Transaction type"
          onKeyDown={onTypeKeyDown}
          className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6"
        >
          {TYPES.map((option, index) => {
            const isSelected = type === option.value;
            const optionStyle = TYPE_STYLES[TRANSACTION_TYPE_META[option.value].tone] ?? TYPE_STYLES.muted;
            const Icon = option.icon;

            return (
              <button
                key={option.value}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => selectType(option.value)}
                className={cn(
                  "group relative flex flex-col gap-2 overflow-hidden rounded-xl border p-3 pt-3.5 text-left",
                  "transition-[background-color,border-color,box-shadow,transform] duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "active:scale-[0.98]",
                  isSelected ? optionStyle.cardSelected : optionStyle.card,
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-0 top-0 h-1 origin-left transition-transform duration-200",
                    isSelected ? "scale-x-100" : "scale-x-0",
                    optionStyle.bar,
                  )}
                />
                <span
                  aria-hidden
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150",
                    isSelected ? optionStyle.iconActive : optionStyle.iconIdle,
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="text-sm font-medium leading-none text-foreground">
                  {TRANSACTION_TYPE_META[option.value].label}
                </span>
                <span
                  className={cn(
                    "text-xs leading-snug",
                    isSelected ? "text-foreground/75" : optionStyle.hintIdle,
                  )}
                >
                  {option.hint}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition-all duration-200",
                    isSelected ? "scale-100 opacity-100" : "scale-50 opacity-0",
                  )}
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-border bg-surface-2 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Badge tone={style.badge}>{meta.label}</Badge>
            <span className="text-xs text-muted-foreground">
              {type === "lending"
                ? "Leaves the account, but still counts as owed to you."
                : CASH_COPY[meta.cashImpact]}
            </span>
          </div>
          <span
            className={cn("text-sm font-semibold tabular-nums", amountCents > 0 ? style.amount : "text-muted-foreground")}
            aria-live="polite"
          >
            {preview}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Details"
          icon={<SelectedIcon className={cn("h-4 w-4", style.iconText)} aria-hidden />}
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Amount"
              htmlFor="amount"
              error={fields.amountCents}
              hint={selected.amountHint}
              required
            >
              <MoneyInput id="amount" valueCents={amountCents} onValueChange={setAmountCents} />
            </Field>
            <Field label="Date" htmlFor="date" error={fields.date} required>
              <Input
                id="date"
                name="date"
                type="date"
                defaultValue={toISODate(new Date())}
                invalid={Boolean(fields.date)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Account" htmlFor="accountId" error={fields.accountId} required>
              <Select id="accountId" name="accountId" defaultValue="" invalid={Boolean(fields.accountId)}>
                <option value="">Choose an account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category" htmlFor="categoryId" hint="Optional.">
              <Select id="categoryId" name="categoryId" defaultValue="">
                <option value="">Not specified</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Description" htmlFor="description" hint="Optional.">
            <Input id="description" name="description" placeholder="Groceries" />
          </Field>

          <Field label="Merchant" htmlFor="merchant" hint="Optional.">
            <Input id="merchant" name="merchant" placeholder="Where it happened" />
          </Field>

          <Field label="Notes" htmlFor="notes" hint="Optional.">
            <Textarea id="notes" name="notes" />
          </Field>
        </CardBody>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending}>
          Record {meta.label.toLowerCase()}
        </Button>
        <Link href="/transactions" className={buttonClass({ variant: "ghost" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}