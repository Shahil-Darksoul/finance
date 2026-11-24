import { z } from "zod";
import { route, ok, parseBody } from "@/lib/api";
import { upsertWorkEntry } from "@/lib/repo/work";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date."),
  hours: z
    .number()
    .positive("Enter the hours you worked.")
    .max(24, "A day cannot have more than 24 hours."),
});

export const POST = route(async (request, user) => {
  const body = await parseBody(request, schema);
  const entry = await upsertWorkEntry(user.id, body.date, body.hours);
  return ok({ entry }, 201);
});