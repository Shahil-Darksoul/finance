"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiClientError } from "@/lib/api-client";

/** Marks every notification read so the sidebar badge clears. */
export function MarkAllReadButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function markAll() {
    setPending(true);
    setError(null);
    try {
      await apiFetch("/api/notifications/read-all", { method: "POST" });
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : "Could not update notifications.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error ? (
        <span role="alert" className="text-[11px] text-negative">
          {error}
        </span>
      ) : null}
      <Button variant="ghost" size="sm" onClick={markAll} disabled={pending}>
        <CheckCheck className="h-3.5 w-3.5" aria-hidden />
        {pending ? "Marking…" : `Mark ${count} as read`}
      </Button>
    </div>
  );
}