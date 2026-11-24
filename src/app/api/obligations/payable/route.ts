import { z } from "zod";
import { route, ok, parseBody } from "@/lib/api";
import { getUpcomingObligations } from "@/lib/services/finance/obligations";
import { getNextPaydays } from "@/lib/services/finance/payday";
import { addDays, endOfMonth, fromISODate } from "@/lib/utils/date";

const schema = z.object({
  from: z.string().min(1),
});

export const POST = route(async (request, user) => {
  const body = await parseBody(request, schema);
  const from = fromISODate(body.from);
  const nextPaydays = await getNextPaydays(user.id, from, 1);
  const nextPayday = nextPaydays[0] ?? null;
  const billUntil = nextPayday ? fromISODate(nextPayday.date) : addDays(from, 30);

  const [billObs, sipObs] = await Promise.all([
    getUpcomingObligations(user.id, { from, until: billUntil }),
    getUpcomingObligations(user.id, { from, until: endOfMonth(from) }),
  ]);

  const bills = billObs.filter(
    (o) =>
      (o.source === "bill" || o.source === "emi") &&
      o.amountCents > 0 &&
      (!nextPayday || o.dueDate < nextPayday.date),
  );
  const sips = sipObs.filter((o) => o.source === "sip" && o.amountCents > 0);

  const seen = new Set<string>();
  const obligations = [...bills, ...sips].filter((o) => {
    const key = `${o.source}:${o.id}:${o.dueDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return ok({ obligations, nextPaydayDate: nextPayday?.date ?? null });
});
