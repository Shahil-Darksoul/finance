import { z } from "zod";
import { route, ok, parseBody, ApiError } from "@/lib/api";
import {
  addOccurrenceSkip,
  type OccurrenceSkipSource,
} from "@/lib/repo/occurrence-skips";
import { getBill } from "@/lib/repo/bills";
import { getRecurring } from "@/lib/repo/recurring";
import { getPayday } from "@/lib/repo/paydays";
import { getGoal } from "@/lib/repo/goals";

const schema = z.object({
  // `bill` covers bills, EMIs and SIP plans (all stored in the bills table).
  source: z.enum(["bill", "recurring", "payday", "goal"]),
  id: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date."),
  note: z.string().trim().min(3, "Add a short note explaining why you're removing this date.").max(280),
});

const exists = new Map<OccurrenceSkipSource, (userId: string, id: string) => Promise<unknown>>([
  ["bill", getBill],
  ["recurring", getRecurring],
  ["payday", getPayday],
  ["goal", getGoal],
]);

/**
 * Removes a single scheduled occurrence from the calendar.
 *
 * Only that date is hidden; the repeating rule stays active for every other
 * month. The source table is checked so a skip can never be aimed at something
 * that is not theirs.
 */
export const POST = route(async (request, user) => {
  const body = await parseBody(request, schema);

  const lookup = exists.get(body.source);
  if (!lookup) {
    throw new ApiError("Unsupported source.", 400, "bad_request");
  }
  const target = await lookup(user.id, body.id);
  if (!target) throw ApiError.notFound("That no longer exists.");

  const skip = await addOccurrenceSkip(user.id, body.source, body.id, body.date, body.note);
  return ok({ skip }, 201);
});