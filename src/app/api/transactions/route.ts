import { z } from "zod";
import { route, ok, parseBody } from "@/lib/api";
import { createTransaction } from "@/lib/repo/transactions";
import { TRANSACTION_TYPES } from "@/lib/types";

const schema = z.object({
  type: z.enum(TRANSACTION_TYPES),
  amountCents: z.number().int().positive("Enter an amount greater than zero."),
  date: z.string().min(1, "Pick a date."),
  accountId: z.string().min(1, "Choose an account."),
  categoryId: z.string().nullable().optional(),
  description: z.string().trim().max(140).nullable().optional(),
  merchant: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(280).nullable().optional(),
  status: z.enum(["cleared", "pending"]).optional(),
});

/** Records a single money movement against an account. */
export const POST = route(async (request, user) => {
  const body = await parseBody(request, schema);

  const transaction = await createTransaction(user.id, {
    type: body.type,
    // The repo stores a positive magnitude; the type decides the sign.
    amountCents: Math.abs(body.amountCents),
    date: body.date,
    accountId: body.accountId,
    categoryId: body.categoryId ?? null,
    description: body.description ?? null,
    merchant: body.merchant ?? null,
    notes: body.notes ?? null,
    status: body.status ?? "cleared",
  });

  return ok({ transaction }, 201);
});