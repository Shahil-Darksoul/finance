import { z } from "zod";
import { route, ok, parseBody, ApiError } from "@/lib/api";
import { getInvestment, updateInvestment, deleteInvestment } from "@/lib/repo/investments";
import { ASSET_TYPES, INVESTMENT_CURRENCIES } from "@/lib/types";

const PATCH_SCHEMA = z.object({
  symbol: z.string().trim().min(1, "Enter a ticker symbol.").optional(),
  name: z.string().trim().max(80).nullable().optional(),
  assetType: z.enum(ASSET_TYPES).optional(),
  quantity: z.number().nonnegative("Quantity cannot be negative.").optional(),
  avgCostCents: z.number().int().min(0, "Average cost cannot be negative.").optional(),
  currency: z.enum(INVESTMENT_CURRENCIES).optional(),
  accountId: z.string().nullable().optional(),
  notes: z.string().trim().max(280).nullable().optional(),
  archived: z.boolean().optional(),
});

const DELETE_SCHEMA = z.object({
  note: z
    .string()
    .trim()
    .min(3, "Add a short note explaining why this holding is being deleted.")
    .max(280, "Keep the note under 280 characters."),
});

export const PATCH = route(async (request, user, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const body = await parseBody(request, PATCH_SCHEMA);

  const existing = await getInvestment(user.id, id);
  if (!existing) {
    throw ApiError.notFound("That investment no longer exists.");
  }

  const investment = await updateInvestment(user.id, id, {
    symbol: body.symbol,
    name: body.name !== undefined ? (body.name || existing.name) : undefined,
    assetType: body.assetType,
    quantity: body.quantity,
    avgCostCents: body.avgCostCents,
    currency: body.currency,
    accountId: body.accountId,
    notes: body.notes,
    archived: body.archived,
  });
  if (!investment) {
    throw ApiError.notFound("That investment no longer exists.");
  }
  return ok({ investment });
});

export const DELETE = route(async (request, user, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const body = await parseBody(request, DELETE_SCHEMA);

  const deleted = await deleteInvestment(user.id, id, body.note);
  if (!deleted) {
    throw ApiError.notFound("That investment no longer exists.");
  }
  return ok({ deleted: true });
});
