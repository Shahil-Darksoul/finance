import type { Metadata } from "next";
import { redirectIfSignedIn } from "@/lib/auth/guard";
import { SignupPageShell } from "./signup-page-shell";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignupPage() {
  await redirectIfSignedIn();
  return <SignupPageShell />;
}