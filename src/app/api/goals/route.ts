import { z } from "zod";
import { route, ok, parseBody } from "@/lib/api";
import { createGoal } from "@/lib/repo/goals";
import { PRIORITIES } from "@/lib/types";

const schema = z.object({
  name: z.string().trim().min(1, "Give this goal a name."),
  description: z.string().trim().max(280).nullable().optional(),
  targetCents: z.number().int().positive("Enter what you are saving towards."),
  targetDate: z.string().nullable().optional(),
  monthlyContributionCents: z.number().int().min(0).optional(),
  priority: z.enum(PRIORITIES).optional(),
  accountId: z.string().nullable().optional(),
});

/**
 * Creates a savings goal.
 *
 * A non-zero monthly contribution puts this goal on the calendar, so the
 * amount is what makes a goal appear in the schedule.
 */
export const POST = route(async (request, user) => {
  const body = await parseBody(request, schema);

  const goal = await createGoal(user.id, {
    name: body.name,
    description: body.description ?? null,
    targetCents: body.targetCents,
    targetDate: body.targetDate ?? null,
    monthlyContributionCents: body.monthlyContributionCents ?? 0,
    priority: body.priority ?? "medium",
    accountId: body.accountId ?? null,
  });

  return ok({ goal }, 201);
});