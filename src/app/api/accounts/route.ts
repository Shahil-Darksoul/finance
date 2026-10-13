import { z } from "zod";
import { route, ok, parseBody } from "@/lib/api";
import { createAccount } from "@/lib/repo/accounts";
import { ACCOUNT_TYPES } from "@/lib/types";

const schema = z.object({
  name: z.string().trim().min(1, "Give this account a name."),
  type: z.enum(ACCOUNT_TYPES),
  institution: z.string().trim().max(80).nullable().optional(),
  openingBalanceCents: z.number().int().optional(),
  creditLimitCents: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  note: z.string().trim().max(280).nullable().optional(),
  includeInNetWorth: z.boolean().optional(),
});

/** Creates an account. Balances only move afterwards via transactions. */
export const POST = route(async (request, user) => {
  const body = await parseBody(request, schema);
  const account = await createAccount(user.id, {
    name: body.name,
    type: body.type,
    institution: body.institution ?? null,
    openingBalanceCents: body.openingBalanceCents ?? 0,
    creditLimitCents: body.creditLimitCents ?? 0,
    currency: body.currency ?? user.currency,
    note: body.note ?? null,
    includeInNetWorth: body.includeInNetWorth ?? true,
  });
  return ok({ account }, 201);
});