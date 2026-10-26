import { z } from "zod";
import { route, ok, parseBody } from "@/lib/api";
import { createBill, replaceEmiSchedule } from "@/lib/repo/bills";
import { buildAmortization } from "@/lib/services/finance/emi";
import { BILL_FREQUENCIES } from "@/lib/types";

const schema = z
  .object({
    name: z.string().trim().min(1, "Give this a name."),
    kind: z.enum(["bill", "emi", "sip"]).default("bill"),
    amountCents: z.number().int().min(0).optional(),
    /**
     * What an investment plan buys. Free-form so it works for any market, not
     * just the tickers this app has a price feed for.
     */
    investmentSymbol: z.string().trim().max(60).nullable().optional(),
    frequency: z.enum(BILL_FREQUENCIES).default("monthly"),
    dueDay: z.number().int().min(1).max(31),
    startDate: z.string().min(1, "Pick a start date."),
    endDate: z.string().nullable().optional(),
    repeat: z.boolean().optional(),
    accountId: z.string().nullable().optional(),
    categoryId: z.string().nullable().optional(),
    autopay: z.boolean().optional(),
    notes: z.string().nullable().optional(),
    // EMI-only inputs.
    principalCents: z.number().int().min(0).optional(),
    annualRatePercent: z.number().min(0).max(200).optional(),
    termMonths: z.number().int().min(1).max(600).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "bill" || value.kind === "sip") {
      if (!value.amountCents || value.amountCents <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["amountCents"],
          message:
            value.kind === "sip"
              ? "Enter the amount you invest each time."
              : "Enter the amount you pay each time.",
        });
      }
    }
    if (value.kind === "sip") {
      if (!value.investmentSymbol?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["investmentSymbol"],
          message: "Name the stock, fund or plan you are investing in.",
        });
      }
      return;
    }
    if (value.kind === "bill") return;

    // For a loan the instalment is derived, so these must be present instead.
    if (!value.principalCents || value.principalCents <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["principalCents"],
        message: "Enter the amount you borrowed.",
      });
    }
    if (!value.termMonths) {
      ctx.addIssue({
        code: "custom",
        path: ["termMonths"],
        message: "Enter the loan term in months.",
      });
    }
    if (value.annualRatePercent === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["annualRatePercent"],
        message: "Enter the annual interest rate. Use 0 for an interest-free loan.",
      });
    }
  });

/**
 * Creates a bill or a loan.
 *
 * A loan also gets its full amortisation schedule written, so the calendar can
 * show each individual instalment instead of a repeating guess, and the
 * remaining principal on the loan always matches the schedule.
 */
export const POST = route(async (request, user) => {
  const body = await parseBody(request, schema);

  const schedule =
    body.kind === "emi"
      ? buildAmortization({
          principalCents: body.principalCents ?? 0,
          annualRatePercent: body.annualRatePercent ?? 0,
          termMonths: body.termMonths ?? 1,
          firstDueDate: body.startDate,
        })
      : null;

  // Repeat off means the item appears once, on its start date. Clamping the
  // recurrence window to a single day makes the calendar agree everywhere.
  const endDate = body.repeat === false ? body.startDate : (body.endDate ?? null);

  const amountCents = schedule ? schedule.monthlyPaymentCents : body.amountCents ?? 0;

  const bill = await createBill(user.id, {
    name: body.name,
    kind: body.kind,
    investmentSymbol:
      body.kind === "sip" ? body.investmentSymbol?.trim().toUpperCase() || null : null,
    amountCents,
    // A loan is repaid monthly by definition; the UI hides the frequency choice.
    frequency: body.kind === "emi" ? "monthly" : body.frequency,
    dueDay: body.dueDay,
    startDate: body.startDate,
    endDate,
    accountId: body.accountId ?? null,
    categoryId: body.categoryId ?? null,
    autopay: body.autopay ?? false,
    notes: body.notes ?? null,
    principalCents: schedule ? body.principalCents ?? null : null,
    annualRate: body.annualRatePercent ?? 0,
    termMonths: body.kind === "emi" ? body.termMonths ?? null : null,
  });

  // Persist the instalment rows so the calendar can show each one at its real
  // amount. EMI payments drift as interest falls, so a repeating monthly figure
  // would be wrong for every instalment after the first. A one-time EMI keeps
  // no schedule: its single occurrence comes from the recurrence rule instead.
  if (schedule && schedule.rows.length > 0 && endDate === null) {
    await replaceEmiSchedule(
      user.id,
      bill.id,
      schedule.rows.map((row) => ({
        dueDate: row.dueDate,
        amountCents: row.paymentCents,
        principalCents: row.principalCents,
        interestCents: row.interestCents,
        balanceAfterCents: row.balanceAfterCents,
      })),
    );
  }

  return ok({ bill, schedule: schedule?.rows ?? null }, 201);
});