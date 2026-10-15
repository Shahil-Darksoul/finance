"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import {
  DISPLAY_CURRENCY_CODES,
  DISPLAY_CURRENCY_LABELS,
  type DisplayView,
} from "@/lib/utils/currency";

/**
 * Display-currency switcher.
 *
 * Amounts are stored in the account's base currency and converted for display
 * at live rates. Switching re-renders the page through `router.refresh()`, so
 * every figure, chart and label updates together.
 */
export function CurrencySwitcher({
  display,
  compact = false,
}: {
  display: DisplayView;
  /** Compact mode drops the explanatory caption, for tight headers. */
  compact?: boolean;
}) {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [pending, setPending] = React.useState(false);
  // Local copy so the select updates immediately and doesn't snap back while
  // the server refresh is in flight.
  const [value, setValue] = React.useState(display.currency);
  const [syncedCurrency, setSyncedCurrency] = React.useState(display.currency);

  // Re-sync when the resolved display currency changes from the server (e.g.
  // after a refresh, or if two switchers are on the same page). Adjusting state
  // during render is React's recommended pattern here and avoids an effect.
  if (display.currency !== syncedCurrency) {
    setSyncedCurrency(display.currency);
    setValue(display.currency);
  }

  async function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const code = event.target.value;
    if (code === value || pending) return;
    const previous = value;
    setValue(code);
    setPending(true);
    try {
      await apiFetch<{ display: DisplayView }>("/api/settings/currency", {
        method: "PUT",
        json: { currency: code },
      });
      success(
        "Display currency updated",
        code === display.baseCurrency
          ? `Showing your stored ${display.baseCurrency} amounts.`
          : `Converted at the latest available ${code} rate.`,
      );
      // Triggers a server re-render with the new rates; the spinner is cleared
      // in `finally` so it can never get stuck.
      router.refresh();
    } catch (caught) {
      setValue(previous);
      toastError(
        "Could not switch currency",
        caught instanceof ApiClientError ? caught.message : undefined,
      );
    } finally {
      setPending(false);
    }
  }

  const rateText = display.converted
    ? `1 ${display.baseCurrency} ≈ ${display.rate >= 100 ? display.rate.toFixed(1) : display.rate.toFixed(2)} ${display.currency}`
    : null;

  return (
    <div className="flex items-center gap-2">
      {!compact ? (
        <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
          <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
          Show in
        </span>
      ) : null}
      <div className="relative">
        <Select
          value={value}
          onChange={onChange}
          disabled={pending}
          aria-label="Display currency"
          className={cn(
            "h-8 appearance-none pr-7 text-xs font-medium",
            compact ? "w-[5.5rem]" : "min-w-[7rem]",
          )}
        >
          {DISPLAY_CURRENCY_CODES.map((code) => (
            <option key={code} value={code}>
              {compact ? code : `${code} · ${DISPLAY_CURRENCY_LABELS[code]}`}
            </option>
          ))}
        </Select>
        {pending ? (
          <Loader2
            className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden
          />
        ) : null}
      </div>
      {rateText && !compact ? (
        <Badge tone={display.live ? "info" : "neutral"} className="hidden md:inline-flex">
          {display.live ? "live rate" : "approx."} {rateText}
        </Badge>
      ) : null}
    </div>
  );
}
