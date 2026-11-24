"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, MoneyInput } from "@/components/ui/input";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/utils/money";
import { formatDate, toISODate } from "@/lib/utils/date";
import type { WorkEntry, WorkSettings } from "@/lib/types";

export function NextPayManager({
  settings,
  entries,
  totalHours,
  grossCents,
  taxCents,
  netCents,
  currency,
}: {
  settings: WorkSettings;
  entries: WorkEntry[];
  totalHours: number;
  grossCents: number;
  taxCents: number;
  netCents: number;
  currency: string;
}) {
  const router = useRouter();
  const { success } = useToast();

  const [rateCents, setRateCents] = React.useState(settings.hourlyRateCents);
  const [taxText, setTaxText] = React.useState(String(settings.taxPercent));
  const [settingsPending, setSettingsPending] = React.useState(false);
  const [settingsError, setSettingsError] = React.useState<string | null>(null);
  const [settingsFields, setSettingsFields] = React.useState<Record<string, string>>({});

  const [date, setDate] = React.useState(toISODate(new Date()));
  const [hoursText, setHoursText] = React.useState("");
  const [addPending, setAddPending] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [addFields, setAddFields] = React.useState<Record<string, string>>({});

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editHoursText, setEditHoursText] = React.useState("");
  const [rowPending, setRowPending] = React.useState(false);
  const [rowError, setRowError] = React.useState<string | null>(null);

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsPending(true);
    setSettingsError(null);
    setSettingsFields({});
    try {
      await apiFetch("/api/next-pay/settings", {
        method: "PATCH",
        json: {
          hourlyRateCents: rateCents,
          taxPercent: Number.parseFloat(taxText) || 0,
        },
      });
      success("Pay settings saved", "Your next pay estimate has been updated.");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setSettingsError(caught.message);
        setSettingsFields(caught.fields);
      } else {
        setSettingsError("Something went wrong. Please try again.");
      }
    } finally {
      setSettingsPending(false);
    }
  }

  async function addHours(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddPending(true);
    setAddError(null);
    setAddFields({});
    try {
      await apiFetch("/api/next-pay/entries", {
        method: "POST",
        json: { date, hours: Number.parseFloat(hoursText) || 0 },
      });
      success("Hours logged", "They now count toward your next pay.");
      setHoursText("");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setAddError(caught.message);
        setAddFields(caught.fields);
      } else {
        setAddError("Something went wrong. Please try again.");
      }
    } finally {
      setAddPending(false);
    }
  }

  async function saveEdit(id: string) {
    setRowPending(true);
    setRowError(null);
    try {
      await apiFetch(`/api/next-pay/entries/${id}`, {
        method: "PATCH",
        json: { hours: Number.parseFloat(editHoursText) || 0 },
      });
      success("Hours updated");
      setEditingId(null);
      router.refresh();
    } catch (caught) {
      setRowError(
        caught instanceof ApiClientError ? caught.message : "Something went wrong.",
      );
    } finally {
      setRowPending(false);
    }
  }

  async function removeEntry(id: string) {
    setRowPending(true);
    setRowError(null);
    try {
      await apiFetch(`/api/next-pay/entries/${id}`, { method: "DELETE" });
      success("Day removed", "Its hours no longer count toward your next pay.");
      router.refresh();
    } catch (caught) {
      setRowError(
        caught instanceof ApiClientError ? caught.message : "Something went wrong.",
      );
    } finally {
      setRowPending(false);
    }
  }

  function onHoursText(value: string): string {
    return /^[0-9]*\.?[0-9]*$/.test(value) ? value : hoursText;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Estimated next pay"
          description="Every hour you log below, at your hourly rate, minus tax."
          icon={<Clock className="h-4 w-4" />}
          action={<Badge tone="info">Estimate</Badge>}
        />
        <CardBody className="space-y-4">
          <div className="rounded-xl bg-surface-2 px-4 py-3.5">
            <p className="text-[11px] text-muted-foreground">Take-home estimate</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-positive">
              {formatMoney(netCents, { currency })}
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              This estimate is only shown here and on the dashboard. It is never added to
              your net worth, transactions or forecast.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Hours logged" value={`${totalHours} h`} />
            <MiniStat label="Gross pay" value={formatMoney(grossCents, { currency })} />
            <MiniStat
              label={`Tax (${settings.taxPercent}%)`}
              value={`−${formatMoney(taxCents, { currency })}`}
            />
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <form
          onSubmit={saveSettings}
          noValidate
          className="rounded-xl border border-border bg-surface p-4"
        >
          <p className="text-xs font-medium text-foreground">Pay settings</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Change your hourly rate or tax percentage any time — the estimate recalculates
            from the hours already logged.
          </p>

          {settingsError ? (
            <p role="alert" className="mt-3 rounded-lg bg-negative-soft px-3 py-2 text-xs text-negative">
              {settingsError}
            </p>
          ) : null}

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field
              label="Hourly rate"
              htmlFor="work-rate"
              error={settingsFields.hourlyRateCents}
              required
            >
              <MoneyInput
                id="work-rate"
                valueCents={rateCents}
                onValueChange={setRateCents}
                currency={currency}
              />
            </Field>
            <Field
              label="Tax percentage"
              htmlFor="work-tax"
              error={settingsFields.taxPercent}
              hint="The share of gross pay withheld, e.g. 20 for 20%."
            >
              <Input
                id="work-tax"
                inputMode="decimal"
                value={taxText}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw === "" || /^[0-9]*\.?[0-9]*$/.test(raw)) setTaxText(raw);
                }}
                placeholder="0"
                className="tabular-nums"
              />
            </Field>
          </div>

          <div className="mt-4">
            <Button type="submit" loading={settingsPending}>
              Save settings
            </Button>
          </div>
        </form>

        <form
          onSubmit={addHours}
          noValidate
          className="rounded-xl border border-border bg-surface p-4"
        >
          <p className="text-xs font-medium text-foreground">Log hours</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Add the hours you worked on a day. Logging a day again replaces its hours.
          </p>

          {addError ? (
            <p role="alert" className="mt-3 rounded-lg bg-negative-soft px-3 py-2 text-xs text-negative">
              {addError}
            </p>
          ) : null}

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Date" htmlFor="work-date" error={addFields.date} required>
              <Input
                id="work-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <Field label="Hours worked" htmlFor="work-hours" error={addFields.hours} required>
              <Input
                id="work-hours"
                inputMode="decimal"
                value={hoursText}
                onChange={(event) => setHoursText(onHoursText(event.target.value))}
                placeholder="7.5"
                className="tabular-nums"
              />
            </Field>
          </div>

          <div className="mt-4">
            <Button type="submit" loading={addPending}>
              <Plus className="h-4 w-4" aria-hidden />
              Add hours
            </Button>
          </div>
        </form>
      </div>

      <Card>
        <CardHeader
          title="Work log"
          description="Remove days once you have been paid for them, so the estimate covers only your next pay."
        />
        <CardBody>
          {rowError ? (
            <p role="alert" className="mb-3 rounded-lg bg-negative-soft px-3 py-2 text-xs text-negative">
              {rowError}
            </p>
          ) : null}
          {entries.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No hours logged yet. Add your first day above.
            </p>
          ) : (
            <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border">
              {entries.map((entry) => {
                const dayGrossCents = Math.round(entry.hours * settings.hourlyRateCents);
                const editing = editingId === entry.id;
                return (
                  <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {formatDate(entry.date, "EEE, MMM d, yyyy")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.hours} h · {formatMoney(dayGrossCents, { currency })} gross
                      </p>
                    </div>
                    {editing ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Input
                          aria-label={`Hours worked on ${entry.date}`}
                          inputMode="decimal"
                          value={editHoursText}
                          onChange={(event) => {
                            const raw = event.target.value;
                            if (raw === "" || /^[0-9]*\.?[0-9]*$/.test(raw)) {
                              setEditHoursText(raw);
                            }
                          }}
                          className="h-8 w-20 tabular-nums"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Save hours"
                          loading={rowPending}
                          onClick={() => saveEdit(entry.id)}
                        >
                          <Check className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Cancel editing"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-sm font-medium tabular-nums">
                          {entry.hours} h
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit hours for ${entry.date}`}
                          onClick={() => {
                            setEditingId(entry.id);
                            setEditHoursText(String(entry.hours));
                            setRowError(null);
                          }}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${entry.date}`}
                          className="text-muted-foreground transition-colors hover:text-negative"
                          loading={rowPending}
                          onClick={() => removeEntry(entry.id)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}