import type { Metadata } from "next";
import { redirectIfSignedIn } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  await redirectIfSignedIn();
  const { next } = await searchParams;

  // Only allow same-site relative redirects, so `?next=` cannot be used to bounce
  // a freshly signed-in user to an attacker's page.
  const nextPath = next && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/dashboard";

  const { LoginPageShell } = await import("./login-page-shell");
  return <LoginPageShell nextPath={nextPath} />;
}