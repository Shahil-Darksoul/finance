import type { Metadata } from "next";
import { redirectIfSignedIn } from "@/lib/auth/guard";
import { WelcomePage } from "./welcome-page";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomeRoute() {
  await redirectIfSignedIn();
  return <WelcomePage />;
}