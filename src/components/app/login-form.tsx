"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { apiFetch, ApiClientError } from "@/lib/api-client";

/**
 * Client login form.
 *
 * Submits to the auth API route rather than a server action so credential
 * handling, session creation and cookie writing all live in one auditable place.
 */
export function LoginForm({ nextPath = "/dashboard" }: { nextPath?: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [demoPending, setDemoPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const form = new FormData(event.currentTarget);
    try {
      await apiFetch("/api/auth/login", {
        method: "POST",
        json: {
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
        },
      });
      // Full navigation so the server layout re-reads the new session cookie.
      router.replace(nextPath);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(caught.message);
        setFields(caught.fields);
      } else {
        setError("Something went wrong. Please try again.");
      }
      setPending(false);
    }
  }

  async function onDemoLogin() {
    setDemoPending(true);
    setError(null);
    setFields({});

    try {
      await apiFetch("/api/auth/demo-login", { method: "POST" });
      router.replace(nextPath);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(caught.message);
        setFields(caught.fields);
      } else {
        setError("Something went wrong. Please try again.");
      }
      setDemoPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-negative-soft px-3 py-2 text-xs text-negative"
        >
          {error}
        </p>
      ) : null}

      <Field label="Email" htmlFor="email" error={fields.email} required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          invalid={Boolean(fields.email)}
        />
      </Field>

      <Field label="Password" htmlFor="password" error={fields.password} required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          invalid={Boolean(fields.password)}
        />
      </Field>

      <Button type="submit" disabled={pending || demoPending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          <span className="bg-background px-2">or</span>
        </div>
      </div>

      <Button
        type="button"
        variant="secondary"
        onClick={onDemoLogin}
        disabled={pending || demoPending}
        className="w-full"
      >
        {demoPending ? "Entering demo…" : "Continue with demo account"}
      </Button>
    </form>
  );
}