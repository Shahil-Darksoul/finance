import { z } from "zod";
import { route, ok, parseBody, ApiError } from "@/lib/api";
import { getWorkEntry, updateWorkEntry, deleteWorkEntry } from "@/lib/repo/work";

const patchSchema = z.object({
  hours: z
    .number()
    .positive("Enter the hours you worked.")
    .max(24, "A day cannot have more than 24 hours."),
});

export const PATCH = route(async (request, user, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const body = await parseBody(request, patchSchema);
  const existing = await getWorkEntry(user.id, id);
  if (!existing) throw ApiError.notFound("That day is no longer in your work log.");
  const entry = await updateWorkEntry(user.id, id, body.hours);
  if (!entry) throw ApiError.notFound("That day is no longer in your work log.");
  return ok({ entry });
});

export const DELETE = route(async (_request, user, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const deleted = await deleteWorkEntry(user.id, id);
  if (!deleted) throw ApiError.notFound("That day is no longer in your work log.");
  return ok({ deleted: true });
});