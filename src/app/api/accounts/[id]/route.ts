import { z } from "zod";
import { route, ok, parseBody, ApiError } from "@/lib/api";
import { getAccount, updateAccount, deleteAccount, type AccountInput } from "@/lib/repo/accounts";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_META } from "@/lib/types";

const schema = z.object({
  name: z.string().trim().min(1, "Give this account a name.").optional(),
  type: z.enum(ACCOUNT_TYPES).optional(),
  institution: z.string().trim().max(80).nullable().optional(),
  /**
   * The balance the user wants the account to show right now. The stored
   * opening balance is adjusted by the difference so the derived balance lands
   * exactly on this value. Liabilities are entered as a positive "owed" figure.
   */
  balanceCents: z.number().int().optional(),
  creditLimitCents: z.number().int().min(0).optional(),
  currency: z.string().trim().length(3).optional(),
  note: z.string().trim().max(280).nullable().optional(),
  includeInNetWorth: z.boolean().optional(),
});

const DELETE_SCHEMA = z.object({
  note: z
    .string()
    .trim()
    .min(3, "Add a short note explaining why this account is being deleted.")
    .max(280, "Keep the note under 280 characters."),
});

/**
 * Updates an account's details and/or its current balance.
 *
 * Balances are derived, so setting one means shifting `opening_balance_cents`
 * by the gap between the requested value and the balance the ledger currently
 * produces. That keeps history intact while making the number match reality.
 */
export const PATCH = route(async (request, user, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const body = await parseBody(request, schema);

  const existing = await getAccount(user.id, id);
  if (!existing) {
    throw ApiError.notFound("That account no longer exists.");
  }

  const effectiveType = body.type ?? existing.type;
  const isLiability = ACCOUNT_TYPE_META[effectiveType].kind === "liability";

  const update: Partial<AccountInput> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.type !== undefined) update.type = body.type;
  if (body.institution !== undefined) update.institution = body.institution;
  if (body.creditLimitCents !== undefined) update.creditLimitCents = body.creditLimitCents;
  if (body.currency !== undefined) update.currency = body.currency;
  if (body.note !== undefined) update.note = body.note;
  if (body.includeInNetWorth !== undefined) update.includeInNetWorth = body.includeInNetWorth;

  if (body.balanceCents !== undefined) {
    const target = isLiability ? -Math.abs(body.balanceCents) : body.balanceCents;
    const delta = target - existing.currentBalanceCents;
    update.openingBalanceCents = existing.openingBalanceCents + delta;
  } else if (body.type !== undefined) {
    // Keep the opening balance aligned with the account's new kind.
    update.openingBalanceCents = existing.openingBalanceCents;
  }

  const account = await updateAccount(user.id, id, update);
  if (!account) {
    throw ApiError.notFound("That account no longer exists.");
  }
  return ok({ account });
});

/**
 * Deletes an account.
 *
 * The account's final snapshot is recorded in `account_deletions` first, then
 * the row is removed. Transactions that referenced it are kept; their account
 * link is cleared by the foreign key so history stays intact.
 */
export const DELETE = route(async (request, user, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const body = await parseBody(request, DELETE_SCHEMA);

  const deleted = await deleteAccount(user.id, id, body.note);
  if (!deleted) {
    throw ApiError.notFound("That account no longer exists.");
  }
  return ok({ deleted: true });
});
