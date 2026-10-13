import { getUserMarketSettings } from "@/lib/repo/user-settings";
import { describeProviders } from ".";
import {
  MARKET_PROVIDER_CHOICES,
  type MarketProviderChoice,
  type MarketSettingsView,
} from "./types";

/** The provider named in `.env`, defaulting to `auto`. */
function envProvider(): MarketProviderChoice {
  const value = (process.env.MARKET_DATA_PROVIDER ?? "").trim().toLowerCase();
  return (MARKET_PROVIDER_CHOICES as readonly string[]).includes(value)
    ? (value as MarketProviderChoice)
    : "auto";
}

function envHasKey(): boolean {
  const value = process.env.MARKET_API_KEY;
  return Boolean(value && value.trim());
}

/** Last four characters only; enough to recognise a key, useless to an attacker. */
function keyHint(apiKey: string): string {
  return apiKey.length <= 4 ? "••••" : `••••${apiKey.slice(-4)}`;
}

/**
 * Assembles the market-data settings panel state for one user.
 *
 * The stored key takes precedence; otherwise the `.env` key is reported so the
 * UI can explain where live data is coming from. The raw key is never returned.
 */
export async function getMarketSettingsView(userId: string): Promise<MarketSettingsView> {
  const settings = await getUserMarketSettings(userId);
  const fromEnv = !settings.apiKey && envHasKey();
  const apiKey =
    settings.apiKey ?? (fromEnv ? (process.env.MARKET_API_KEY ?? null) : null);
  const provider = (settings.provider as MarketProviderChoice | null) ?? envProvider();

  const providers = await describeProviders({ apiKey, provider });

  return {
    provider,
    hasKey: Boolean(apiKey),
    keyHint: apiKey ? keyHint(apiKey) : null,
    fromEnv,
    providers,
  };
}
