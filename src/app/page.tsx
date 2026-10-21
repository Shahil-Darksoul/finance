import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Entry point.
 *
 * Signed-in users go straight to the dashboard; everyone else lands on the
 * sign-in page, so a shared link to `/` always ends up at the login form.
 * The marketing page stays reachable at `/welcome`.
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? "/dashboard" : "/login");
}
