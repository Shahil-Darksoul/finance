import { cookies } from "next/headers";
import { publicRoute, ok } from "@/lib/api";
import { destroySession } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/session";

/** Signs the user out and clears the cookie. */
export const POST = publicRoute(async () => {
  const store = await cookies();
  await destroySession(store.get(SESSION_COOKIE)?.value);

  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return ok({ signedOut: true });
});