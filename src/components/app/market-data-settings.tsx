"use client";

import * as React from "react";
import { ExternalLink, KeyRound, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import {
  MARKET_PROVIDER_CHOICES,
  MARKET_PROVIDER_LABELS,
  type MarketProviderChoice,
  type MarketSettingsView,
} from "@/lib/services/marketData/types";

/**
 * Settings panel for live market data.
 *
 * The key is sent to the server once and stored per user; it is never returned,
 * so the input always starts blank and only a masked hint is shown.
 */
export function MarketDataSettings({ initial }: { initial: MarketSettingsView }) {
  const { success, error: toastError } = useToast();
  const [view, setView] = React.useState(initial);
  const [provider, setProvider] = React.useState<MarketProviderChoice>(initial.provider);
  const [apiKey, setApiKey] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [clearing, setClearing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { settings } = await apiFetch<{ settings: MarketSettingsView }>(
        "/api/settings/market",
        {
          method: "PUT",
          json: {
            provider,
            // Blank means "keep the current key"; the stored key is never shown.
            ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          },
        },
      );
      setView(settings);
      setApiKey("");
      success("Market data saved", settings.hasKey ? "Live quotes are enabled." : "Saved.");
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : "Something went wrong. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  async function removeKey() {
    setClearing(true);
    setError(null);
    try {
      const { settings } = await apiFetch<{ settings: MarketSettingsView }>(
        "/api/settings/market",
        { method: "PUT", json: { provider, apiKey: "" } },
      );
      setView(settings);
      setApiKey("");
      success("API key removed", settings.fromEnv ? "Falling back to the .env key." : undefined);
    } catch (caught) {
      toastError(
        "Could not remove key",
        caught instanceof ApiClientError ? caught.message : undefined,
      );
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={save} noValidate className="space-y-4">
        <Field
          label="Provider"
          htmlFor="market-provider"
          hint="Yahoo Finance needs no key and covers US and Canadian (TSX) stocks. Finnhub and Alpha Vantage use the key below; the simulator never fetches real prices."
        >
          <Select
            id="market-provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value as MarketProviderChoice)}
          >
            {MARKET_PROVIDER_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {MARKET_PROVIDER_LABELS[choice]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="API key"
          htmlFor="market-api-key"
          error={error ?? undefined}
          hint={
            view.hasKey
              ? `A key is ${view.fromEnv ? "set in .env" : "saved"}${
                  view.keyHint ? ` (${view.keyHint})` : ""
                }. Leave this blank to keep it.`
              : "Paste a Finnhub or Alpha Vantage key (not needed for Yahoo Finance). Stored on the server, never shown again."
          }
        >
          <Input
            id="market-api-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={view.keyHint ?? "Paste your API key"}
            invalid={Boolean(error)}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" loading={pending}>
            <KeyRound className="h-4 w-4" aria-hidden />
            Save market data
          </Button>
          {view.hasKey && !view.fromEnv ? (
            <Button type="button" variant="ghost" loading={clearing} onClick={removeKey}>
              Remove key
            </Button>
          ) : null}
        </div>
      </form>

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Provider status
        </p>
        <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border bg-surface">
          {view.providers.map((entry) => (
            <li key={entry.name} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {entry.label}
                  {entry.active ? <Badge tone="positive">active</Badge> : null}
                </p>
                <p className="text-xs text-muted-foreground">{entry.detail}</p>
              </div>
              <Badge tone={entry.configured ? "positive" : "neutral"}>
                {entry.configured ? "configured" : "no key"}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Yahoo Finance works with no key and covers Canadian listings. For
          Finnhub or Alpha Vantage, get a free key at{" "}
          <a
            href="https://finnhub.io"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-foreground underline underline-offset-2"
          >
            finnhub.io <ExternalLink className="h-3 w-3" aria-hidden />
          </a>{" "}
          or{" "}
          <a
            href="https://www.alphavantage.co/support/#api-key"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-foreground underline underline-offset-2"
          >
            alphavantage.co <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
          . Free-tier quotes are delayed.
        </p>
      </div>
    </div>
  );
}
