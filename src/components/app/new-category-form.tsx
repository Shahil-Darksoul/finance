"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { apiFetch, ApiClientError } from "@/lib/api-client";

const PALETTE = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b",
];

/** Create form for a transaction category. */
export function NewCategoryForm() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [color, setColor] = React.useState(PALETTE[0]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const form = new FormData(event.currentTarget);

    try {
      await apiFetch("/api/categories", {
        method: "POST",
        json: {
          name: String(form.get("name") ?? "").trim(),
          kind: String(form.get("kind") ?? "expense"),
          color,
        },
      });
      router.push("/categories");
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
      <Link
        href="/categories"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to categories
      </Link>

      <div>
        <h1 className="text-lg font-semibold">Add a category</h1>
        <p className="text-xs text-muted-foreground">
          Categories group transactions for your spending breakdowns.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-negative-soft px-3 py-2 text-xs text-negative">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader title="Category" />
        <CardBody className="space-y-4">
          <Field label="Name" htmlFor="name" error={fields.name} required>
            <Input id="name" name="name" placeholder="Groceries" invalid={Boolean(fields.name)} />
          </Field>

          <Field label="Used for" htmlFor="kind">
            <Select id="kind" name="kind" defaultValue="expense">
              <option value="expense">Expenses</option>
              <option value="income">Income</option>
            </Select>
          </Field>

          <fieldset>
            <legend className="mb-1.5 block text-xs font-medium text-foreground">Colour</legend>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`Colour ${value}`}
                  aria-pressed={color === value}
                  onClick={() => setColor(value)}
                  style={{ backgroundColor: value }}
                  className={`h-7 w-7 rounded-lg transition-transform ${
                    color === value ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface" : ""
                  }`}
                />
              ))}
            </div>
          </fieldset>
        </CardBody>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending}>
          Add category
        </Button>
        <Link href="/categories" className={buttonClass({ variant: "ghost" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}