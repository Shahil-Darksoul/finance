import { getDb } from "@/lib/db";

/**
 * Per-user application settings.
 *
 * The market-data API key is stored here (server-only) and is never selected
 * into the browser-facing user shape. Environment variables remain a fallback,
 * so a key set in `.env` still works when the user has not entered one.
 */
export type UserMarketSettings = {
  apiKey: string | null;
  provider: string | null;
};

export async function getUserMarketSettings(
  userId: string,
): Promise<UserMarketSettings> {
  const db = await getDb();
  const row = await db.get<{
    market_api_key: string | null;
    market_provider: string | null;
  }>(
    `SELECT market_api_key, market_provider FROM user_settings WHERE user_id = ?`,
    [userId],
  );
  return {
    apiKey: row?.market_api_key?.trim() ? row.market_api_key.trim() : null,
    provider: row?.market_provider?.trim() ? row.market_provider.trim() : null,
  };
}

/**
 * Saves market-data settings.
 *
 * Only the fields provided are changed: pass `apiKey: null` to clear it, or omit
 * it entirely to leave the stored key untouched (so saving the provider alone
 * never wipes a key the user already entered).
 */
export async function saveUserMarketSettings(
  userId: string,
  input: { apiKey?: string | null; provider?: string | null },
): Promise<UserMarketSettings> {
  const db = await getDb();
  const existing = await getUserMarketSettings(userId);
  const apiKey = input.apiKey !== undefined ? input.apiKey : existing.apiKey;
  const provider = input.provider !== undefined ? input.provider : existing.provider;
  const now = new Date().toISOString();

  const current = await db.get<{ user_id: string }>(
    `SELECT user_id FROM user_settings WHERE user_id = ?`,
    [userId],
  );

  if (current) {
    await db.run(
      `UPDATE user_settings
          SET market_api_key = ?, market_provider = ?, updated_at = ?
        WHERE user_id = ?`,
      [apiKey, provider, now, userId],
    );
  } else {
    await db.run(
      `INSERT INTO user_settings (user_id, market_api_key, market_provider, updated_at)
       VALUES (?, ?, ?, ?)`,
      [userId, apiKey, provider, now],
    );
  }

  return { apiKey, provider };
}
