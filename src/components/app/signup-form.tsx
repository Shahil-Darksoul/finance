"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Checkbox } from "@/components/ui/input";
import { apiFetch, ApiClientError } from "@/lib/api-client";

/**
 * Client signup form.
 *
 * `withDemoData` loads a fictional dataset so the app is explorable immediately.
 * The server decides whether demo data is allowed; the checkbox is only a hint.
 */
export function SignupForm() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [withDemo, setWithDemo] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const form = new FormData(event.currentTarget);
    try {
      await apiFetch("/api/auth/signup", {
        method: "POST",
        json: {
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
          withDemoData: withDemo,
        },
      });
      router.replace("/dashboard");
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

      <Field label="Name" htmlFor="name" error={fields.name} required>
        <Input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          invalid={Boolean(fields.name)}
        />
      </Field>

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

      <Field
        label="Password"
        htmlFor="password"
        error={fields.password}
        hint="At least 10 characters, with a letter and a number."
        required
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          invalid={Boolean(fields.password)}
        />
      </Field>

      <Checkbox
        checked={withDemo}
        onCheckedChange={setWithDemo}
        className="items-start text-xs leading-relaxed text-muted-foreground"
        label={
          <span className="leading-relaxed">
            Start with a fictional demo dataset so you can explore the dashboard,
            charts and forecasts before entering anything real.
          </span>
        }
      />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating your account…" : "Create account"}
      </Button>
    </form>
  );
}