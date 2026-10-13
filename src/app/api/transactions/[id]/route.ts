import { z } from "zod";
import { route, ok, parseBody, ApiError } from "@/lib/api";
import { deleteTransaction } from "@/lib/repo/transactions";

const schema = z.object({
  note: z
    .string()
    .trim()
    .min(3, "Add a short note explaining why this transaction is being deleted.")
    .max(280, "Keep the note under 280 characters."),
});

/** Permanently removes a transaction after recording a finalisation note. */
export const DELETE = route(async (request, user, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const body = await parseBody(request, schema);

  const deleted = await deleteTransaction(user.id, id, body.note);
  if (!deleted) {
    throw ApiError.notFound("That transaction no longer exists.");
  }
  return ok({ deleted: true });
});