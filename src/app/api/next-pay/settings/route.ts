import { z } from "zod";
import { route, ok, parseBody } from "@/lib/api";
import { saveWorkSettings } from "@/lib/repo/work";

const schema = z.object({
  hourlyRateCents: z.number().int().min(0, "Enter a valid hourly rate.").optional(),
  taxPercent: z
    .number()
    .min(0, "Tax must be between 0 and 100.")
    .max(100, "Tax must be between 0 and 100.")
    .optional(),
});

export const PATCH = route(async (request, user) => {
  const body = await parseBody(request, schema);
  const settings = await saveWorkSettings(user.id, body);
  return ok({ settings });
});