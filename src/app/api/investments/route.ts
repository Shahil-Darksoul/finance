import { z } from "zod";
import { route, ok, parseBody } from "@/lib/api";
import { upsertInvestmentHolding } from "@/lib/repo/investments";
import {
  ASSET_TYPES,
  INVESTMENT_CURRENCIES,
  type AssetType,
  type InvestmentCurrency,
} from "@/lib/types";
import { parseSymbol, CRYPTO_SYMBOLS } from "@/lib/services/marketData/symbols";
import { KNOWN_SYMBOLS } from "@/lib/services/marketData/types";

const schema = z.object({
  symbol: z.string().trim().min(1, "Enter a ticker symbol."),
  name: z.string().trim().max(80).optional(),
  assetType: z.enum(ASSET_TYPES).optional(),
  quantity: z.number().positive("Enter how many units you hold."),
  avgCostCents: z.number().int().min(0, "Enter what you paid per unit."),
  currency: z.enum(INVESTMENT_CURRENCIES).optional(),
  accountId: z.string().nullable().optional(),
  notes: z.string().trim().max(280).nullable().optional(),
});

/**
 * Creates a holding at its average cost.
 *
 * The portfolio service prices it from there, so no live quote is needed to
 * save the position — prices arrive when the investments page loads. Adding a
 * symbol you already hold tops up that position instead of duplicating it.
 */
export const POST = route(async (request, user) => {
  const body = await parseBody(request, schema);
  const symbol = body.symbol.toUpperCase();

  // A coin must never be filed as a stock, or the portfolio prices it through
  // the wrong provider. The symbol decides; the submitted type only fills gaps.
  const parsed = parseSymbol(symbol);
  const inferred: AssetType | undefined = parsed.kind === "crypto" ? "crypto" : undefined;
  const fallbackName =
    parsed.kind === "crypto"
      ? (CRYPTO_SYMBOLS[parsed.base]?.name ?? symbol)
      : (KNOWN_SYMBOLS.find((row) => row.symbol === symbol)?.name ?? symbol);

  // Default the holding's currency to the account currency when it is one we
  // record, otherwise fall back to USD.
  const currency: InvestmentCurrency = body.currency ??
    (INVESTMENT_CURRENCIES.includes(user.currency as InvestmentCurrency)
      ? (user.currency as InvestmentCurrency)
      : "USD");

  const { investment, merged } = await upsertInvestmentHolding(user.id, {
    symbol,
    name: body.name ?? fallbackName,
    assetType: inferred ?? body.assetType ?? "stock",
    quantity: body.quantity,
    avgCostCents: body.avgCostCents,
    currency,
    accountId: body.accountId ?? null,
    notes: body.notes ?? null,
  });

  return ok({ investment, merged }, merged ? 200 : 201);
});