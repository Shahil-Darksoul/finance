import { cookies } from "next/headers";
import { publicRoute, ok, ApiError } from "@/lib/api";
import {
  AuthError,
  DEMO_ACCOUNT,
  ensureDemoUser,
  signInUser,
} from "@/lib/services/auth/account";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

export const POST = publicRoute(async () => {
  try {
    await ensureDemoUser();
    const { user, token, expiresAt } = await signInUser({
      email: DEMO_ACCOUNT.email,
      password: DEMO_ACCOUNT.password,
    });

    const store = await cookies();
    store.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));

    return ok({ user: { id: user.id, name: user.name } });
  } catch (error) {
    if (error instanceof AuthError) {
      throw new ApiError(error.message, error.status ?? 400, "auth_failed", {
        ...(error.field ? { [error.field]: error.message } : {}),
      });
    }
    throw error;
  }
});
