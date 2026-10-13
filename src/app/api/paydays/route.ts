import { z } from "zod";
import { route, ok, parseBody } from "@/lib/api";
import { createPayday } from "@/lib/repo/paydays";
import { PAYDAY_FREQUENCIES } from "@/lib/types";

const schema = z
  .object({
    label: z.string().trim().min(1, "Give this payday a label.").max(80),
    startDate: z.string().min(1, "Pick a start date."),
    frequency: z.enum(PAYDAY_FREQUENCIES).default("biweekly"),
    amountCents: z.number().int().positive("Enter the net amount."),
    secondDay: z.number().int().min(1).max(31).nullable().optional(),
    anchorDay: z.number().int().min(1).max(31).nullable().optional(),
    accountId: z.string().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.frequency === "semimonthly" && value.secondDay == null) {
      ctx.addIssue({
        code: "custom",
        path: ["secondDay"],
        message: "Pick the second day of the month.",
      });
    }
  });

/**
 * Creates a payday schedule. Weekly/biweekly schedules anchor on the start
 * date's weekday; monthly schedules anchor on `anchorDay` (or the start date); 
 * semimonthly schedules pay on the start date and `secondDay`.
 */
export const POST = route(async (request, user) => {
  const body = await parseBody(request, schema);
  const payday = await createPayday(user.id, {
    label: body.label,
    startDate: body.startDate,
    frequency: body.frequency,
    amountCents: body.amountCents,
    secondDay: body.secondDay ?? null,
    anchorDay: body.anchorDay ?? null,
    accountId: body.accountId ?? null,
  });
  return ok({ payday }, 201);
});