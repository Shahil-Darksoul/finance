import { z } from "zod";
import { route, ok, parseBody, ApiError } from "@/lib/api";
import { getPayday, updatePayday, deletePayday } from "@/lib/repo/paydays";
import type { PaydayInput } from "@/lib/repo/paydays";
import {
  setOccurrenceOverride,
  deleteOccurrenceOverride,
  listOccurrenceOverrides,
} from "@/lib/repo/occurrence-overrides";
import {
  setPaydayIncome,
  removePaydayIncome,
  deletePaydayIncome,
  moveFuturePaydayIncome,
  resolveDepositAccount,
} from "@/lib/services/finance/payday";

const patchSchema = z.object({
  label: z.string().trim().min(1, "Give this payday a label.").max(80).optional(),
  amountCents: z.number().int().positive("Enter the net amount.").optional(),
  startDate: z.string().min(1, "Pick a start date.").optional(),
  anchorDay: z.number().int().min(1).max(31).nullable().optional(),
  secondDay: z.number().int().min(1).max(31).nullable().optional(),
  active: z.boolean().optional(),
  /** The account future checks from this schedule are deposited into. */
  accountId: z.string().nullable().optional(),
  /** When set, `amountCents` applies to this one date instead of the schedule. */
  occurrenceDate: z.string().min(1, "Pick a date.").optional(),
  /** Drop the per-date amount for this occurrence (falls back to the default). */
  removeOccurrenceDate: z.string().min(1).optional(),
});

function dayOfMonth(value: string): number {
  const day = new Date(`${value}T00:00:00`).getDate();
  return Number.isFinite(day) ? day : 0;
}

/** Edits a payday in place. Monthly schedules follow the new start date. */
export const PATCH = route(async (request, user, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const body = await parseBody(request, patchSchema);

  const existing = await getPayday(user.id, id);
  if (!existing) throw ApiError.notFound("That payday no longer exists.");

  // A per-date amount is stored as an occurrence override, leaving the default
  // schedule (and every other date) untouched. The check is also recorded as an
  // income transaction so the calendar feeds "Income this month" and net worth.
  if (body.occurrenceDate !== undefined) {
    if (body.amountCents === undefined) {
      throw new ApiError("Enter the amount for this date.", 400, "bad_request");
    }
    await setOccurrenceOverride(user.id, "payday", id, body.occurrenceDate, body.amountCents);
    await setPaydayIncome(user.id, existing, body.occurrenceDate, body.amountCents);
  }
  if (body.removeOccurrenceDate !== undefined) {
    await deleteOccurrenceOverride(user.id, "payday", id, body.removeOccurrenceDate);
    await removePaydayIncome(user.id, existing, body.removeOccurrenceDate);
  }

  const patch: Partial<PaydayInput> & { active?: boolean } = {};
  if (body.label !== undefined) patch.label = body.label;
  if (body.startDate !== undefined) patch.startDate = body.startDate;
  if (body.anchorDay !== undefined) patch.anchorDay = body.anchorDay;
  if (body.secondDay !== undefined) patch.secondDay = body.secondDay;
  if (body.active !== undefined) patch.active = body.active;
  if (body.accountId !== undefined) patch.accountId = body.accountId;
  // `amountCents` was already routed to the per-date override when a date was
  // given; only apply it to the schedule otherwise.
  if (body.occurrenceDate === undefined && body.amountCents !== undefined) {
    patch.amountCents = body.amountCents;
  }
  if (body.startDate && existing.frequency === "monthly" && patch.anchorDay === undefined) {
    patch.anchorDay = dayOfMonth(body.startDate) || undefined;
  }

  const payday = await updatePayday(user.id, id, patch);
  if (!payday) throw ApiError.notFound("That payday no longer exists.");

  // A deposit-account change only affects checks from today forward: past paydays
  // already landed in the account they actually hit. Clearing it falls back to
  // the user's first spendable account.
  if (body.accountId !== undefined && body.accountId !== existing.accountId) {
    const target = body.accountId ?? (await resolveDepositAccount(user.id, null));
    if (target) await moveFuturePaydayIncome(user.id, id, target);
  }

  return ok({ payday });
});

export const DELETE = route(async (_request, user, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const existing = await getPayday(user.id, id);
  if (!existing) throw ApiError.notFound("That payday no longer exists.");

  // Remove income recorded for this payday along with the payday itself, and
  // drop its per-date overrides (they have no FK and would otherwise linger).
  await deletePaydayIncome(user.id, id);
  const overrides = await listOccurrenceOverrides(user.id);
  for (const override of overrides) {
    if (override.sourceType === "payday" && override.sourceId === id) {
      await deleteOccurrenceOverride(user.id, "payday", id, override.date);
    }
  }

  const deleted = await deletePayday(user.id, id);
  if (!deleted) throw ApiError.notFound("That payday no longer exists.");
  return ok({ deleted: true });
});