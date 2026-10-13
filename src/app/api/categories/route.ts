import { z } from "zod";
import { route, ok, parseBody, ApiError } from "@/lib/api";
import { createCategory, findCategoryByName } from "@/lib/repo/categories";

const schema = z.object({
  name: z.string().trim().min(1, "Give this category a name."),
  kind: z.enum(["expense", "income"]),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #6366f1.")
    .nullable()
    .optional(),
});

/** Creates a category. Names are unique per user per kind. */
export const POST = route(async (request, user) => {
  const body = await parseBody(request, schema);

  const existing = await findCategoryByName(user.id, body.name, body.kind);
  if (existing) {
    throw new ApiError("You already have a category with that name.", 409, "conflict", {
      name: "You already have a category with that name.",
    });
  }

  const category = await createCategory({
    userId: user.id,
    name: body.name,
    kind: body.kind,
    color: body.color ?? null,
  });

  return ok({ category }, 201);
});