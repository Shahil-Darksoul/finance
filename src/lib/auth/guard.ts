import { redirect } from "next/navigation";
import { getCurrentUser } from "./session";
import type { User } from "@/lib/types";

/** Server-side guard for authenticated app pages. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/** Server-side guard for auth pages: bounce signed-in users to the app. */
export async function redirectIfSignedIn(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }
}