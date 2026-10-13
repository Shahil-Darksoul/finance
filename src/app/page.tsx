import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Entry point.
 *
 * Signed-in users go straight to the dashboard; everyone else lands on the
 * marketing page. There is no dedicated landing route, so `/` doubles as the
 * public home page.
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? "/dashboard" : "/welcome");
}