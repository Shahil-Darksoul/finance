"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { buttonClass } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils/money";
import { DeleteAgendaItem } from "./delete-agenda-item";
import { EditAgendaItem } from "./edit-agenda-item";
import { QuickAddItem } from "./quick-add-item";

export type CalendarEventInput = {
  id: string;
  date: string;
  title: string;
  amountCents: number;
  source: string;
  recurring: boolean;
  type?: string;
  merchant?: string | null;
  /** The account a scheduled item deposits into or draws from, when set. */
  accountId?: string | null;
  /** True for a payday whose amount was set for this date. */
  amountEdited?: boolean;
};

type SourceStyle = { label: string; dot: string; scheduled: boolean };

/** Kept in sync with SOURCE_META on the page; both views must agree. */
const SOURCE_STYLES: Record<string, SourceStyle> = {
  bill: { label: "Bill", dot: "bg-warning", scheduled: true },
  emi: { label: "EMI", dot: "bg-negative", scheduled: true },
  sip: { label: "SIP / Investment plan", dot: "bg-accent", scheduled: true },
  recurring: { label: "Subscription", dot: "bg-info", scheduled: true },
  payday: { label: "Payday", dot: "bg-positive", scheduled: true },
  goal: { label: "Goal", dot: "bg-primary", scheduled: true },
  transaction: { label: "Recorded", dot: "bg-muted-foreground", scheduled: false },
  investment: { label: "Recorded", dot: "bg-muted-foreground", scheduled: false },
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Beyond this, a day cell is unreadable, so the agenda list takes over. */
const MAX_CHIPS_PER_DAY = 3;

export function CalendarView({
  anchorISO,
  events,
  accounts,
  currency,
}: {
  anchorISO: string;
  events: CalendarEventInput[];
  accounts: { id: string; name: string }[];
  currency: string;
}) {
  const [selected, setSelected] = React.useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = React.useState(false);

  const byDate = React.useMemo(() => {
    const map = new Map<string, CalendarEventInput[]>();
    for (const event of events) {
      const bucket = map.get(event.date);
      if (bucket) bucket.push(event);
      else map.set(event.date, [event]);
    }
    // Money out first, then money in, then anything with no amount.
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.amountCents - b.amountCents);
    }
    return map;
  }, [events]);

  const weeks = React.useMemo(() => buildWeeks(anchorISO), [anchorISO]);
  const monthLabel = new Date(`${anchorISO}-01T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const todayISO = toISODate(new Date());
  const selectedEvents = selected ? (byDate.get(selected) ?? []) : [];

  // The next upcoming payday that has no amount set yet stays highlighted until
  // its amount is entered; then the following one takes over.
  const needsAmountId = React.useMemo(() => {
    const upcoming = events
      .filter((event) => event.source === "payday" && !event.amountEdited && event.date >= todayISO)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    return upcoming[0]?.id ?? null;
  }, [events, todayISO]);
  const needsAmountEvent =
    needsAmountId != null ? events.find((event) => event.id === needsAmountId) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Link
            href={monthHref(shiftMonth(anchorISO, -1))}
            aria-label="Previous month"
            className={buttonClass({ variant: "ghost", size: "icon" })}
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <Link
            href={monthHref(shiftMonth(anchorISO, 1))}
            aria-label="Next month"
            className={buttonClass({ variant: "ghost", size: "icon" })}
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
          <h2 className="ml-1 text-sm font-semibold">{monthLabel}</h2>
        </div>
        <Link href="/calendar" className={buttonClass({ variant: "outline", size: "sm" })}>
          <CalendarDays className="h-4 w-4" />
          Today
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="grid grid-cols-7 border-b border-border bg-surface-2">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="px-2 py-2 text-center text-[11px] font-medium text-muted-foreground"
            >
              <span className="hidden sm:inline">{day}</span>
              <span className="sm:hidden">{day.charAt(0)}</span>
            </div>
          ))}
        </div>

        {weeks.map((week, weekIndex) => (
          <div
            key={weekIndex}
            className={cn(
              "grid grid-cols-7",
              weekIndex < weeks.length - 1 && "border-b border-border",
            )}
          >
            {week.map((day) => {
              const dayEvents = byDate.get(day.iso) ?? [];
              const inMonth = day.inMonth;
              const isToday = day.iso === todayISO;
              const isSelected = day.iso === selected;
              const outgoing = dayEvents.filter((e) => e.amountCents < 0).length;
              const incoming = dayEvents.filter((e) => e.amountCents > 0).length;

              return (
                <button
                  key={day.iso}
                  type="button"
                  onClick={() => setSelected(isSelected ? null : day.iso)}
                  aria-pressed={isSelected}
                  aria-label={`${day.iso}${dayEvents.length ? `, ${dayEvents.length} items` : ""}`}
                  className={cn(
                    "min-h-[5.5rem] space-y-1 border-border p-1.5 text-left align-top transition-colors sm:min-h-[6.5rem]",
                    "not-last:border-r",
                    "hover:bg-surface-2 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-primary",
                    isSelected && "bg-primary-soft ring-1 ring-primary ring-inset",
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={cn(
                        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-medium tabular-nums",
                        isToday
                          ? "bg-primary text-primary-foreground"
                          : inMonth
                            ? "text-foreground"
                            : "text-muted-foreground/50",
                      )}
                    >
                      {day.day}
                    </span>
                    {dayEvents.length ? (
                      <span className="hidden shrink-0 gap-1 text-[10px] tabular-nums sm:flex">
                        {outgoing ? <span className="text-negative">−{outgoing}</span> : null}
                        {incoming ? <span className="text-positive">+{incoming}</span> : null}
                      </span>
                    ) : null}
                  </div>

                  <div className="space-y-0.5">
                    {dayEvents.slice(0, MAX_CHIPS_PER_DAY).map((event) => {
                      const style = SOURCE_STYLES[event.source] ?? SOURCE_STYLES.bill;
                      const needsAmount = event.id === needsAmountId;
                      return (
                        <div
                          key={event.id}
                          title={`${event.title} · ${formatMoney(event.amountCents, { currency })}`}
                          className={cn(
                            "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] leading-tight",
                            inMonth ? "text-foreground" : "text-muted-foreground/60",
                            needsAmount &&
                              "bg-positive-soft font-semibold ring-1 ring-positive ring-inset",
                          )}
                        >
                          <span
                            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", style.dot)}
                            aria-hidden
                          />
                          <span className="truncate">{event.title}</span>
                        </div>
                      );
                    })}
                    {dayEvents.length > MAX_CHIPS_PER_DAY ? (
                      <p className="px-1 text-[10px] text-muted-foreground">
                        +{dayEvents.length - MAX_CHIPS_PER_DAY} more
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Agenda</h3>
          <p className="text-xs text-muted-foreground">
            Every date this month, with all of its items.
          </p>
        </div>

        {selected ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-primary-soft px-4 py-2 text-xs text-foreground">
            <p>
              Showing {formatDayLabel(selected)} —{" "}
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="font-medium underline underline-offset-2"
              >
                show the whole month
              </button>
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuickAddOpen(true)}
              className="h-7 px-2 text-[11px]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add bill, EMI or payday
            </Button>
          </div>
        ) : null}

        {needsAmountEvent ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-positive-soft px-4 py-2 text-xs text-foreground">
            <p>
              <span className="font-medium">{needsAmountEvent.title}</span> on{" "}
              <button
                type="button"
                onClick={() => setSelected(needsAmountEvent.date)}
                className="font-medium underline underline-offset-2"
              >
                {formatDayLabel(needsAmountEvent.date)}
              </button>{" "}
              needs its amount — tap the pencil and type what this check paid.
            </p>
          </div>
        ) : null}

        <AgendaList
          events={selected ? selectedEvents : events}
          accounts={accounts}
          currency={currency}
          filterMonth={selected ? null : anchorISO}
          onAddItem={selected ? () => setQuickAddOpen(true) : undefined}
          needsAmountId={needsAmountId}
        />
      </div>

      {selected ? (
        <QuickAddItem
          key={`${selected}:${quickAddOpen}`}
          open={quickAddOpen}
          onClose={() => setQuickAddOpen(false)}
          date={selected}
          currency={currency}
        />
      ) : null}
    </div>
  );
}

function AgendaList({
  events,
  accounts,
  currency,
  filterMonth,
  onAddItem,
  needsAmountId,
}: {
  events: CalendarEventInput[];
  accounts: { id: string; name: string }[];
  currency: string;
  filterMonth: string | null;
  onAddItem?: () => void;
  needsAmountId: string | null;
}) {
  const grouped = React.useMemo(() => {
    const map = new Map<string, CalendarEventInput[]>();
    for (const event of events) {
      if (filterMonth && !event.date.startsWith(filterMonth)) continue;
      const bucket = map.get(event.date);
      if (bucket) bucket.push(event);
      else map.set(event.date, [event]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events, filterMonth]);

  // Scheduled items first within a day, so what is owed leads the list.
  for (const [, bucket] of grouped) {
    bucket.sort((a, b) => {
      const aScheduled = SOURCE_STYLES[a.source]?.scheduled ? 0 : 1;
      const bScheduled = SOURCE_STYLES[b.source]?.scheduled ? 0 : 1;
      if (aScheduled !== bScheduled) return aScheduled - bScheduled;
      return a.amountCents - b.amountCents;
    });
  }

  if (grouped.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          {filterMonth
            ? "Nothing scheduled this month."
            : "Nothing scheduled on this date."}
        </p>
        {onAddItem ? (
          <Button variant="outline" size="sm" onClick={onAddItem} className="mt-3">
            <Plus className="h-4 w-4" aria-hidden />
            Add a bill, EMI or payday
          </Button>
        ) : null}
      </div>
    );
  }

  const totals = grouped.reduce(
    (acc, [, bucket]) => {
      for (const event of bucket) {
        if (event.amountCents < 0) acc.out += event.amountCents;
        else acc.in += event.amountCents;
      }
      return acc;
    },
    { in: 0, out: 0 },
  );

  return (
    <>
      <ul className="divide-y divide-border/50">
        {grouped.map(([date, bucket]) => {
          const dayOut = bucket.filter((e) => e.amountCents < 0);
          const dayIn = bucket.filter((e) => e.amountCents > 0);
          return (
            <li key={date} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{formatDayLabel(date)}</p>
                <p className="text-xs tabular-nums">
                  {dayOut.length ? (
                    <span className="text-negative">
                      −{formatMoney(
                        dayOut.reduce((sum, e) => sum + Math.abs(e.amountCents), 0),
                        { currency, compact: true },
                      )}
                    </span>
                  ) : null}
                  {dayOut.length && dayIn.length ? (
                    <span className="px-1 text-muted-foreground">·</span>
                  ) : null}
                  {dayIn.length ? (
                    <span className="text-positive">
                      +{formatMoney(
                        dayIn.reduce((sum, e) => sum + e.amountCents, 0),
                        { currency, compact: true },
                      )}
                    </span>
                  ) : null}
                </p>
              </div>

              <ul className="mt-1.5 space-y-1">
                {bucket.map((event) => {
                  const style = SOURCE_STYLES[event.source] ?? SOURCE_STYLES.bill;
                  const needsAmount = event.id === needsAmountId;
                  return (
                    <li
                      key={event.id}
                      className={cn(
                        "flex items-center justify-between gap-2 text-sm",
                        needsAmount && "rounded-lg bg-positive-soft/60 ring-1 ring-positive ring-inset",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", style.dot)}
                          aria-hidden
                        />
                        <span className="truncate">{event.title}</span>
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {style.label}
                        </span>
                        {event.recurring ? (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            repeats
                          </span>
                        ) : null}
                        {needsAmount ? (
                          <span className="shrink-0 rounded-full bg-positive-soft px-1.5 py-0.5 text-[10px] font-medium text-positive ring-1 ring-inset ring-positive">
                            set amount
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <span
                          className={cn(
                            "shrink-0 tabular-nums",
                            event.amountCents < 0
                              ? "text-negative"
                              : event.amountCents > 0
                                ? "text-positive"
                                : "text-muted-foreground",
                          )}
                        >
                          {formatMoney(event.amountCents, { currency })}
                        </span>
                        <EditAgendaItem event={event} accounts={accounts} currency={currency} />
                        <DeleteAgendaItem event={event} currency={currency} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs">
        <span className="text-muted-foreground">
          {grouped.length} day{grouped.length === 1 ? "" : "s"} with activity
        </span>
        <span className="tabular-nums">
          <span className="text-negative">
            −{formatMoney(Math.abs(totals.out), { currency, compact: true })}
          </span>
          <span className="px-1 text-muted-foreground">·</span>
          <span className="text-positive">
            +{formatMoney(totals.in, { currency, compact: true })}
          </span>
        </span>
      </div>
    </>
  );
}

/** Six weeks starting on the Monday on or before the 1st. */
function buildWeeks(anchorISO: string): { iso: string; day: number; inMonth: boolean }[][] {
  const first = new Date(`${anchorISO}-01T00:00:00`);
  const weekday = first.getDay();
  const start = new Date(first);
  start.setDate(start.getDate() - (weekday === 0 ? 6 : weekday - 1));

  const month = first.getMonth();
  const weeks: { iso: string; day: number; inMonth: boolean }[][] = [];

  for (let week = 0; week < 6; week += 1) {
    const days: { iso: string; day: number; inMonth: boolean }[] = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + week * 7 + offset);
      days.push({
        iso: toISODate(date),
        day: date.getDate(),
        inMonth: date.getMonth() === month,
      });
    }
    weeks.push(days);
  }

  return weeks;
}

function shiftMonth(anchorISO: string, delta: number): string {
  const date = new Date(`${anchorISO}-01T00:00:00`);
  date.setMonth(date.getMonth() + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthHref(anchorISO: string): string {
  return `/calendar?month=${anchorISO}`;
}

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function formatDayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
