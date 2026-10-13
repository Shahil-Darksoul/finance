import { z } from "zod";
import { route, ok, parseBody } from "@/lib/api";
import { saveUserMarketSettings } from "@/lib/repo/user-settings";
import { getMarketSettingsView } from "@/lib/services/marketData/settings";
import { MARKET_PROVIDER_CHOICES } from "@/lib/services/marketData/types";

/**
 * Reads and writes the signed-in user's market-data credentials.
 *
 * The raw key is never returned: callers only learn whether one is set and its
 * last four characters. Environment variables are reported separately so the UI
 * can explain when a key is coming from `.env`.
 */
export const GET = route(async (_request, user) => {
  return ok({ settings: await getMarketSettingsView(user.id) });
});

const putSchema = z.object({
  provider: z.enum(MARKET_PROVIDER_CHOICES).optional(),
  /**
   * A non-empty string stores the key; an empty string clears it. Omit the
   * field entirely to leave the stored key untouched.
   */
  apiKey: z.string().max(200).optional(),
});

export const PUT = route(async (request, user) => {
  const body = await parseBody(request, putSchema);

  const patch: { apiKey?: string | null; provider?: string | null } = {};
  if (body.provider !== undefined) patch.provider = body.provider;
  if (body.apiKey !== undefined) {
    const trimmed = body.apiKey.trim();
    patch.apiKey = trimmed.length > 0 ? trimmed : null;
  }

  await saveUserMarketSettings(user.id, patch);

  return ok({ settings: await getMarketSettingsView(user.id) });
});
