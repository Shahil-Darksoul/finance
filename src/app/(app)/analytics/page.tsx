import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CreditCard,
  PiggyBank,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import {
  getAnalytics,
  RANGE_PRESETS,
  type RangeValue,
} from "@/lib/services/finance/analytics";
import { getFinancialHealth, buildInsights } from "@/lib/services/finance/insights";
import {
  CategoryDonut,
  IncomeExpenseChart,
  MonthlySavingsChart,
  NetWorthChart,
} from "@/components/app/charts";
import { StatTile, TrendChip } from "@/components/app/stat-tile";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { ProgressBar, ProgressRing } from "@/components/ui/progress";
import { formatMoney, formatPercent } from "@/lib/utils/money";
import { DEFAULT_CURRENCY } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

const RANGE_VALUES = RANGE_PRESETS.map((preset) => preset.value);
const RANGE_CHOICES: RangeValue[] = ["7d", "30d", "3m", "6m", "1y", "all"];

/** Charts and the table only plot the most recent 36 months, even for "all". */
const MAX_SERIES_MONTHS = 36;

function parseRange(value: string | undefined): RangeValue {
  if (value && (RANGE_VALUES as readonly string[]).includes(value)) {
    return value as RangeValue;
  }
  return "6m";
}

function shortMonth(month: string): string {
  const date = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return month;
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function directionOf(ratio: number): "up" | "down" | "flat" {
  if (ratio > 0.001) return "up";
  if (ratio < -0.001) return "down";
  return "flat";
}

const INSIGHT_TONE = {
  positive: "positive",
  neutral: "neutral",
  watch: "warning",
  info: "info",
} as const;

const INSIGHT_BASIS = {
  fact: "Your records",
  calculation: "Calculated",
  estimate: "Estimate",
  forecast: "Forecast",
} as const;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const range = parseRange(params.range);

  const money = formatMoney;

  const [analytics, health, insights] = await Promise.all([
    getAnalytics(user.id, range),
    getFinancialHealth(user.id, DEFAULT_CURRENCY, money),
    buildInsights(user.id, DEFAULT_CURRENCY, money),
  ]);

  const series =
    analytics.monthlySeries.length > MAX_SERIES_MONTHS
      ? analytics.monthlySeries.slice(-MAX_SERIES_MONTHS)
      : analytics.monthlySeries;

  const flowPoints = series.map((p) => ({
    label: shortMonth(p.month),
    incomeCents: p.incomeCents,
    expenseCents: p.expenseCents,
  }));

  const savingsPoints = series.map((p) => ({
    label: shortMonth(p.month),
    savingsCents: p.savingsCents,
  }));

  const catSlices = analytics.expenseByCategory.slice(0, 10).map((c) => ({
    name: c.categoryName,
    amountCents: c.amountCents,
    ratio: c.ratio,
    color: c.color,
  }));

  const incomeSlices = analytics.incomeByCategory.slice(0, 6).map((c) => ({
    name: c.categoryName,
    amountCents: c.amountCents,
    ratio: c.ratio,
    color: c.color,
  }));

  const nwPoints = analytics.netWorthSeries.slice(-18).map((p) => ({
    label: new Date(`${p.date}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    netWorthCents: p.netWorthCents,
  }));

  // Best and worst months by money kept, for a quick "range at a glance".
  const ranked = [...series].sort((a, b) => b.savingsCents - a.savingsCents);
  const bestMonth = ranked[0];
  const worstMonth = ranked[ranked.length - 1];
  const monthlyRows = [...series].reverse();

  const incomeTrend = {
    ratio: analytics.growth.incomeRatio,
    direction: directionOf(analytics.growth.incomeRatio),
    hasBaseline: analytics.monthlySeries.length >= 2,
  };
  const expenseTrend = {
    ratio: analytics.growth.expenseRatio,
    direction: directionOf(analytics.growth.expenseRatio),
    hasBaseline: analytics.monthlySeries.length >= 2,
  };
  const savingsTrend = {
    ratio: analytics.growth.savingsRatio,
    direction: directionOf(analytics.growth.savingsRatio),
    hasBaseline: analytics.monthlySeries.length >= 2,
  };

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------- header */}
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Analytics</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Trends, breakdowns and health indicators from your own records
            {analytics.firstTransactionDate
              ? ` · track record starts ${analytics.firstTransactionDate}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </section>

      {/* -------------------------------------------------- range picker */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface-2 p-1">
        {RANGE_CHOICES.filter((value, index, all) => all.indexOf(value) === index).map((value) => {
          const preset = RANGE_PRESETS.find((entry) => entry.value === value);
          const active = value === range;
          return (
            <Link
              key={value}
              href={`/analytics?range=${value}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-surface text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {preset?.label ?? value}
            </Link>
          );
        })}
      </div>

      {!analytics.hasData ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<BarChart3 className="h-6 w-6" />}
              title="No activity to analyse yet"
              description="Add a few transactions, bills or goals and this page fills with trends from your own records."
              action={
                <Button asChild>
                  <Link href="/transactions/new">Add a transaction</Link>
                </Button>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <>
          {/* ------------------------------------------------------ KPIs */}
          <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label={`Income · ${analytics.range.label}`}
              value={money(analytics.totals.incomeCents)}
              emphasis
              icon={<TrendingUp className="h-4 w-4" />}
              footer={<TrendChip {...incomeTrend} label="second half vs first" />}
            />
            <StatTile
              label="Expenses"
              value={money(analytics.totals.expenseCents)}
              tone="negative"
              emphasis
              icon={<CreditCard className="h-4 w-4" />}
              footer={<TrendChip {...expenseTrend} inverted label="second half vs first" />}
            />
            <StatTile
              label="Net saved"
              value={money(analytics.totals.savingsCents)}
              tone={analytics.totals.savingsCents >= 0 ? "positive" : "negative"}
              emphasis
              icon={<PiggyBank className="h-4 w-4" />}
              footer={<TrendChip {...savingsTrend} label="second half vs first" />}
            />
            <StatTile
              label="Savings rate"
              value={formatPercent(analytics.totals.savingsRate)}
              emphasis
              icon={<Wallet className="h-4 w-4" />}
              hint={`Average ${formatPercent(analytics.averages.savingsRate)} per month`}
            />
          </section>

          {/* --------------------------------------------------- averages */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniCard
              label="Average income / month"
              value={money(analytics.averages.monthlyIncomeCents)}
              icon={<TrendingUp className="h-3.5 w-3.5" />}
            />
            <MiniCard
              label="Average spend / month"
              value={money(analytics.averages.monthlyExpenseCents)}
              icon={<TrendingDown className="h-3.5 w-3.5" />}
            />
            <MiniCard
              label="Best month kept"
              value={bestMonth ? money(bestMonth.savingsCents) : "—"}
              hint={bestMonth ? shortMonth(bestMonth.month) : undefined}
              tone="positive"
              icon={<ArrowUpRight className="h-3.5 w-3.5" />}
            />
            <MiniCard
              label="Weakest month kept"
              value={worstMonth ? money(worstMonth.savingsCents) : "—"}
              hint={worstMonth ? shortMonth(worstMonth.month) : undefined}
              tone={worstMonth && worstMonth.savingsCents < 0 ? "negative" : "neutral"}
              icon={<ArrowDownRight className="h-3.5 w-3.5" />}
            />
          </section>

          {/* ----------------------------------------------------- charts */}
          <section aria-label="Charts" className="grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Income vs spending"
                description={`${analytics.range.label} · month by month`}
                icon={<BarChart3 className="h-4 w-4" />}
              />
              <CardBody>
                <IncomeExpenseChart data={flowPoints} currency={DEFAULT_CURRENCY} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Net worth" description="Assets minus liabilities" />
              <CardBody>
                <NetWorthChart data={nwPoints} currency={DEFAULT_CURRENCY} />
              </CardBody>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader
                title="Money kept each month"
                description="Income minus spending. Green means you saved, red means you spent more than you earned."
                icon={<PiggyBank className="h-4 w-4" />}
              />
              <CardBody>
                <MonthlySavingsChart data={savingsPoints} currency={DEFAULT_CURRENCY} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Investments" description="Recorded return on your holdings" />
              <CardBody className="space-y-3">
                {analytics.investmentReturnRatio === null ? (
                  <p className="text-xs text-muted-foreground">
                    Add investment holdings or purchases to see contribution and return figures.
                  </p>
                ) : (
                  <>
                    <p
                      className={cn(
                        "text-3xl font-semibold tabular-nums tracking-tight",
                        analytics.investmentReturnRatio >= 0 ? "text-positive" : "text-negative",
                      )}
                    >
                      {formatPercent(analytics.investmentReturnRatio, { signed: true })}
                    </p>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Implied annual return based on your recorded contributions and current
                      market values. Market values change; this is a calculation, not a promise.
                    </p>
                    <Link
                      href="/investments"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      View portfolio
                      <ArrowUpRight className="h-3 w-3" aria-hidden />
                    </Link>
                  </>
                )}
              </CardBody>
            </Card>
          </section>

          {/* ------------------------------------------------- categories */}
          <section className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Where your money went"
                description={`Spending by category · ${analytics.range.label}`}
              />
              <CardBody>
                <CategoryDonut data={catSlices} currency={DEFAULT_CURRENCY} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title="Where it came from"
                description={`Income by category · ${analytics.range.label}`}
              />
              <CardBody>
                <CategoryDonut data={incomeSlices} currency={DEFAULT_CURRENCY} />
              </CardBody>
            </Card>
          </section>

          {/* ------------------------------------------------- money health */}
          <section id="health" aria-label="Money health" className="scroll-mt-20">
            <Card>
              <CardHeader
                title="Money health"
                description="Six indicators, each shown with what it measures and how it is scored."
                icon={<Sparkles className="h-4 w-4" />}
                action={<Badge tone="info">Not financial advice</Badge>}
              />
              <CardBody className="grid gap-6 lg:grid-cols-[220px_1fr]">
                <div className="flex flex-col items-center gap-3">
                  <ProgressRing
                    value={health.score}
                    size={168}
                    label={`${Math.round(health.score)}`}
                    caption="overall score"
                    tone={
                      health.score >= 70
                        ? "positive"
                        : health.score >= 45
                          ? "warning"
                          : "negative"
                    }
                  />
                  <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                    Each indicator contributes equally; unknown ones are excluded rather than
                    counted as zero.
                  </p>
                </div>

                <ul className="grid gap-3 sm:grid-cols-2">
                  {health.metrics.map((metric) => (
                    <li
                      key={metric.key}
                      className="rounded-xl border border-border px-3.5 py-3"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium text-foreground">
                          {metric.label}
                        </span>
                        <Badge tone={statusTone(metric.status)}>{metric.display}</Badge>
                      </div>
                      <ProgressBar
                        value={metric.ratio}
                        showValue={false}
                        size="sm"
                        tone={statusTone(metric.status)}
                        className="mt-2"
                      />
                      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                        {metric.explanation}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </section>

          {/* --------------------------------------------------- patterns */}
          {insights.length > 0 ? (
            <section aria-label="Patterns">
              <Card>
                <CardHeader
                  title="Patterns worth noticing"
                  description="Derived from your records. Each has the figures behind it."
                  icon={<Sparkles className="h-4 w-4" />}
                />
                <CardBody>
                  <ul className="grid gap-2.5 sm:grid-cols-2">
                    {insights.map((insight) => (
                      <li
                        key={insight.id}
                        className="rounded-xl border border-border px-3.5 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium leading-snug">{insight.title}</p>
                          <Badge tone={INSIGHT_TONE[insight.kind]}>
                            {INSIGHT_BASIS[insight.basis]}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {insight.detail}
                        </p>
                        {insight.evidence.length > 0 ? (
                          <details className="group mt-1.5">
                            <summary className="cursor-pointer text-[11px] text-muted-foreground/70 hover:text-primary">
                              Show the figures
                            </summary>
                            <ul className="mt-1 space-y-0.5">
                              {insight.evidence.map((line) => (
                                <li
                                  key={line}
                                  className="text-[11px] leading-relaxed text-muted-foreground/70"
                                >
                                  · {line}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </section>
          ) : null}

          {/* ------------------------------------------------ month table */}
          <section aria-label="Monthly breakdown">
            <Card>
              <CardHeader
                title="Monthly breakdown"
                description={`Every month in ${analytics.range.label}, newest first.`}
              />
              <CardBody className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="px-4 py-2 text-left font-medium">Month</th>
                        <th className="px-4 py-2 text-right font-medium">Income</th>
                        <th className="px-4 py-2 text-right font-medium">Expenses</th>
                        <th className="px-4 py-2 text-right font-medium">Net</th>
                        <th className="px-4 py-2 text-right font-medium">Savings rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyRows.map((row) => (
                        <tr key={row.month} className="border-b border-border/50 last:border-0">
                          <td className="px-4 py-2 font-medium">{shortMonth(row.month)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-positive">
                            {money(row.incomeCents)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-negative">
                            {money(row.expenseCents)}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-2 text-right font-medium tabular-nums",
                              row.savingsCents >= 0 ? "text-positive" : "text-negative",
                            )}
                          >
                            {money(row.savingsCents, { signed: true })}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                            {formatPercent(row.savingsRate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          </section>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-[11px] text-muted-foreground/70">
            <p>Ledgerly tracks your own records. Nothing here is financial advice.</p>
            <Link
              href="/forecast"
              className={buttonClass({ variant: "ghost", size: "sm" })}
            >
              Project these trends →
            </Link>
          </footer>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ helpers */

function statusTone(
  status: "good" | "fair" | "poor" | "unknown",
): "positive" | "warning" | "negative" | "info" {
  if (status === "good") return "positive";
  if (status === "fair") return "warning";
  if (status === "poor") return "negative";
  return "info";
}

function MiniCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <div className="card px-4 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums tracking-tight",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-[10px] text-muted-foreground/70">{hint}</p> : null}
    </div>
  );
}
