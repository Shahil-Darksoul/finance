import { cookies } from "next/headers";
import { z } from "zod";
import { publicRoute, ok, parseBody, ApiError } from "@/lib/api";
import { registerUser, signInUser, AuthError } from "@/lib/services/auth/account";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

const schema = z.object({
  name: z.string().trim().max(80).optional(),
  email: z.string().min(1, "Enter your email address."),
  password: z.string().min(1, "Choose a password."),
  currency: z.string().length(3).optional(),
  withDemoData: z.boolean().optional(),
});

/** SQLite/Postgres only; the auth service uses node:crypto. */

/**
 * Creates an account and immediately signs the user in.
 *
 * Still a public route, but `publicRoute` enforces the same-origin check on the
 * POST body so the endpoint cannot be driven from another site.
 */
export const POST = publicRoute(async (request) => {
  const body = await parseBody(request, schema);

  try {
    const user = await registerUser({
      email: body.email,
      password: body.password,
      name: body.name ?? body.email.split("@")[0] ?? "",
      currency: body.currency ?? "USD",
      withDemoData: body.withDemoData ?? false,
    });

    // Register already proved the credentials are valid, so signing in here
    // cannot fail and the user lands on the dashboard in one round trip.
    const { token, expiresAt } = await signInUser({
      email: body.email,
      password: body.password,
    });

    const store = await cookies();
    store.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));

    return ok({ user: { id: user.id, name: user.name } }, 201);
  } catch (error) {
    if (error instanceof AuthError) {
      throw new ApiError(error.message, error.status ?? 400, "auth_failed", {
        ...(error.field ? { [error.field]: error.message } : {}),
      });
    }
    throw error;
  }
});