import { z } from "zod";
import { route, ok, parseBody, ApiError } from "@/lib/api";
import {
  getBill,
  updateBill,
  listEmiPayments,
  replaceEmiSchedule,
  type BillInput,
} from "@/lib/repo/bills";
import { buildAmortization } from "@/lib/services/finance/emi";

type BillPatch = Partial<BillInput> & {
  paymentsMade?: number;
  currentPrincipalCents?: number;
};

const schema = z.object({
  title: z.string().trim().min(1, "Give this a name.").max(120).optional(),
  amountCents: z.number().int().positive("Enter the amount.").optional(),
  date: z.string().min(1, "Pick a date.").optional(),
});

function dayOfMonth(value: string): number {
  const day = new Date(`${value}T00:00:00`).getDate();
  return Number.isFinite(day) ? day : 0;
}

/**
 * Edits a bill or loan from the calendar.
 *
 * A title and amount update the commitment itself. Changing the date moves the
 * payment: for a one-off item the single occurrence moves; for a repeating bill
 * the series re-anchors on the new date. A loan that keeps a stored instalment
 * schedule gets that schedule rebuilt from the new first due date, so the
 * amortisation table and the calendar always agree.
 */
export const PATCH = route(async (request, user, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const body = await parseBody(request, schema);

  const bill = await getBill(user.id, id);
  if (!bill) throw ApiError.notFound("That payment no longer exists.");

  // EMI instalments are derived from the loan terms, never entered by hand.
  if (bill.kind === "emi" && body.amountCents !== undefined) {
    throw new ApiError(
      "An EMI instalment is calculated from the loan terms, so the amount can't be edited here. Edit the loan itself instead.",
      400,
      "bad_request",
    );
  }

  const patch: BillPatch = {};
  if (body.title !== undefined) patch.name = body.title;
  if (bill.kind !== "emi" && body.amountCents !== undefined) {
    patch.amountCents = body.amountCents;
  }

  if (body.date !== undefined) {
    const day = dayOfMonth(body.date);
    if (day < 1) throw new ApiError("Enter a valid date.", 400, "bad_request");

    const oneOff = bill.startDate === bill.endDate;

    if (bill.kind === "emi") {
      const schedule = await listEmiPayments(user.id, bill.id);
      const principalCents = bill.principalCents ?? 0;
      if (schedule.length > 0 && principalCents > 0) {
        const rebuilt = buildAmortization({
          principalCents,
          annualRatePercent: bill.annualRate,
          termMonths: bill.termMonths ?? 1,
          firstDueDate: body.date,
        });
        await replaceEmiSchedule(
          user.id,
          bill.id,
          rebuilt.rows.map((row) => ({
            dueDate: row.dueDate,
            amountCents: row.paymentCents,
            principalCents: row.principalCents,
            interestCents: row.interestCents,
            balanceAfterCents: row.balanceAfterCents,
          })),
        );
        patch.startDate = body.date;
        patch.endDate = null;
        patch.dueDay = day;
        patch.paymentsMade = 0;
        patch.currentPrincipalCents = principalCents;
      } else if (oneOff) {
        patch.startDate = body.date;
        patch.endDate = body.date;
        patch.dueDay = day;
      } else {
        patch.startDate = body.date;
        patch.dueDay = day;
      }
    } else if (oneOff) {
      patch.startDate = body.date;
      patch.endDate = body.date;
      patch.dueDay = day;
    } else {
      patch.startDate = body.date;
      patch.dueDay = day;
    }
  }

  const updated = await updateBill(user.id, id, patch);
  if (!updated) throw ApiError.notFound("That payment no longer exists.");
  return ok({ bill: updated });
});