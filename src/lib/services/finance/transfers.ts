import { getAccount } from "@/lib/repo/accounts";
import { ensureCategoryByName } from "@/lib/repo/categories";
import { createTransaction } from "@/lib/repo/transactions";
import {
  ACCOUNT_TYPE_META,
  DEBT_PAYMENT_CATEGORY_NAMES,
  type Transaction,
} from "@/lib/types";
import { formatMoney } from "@/lib/utils/money";

/** A transfer cannot be written; the message is safe to show to the user. */
export class TransferError extends Error {
  constructor(
    message: string,
    readonly field?: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "TransferError";
  }
}

export type CreateTransferInput = {
  amountCents: number;
  date: string;
  fromAccountId: string;
  toAccountId: string;
  description?: string | null;
  notes?: string | null;
  status?: "cleared" | "pending";
};

/**
 * Moves money between two accounts as one ledger row.
 *
 * A transfer row debits `accountId` and credits `relatedAccountId`, so both
 * balances change in the same insert: there is no second write to fail and the
 * movement is atomic. When the destination is a loan or credit card the row is
 * also categorised as an expense, because cash left the household to reduce
 * debt. Transfers between asset accounts stay neutral.
 */
export async function createTransfer(
  userId: string,
  input: CreateTransferInput,
): Promise<Transaction> {
  const amountCents = Math.abs(Math.trunc(input.amountCents));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new TransferError("Enter an amount greater than zero.", "amountCents");
  }
  if (input.fromAccountId === input.toAccountId) {
    throw new TransferError(
      "Choose two different accounts for a transfer.",
      "toAccountId",
    );
  }

  const [source, destination] = await Promise.all([
    getAccount(userId, input.fromAccountId),
    getAccount(userId, input.toAccountId),
  ]);
  if (!source) {
    throw new TransferError("That source account is not available.", "accountId", 404);
  }
  if (!destination) {
    throw new TransferError(
      "That destination account is not available.",
      "toAccountId",
      404,
    );
  }

  const sourceKind = ACCOUNT_TYPE_META[source.type].kind;
  const destinationKind = ACCOUNT_TYPE_META[destination.type].kind;

  // Only cash-like sources can run short. A liability source is a cash advance:
  // its negative balance is the debt itself, not a spending limit.
  if (sourceKind === "asset" && source.currentBalanceCents < amountCents) {
    throw new TransferError(
      `${source.name} only has ${formatMoney(source.currentBalanceCents, {
        currency: source.currency,
      })} available, so ${formatMoney(amountCents, {
        currency: source.currency,
      })} cannot be transferred.`,
      "amountCents",
    );
  }

  let categoryId: string | null = null;
  if (destinationKind === "liability") {
    const categoryName =
      destination.type === "credit_card"
        ? DEBT_PAYMENT_CATEGORY_NAMES.credit_card
        : DEBT_PAYMENT_CATEGORY_NAMES.loan;
    const category = await ensureCategoryByName({
      userId,
      name: categoryName,
      kind: "expense",
      color: "#f43f5e",
      icon: destination.type === "credit_card" ? "CreditCard" : "Landmark",
    });
    categoryId = category.id;
  }

  return createTransaction(userId, {
    type: "transfer",
    amountCents,
    date: input.date,
    accountId: source.id,
    relatedAccountId: destination.id,
    // Regular transfers are not spending, so they carry no expense category.
    categoryId,
    description:
      input.description?.trim() ||
      (destinationKind === "liability"
        ? `Payment to ${destination.name}`
        : `Transfer to ${destination.name}`),
    notes: input.notes ?? null,
    status: input.status ?? "cleared",
  });
}
