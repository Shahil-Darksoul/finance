import { requireUser } from "@/lib/auth/guard";
import { getCalendarEvents } from "@/lib/services/finance/calendar";
import { listBills } from "@/lib/repo/bills";
import { listAccounts } from "@/lib/repo/accounts";
import { DEPOSIT_ACCOUNT_TYPES } from "@/lib/types";
import { Card, CardBody, CardHeader, EmptyState, Badge } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { CalendarView } from "@/components/app/calendar-view";
import { Calendar, Receipt, Plus } from "lucide-react";
import Link from "next/link";
import { formatMoney } from "@/lib/utils/money";
import { nextBillDate } from "@/lib/services/finance/obligations";
import type { BadgeTone } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Every source gets one tone, reused by both the month grid and the agenda so a
 * bill cannot be one colour in the grid and another in the list.
 */
export const SOURCE_META: Record<
  string,
  { label: string; tone: BadgeTone; dot: string; scheduled: boolean }
> = {
  bill: { label: "Bill", tone: "warning", dot: "bg-warning", scheduled: true },
  emi: { label: "EMI", tone: "negative", dot: "bg-negative", scheduled: true },
  sip: { label: "SIP / Investment plan", tone: "accent", dot: "bg-accent", scheduled: true },
  recurring: { label: "Subscription", tone: "info", dot: "bg-info", scheduled: true },
  payday: { label: "Payday", tone: "positive", dot: "bg-positive", scheduled: true },
  goal: { label: "Goal", tone: "primary", dot: "bg-primary", scheduled: true },
  transaction: { label: "Recorded", tone: "neutral", dot: "bg-muted-foreground", scheduled: false },
  investment: { label: "Recorded", tone: "neutral", dot: "bg-muted-foreground", scheduled: false },
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const anchor = parseMonth(params.month);

  // Window covers the whole month plus the trailing days a 6-week grid needs.
  const from = startOfGrid(anchor);
  const to = endOfGrid(anchor);

  const [events, bills, allAccounts] = await Promise.all([
    getCalendarEvents(user.id, from, to),
    listBills(user.id),
    listAccounts(user.id),
  ]);
  const accounts = allAccounts
    .filter((account) => DEPOSIT_ACCOUNT_TYPES.includes(account.type))
    .map((account) => ({ id: account.id, name: account.name }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Calendar</h1>
          <p className="text-xs text-muted-foreground">
            Everything scheduled to move money this month — bills, EMIs, paydays and goal
            contributions — plus what you actually recorded.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/bills/new?kind=emi" className={buttonClass({ variant: "outline", size: "sm" })}>
            <Plus className="h-4 w-4" />
            Add EMI
          </Link>
          <Link href="/settings?tab=paydays" className={buttonClass({ variant: "outline", size: "sm" })}>
            <Plus className="h-4 w-4" />
            Add payday
          </Link>
          <Link href="/bills/new" className={buttonClass({ size: "sm" })}>
            <Plus className="h-4 w-4" />
            Add bill
          </Link>
        </div>
      </div>

      <CalendarView
        anchorISO={anchor}
        events={events.map((event) => ({
          id: event.id,
          date: event.date,
          title: event.title,
          amountCents: event.amountCents,
          source: event.source,
          recurring: event.recurring,
          amountEdited: event.amountEdited,
          accountId: event.accountId,
          type: event.type,
          merchant: event.merchant,
        }))}
        accounts={accounts}
        currency={user.currency}
      />

      <Card>
        <CardHeader
          title="Your schedule"
          description="Every active bill and loan, with its next due date. Anything with a monthly contribution also shows on the grid above."
        />
        <CardBody>
          {bills.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-6 w-6" />}
              title="No bills or loans yet"
              description="Add your rent, utilities, subscriptions or a loan and they will appear here and on the calendar."
              action={
                <Link href="/bills/new" className={buttonClass({ size: "sm" })}>
                  <Plus className="h-4 w-4" />
                  Add your first bill
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-border/50">
              {bills.map((bill) => {
                const due = nextBillDate(bill);
                const meta = SOURCE_META[bill.kind === "emi" ? "emi" : bill.kind === "sip" ? "sip" : "bill"];
                const oneTime = bill.endDate === bill.startDate;
                return (
                  <li key={bill.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{bill.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {oneTime
                            ? `Once on ${formatDue(bill.startDate)}`
                            : bill.frequency === "monthly"
                              ? `Monthly on day ${bill.dueDay}`
                              : bill.frequency}
                          {bill.autopay ? " · autopay" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {due ? (
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          next {formatDue(due)}
                        </span>
                      ) : null}
                      <span className="text-sm font-medium tabular-nums">
                        {formatMoney(bill.amountCents, { currency: user.currency })}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="How to read this" />
        <CardBody className="space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Scheduled</span> items are what you
            told the app to expect: bills, loan instalments, paydays and the monthly amount
            going into each savings goal. <span className="font-medium text-foreground">Recorded</span>{" "}
            items are transactions you already entered. A scheduled item is not a promise
            that the payment happened — it is a reminder to check.
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(SOURCE_META).map(([key, meta]) => (
              <span key={key} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${meta.dot}`} aria-hidden />
                {meta.label}
              </span>
            ))}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" aria-hidden />
            Use the arrows to move between months, or Today to come back.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

/** Accepts `YYYY-MM`, defaults to the current month. */
function parseMonth(value: string | undefined): string {
  const today = new Date();
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split("-").map(Number);
    if (year >= 1970 && year <= 9999 && month >= 1 && month <= 12) {
      return value;
    }
  }
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

/** First day of the 6-week grid: the Monday on or before the 1st. */
function startOfGrid(anchor: string): Date {
  const first = new Date(`${anchor}-01T00:00:00`);
  const weekday = first.getDay();
  const offset = weekday === 0 ? 6 : weekday - 1;
  first.setDate(first.getDate() - offset);
  return first;
}

/** Last day of the 6-week grid. */
function endOfGrid(anchor: string): Date {
  const start = startOfGrid(anchor);
  const end = new Date(start);
  end.setDate(end.getDate() + 41);
  return end;
}

function formatDue(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}