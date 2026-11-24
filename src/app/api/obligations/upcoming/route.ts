import { z } from "zod";
import { route, ok, parseBody } from "@/lib/api";
import { getUpcomingObligations } from "@/lib/services/finance/obligations";
import { fromISODate } from "@/lib/utils/date";

const schema = z.object({
  from: z.string().min(1),
  days: z.number().int().min(1).max(120).optional(),
});

export const POST = route(async (request, user) => {
  const body = await parseBody(request, schema);
  const from = fromISODate(body.from);
  const until = new Date(from);
  until.setDate(until.getDate() + (body.days ?? 45));
  const obligations = await getUpcomingObligations(user.id, { from, until });
  return ok({ obligations });
});
