import { z } from "zod";
import { route, ok, parseBody } from "@/lib/api";
import { setDisplayCurrency } from "@/lib/repo/user-settings";
import {
  DISPLAY_CURRENCY_CODES,
  resolveDisplay,
  toDisplayView,
} from "@/lib/services/finance/currency";

/**
 * Reads and writes the signed-in user's display currency.
 *
 * Records stay in the account's base currency; this only changes how amounts
 * are converted and shown, using live exchange rates.
 */
export const GET = route(async (_request, user) => {
  return ok({ display: toDisplayView(await resolveDisplay(user.currency, user.id)) });
});

const putSchema = z.object({
  currency: z.enum(DISPLAY_CURRENCY_CODES),
});

export const PUT = route(async (request, user) => {
  const body = await parseBody(request, putSchema);

  // Selecting the base currency clears the preference rather than storing a
  // redundant copy of it.
  if (body.currency === user.currency) {
    await setDisplayCurrency(user.id, null);
  } else {
    await setDisplayCurrency(user.id, body.currency);
  }

  return ok({ display: toDisplayView(await resolveDisplay(user.currency, user.id)) });
});
