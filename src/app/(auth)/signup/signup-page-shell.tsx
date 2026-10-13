import Link from "next/link";
import { Card } from "@/components/ui/card";
import { SignupForm } from "@/components/app/signup-form";
import { BrandMark } from "@/components/app/brand-mark";

export function SignupPageShell() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark className="mb-4 h-11 w-11" />
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Create your account
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track spending, savings and investments in one place.
          </p>
        </div>

        <Card className="p-6">
          <SignupForm />
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}