import { requireUser } from "@/lib/auth/guard";
import { describeAssumptions, runForecast } from "@/lib/services/finance/forecast";
import { buildAssumptions } from "@/lib/services/finance/forecastService";
import { Card, CardBody, CardHeader, Badge, EmptyState } from "@/components/ui/card";
import { ForecastChart } from "@/components/app/charts";
import { formatMoney, formatPercent } from "@/lib/utils/money";
import { formatMonthLabel } from "@/lib/utils/date";
import Link from "next/link";
import { SCENARIOS, SCENARIO_META, type Scenario } from "@/lib/types";

export const dynamic = "force-dynamic";

const HORIZONS = [6, 12, 24, 60] as const;
type Horizon = (typeof HORIZONS)[number];

function isScenario(value: string | undefined): value is Scenario {
  return SCENARIOS.includes(value as Scenario);
}

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string; months?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const scenario: Scenario = isScenario(params.scenario) ? params.scenario : "trend";
  const parsedMonths = Number(params.months);
  const months: Horizon = (HORIZONS as readonly number[]).includes(parsedMonths)
    ? (parsedMonths as Horizon)
    : 12;

  const assumptions = await buildAssumptions(user.id);
  const result = runForecast({ assumptions, months }, scenario);

  const currency = user.currency;
  const money = (cents: number, options?: { signed?: boolean }) =>
    formatMoney(cents, { currency, ...options });

  const chartPoints = result.points.map((point) => ({
    label: formatMonthLabel(point.month),
    netWorthCents: point.netWorthCents,
  }));

  const assumptionRows = describeAssumptions(result.assumptions, currency);
  const monthlySavings = assumptions.averageMonthlySavingsCents;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Forecast</h1>
          <p className="text-xs text-muted-foreground">
            Projections based on your own records — clearly labelled estimates
          </p>
        </div>
        <ForecastControls scenario={scenario} months={months} />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardBody>
            <p className="text-xs text-muted-foreground">Scenario</p>
            <p className="text-xl font-semibold">{SCENARIO_META[scenario].label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{SCENARIO_META[scenario].summary}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-muted-foreground">Projected net worth</p>
            <p className="text-xl font-semibold tabular-nums">{money(result.finalNetWorthCents)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">in {result.months} months</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-muted-foreground">Savings balance</p>
            <p className="text-xl font-semibold tabular-nums">{money(result.finalSavingsCents)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">cash + savings accounts</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-muted-foreground">Investment balance</p>
            <p className="text-xl font-semibold tabular-nums">{money(result.finalInvestmentsCents)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {money(result.totalGrowthCents, { signed: true })} growth ·{" "}
              {money(result.totalContributionsCents)} contributed
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Projected net worth"
          description={`Savings plus investments, compounded at ${formatPercent(result.assumptions.investmentReturnRatio)} per year`}
        />
        <CardBody>
          <ForecastChart data={chartPoints} currency={currency} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Assumptions" description="Explicit inputs used for this projection" />
        <CardBody>
          <dl className="grid gap-3 md:grid-cols-2">
            {assumptionRows.map((row) => (
              <div key={row.label} className="space-y-0.5">
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd className="text-sm font-semibold tabular-nums">{row.value}</dd>
                <dd className="text-xs leading-relaxed text-muted-foreground">{row.detail}</dd>
              </div>
            ))}
          </dl>
          <Badge tone="info" className="mt-4">
            Forecast — not financial advice
          </Badge>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Milestones"
          description="Net worth thresholds this trajectory crosses"
        />
        <CardBody>
          {result.milestones.length === 0 ? (
            <EmptyState
              title="No milestones in this horizon"
              description={`At ${money(monthlySavings)} average monthly savings and ${money(result.assumptions.monthlyInvestmentContributionCents)} invested per month, try a longer horizon to see the projected curve.`}
            />
          ) : (
            <ul className="divide-y divide-border/50">
              {result.milestones.map((milestone) => (
                <li key={milestone.label} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm font-medium">{milestone.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatMonthLabel(milestone.date.slice(0, 7))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Monthly projection" />
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 text-left">Month</th>
                  <th className="py-2 text-right">Savings</th>
                  <th className="py-2 text-right">Investments</th>
                  <th className="py-2 text-right">Contributed</th>
                  <th className="py-2 text-right">Growth</th>
                  <th className="py-2 text-right">Net worth</th>
                </tr>
              </thead>
              <tbody>
                {result.points.map((point) => (
                  <tr key={point.month} className="border-b border-border/50">
                    <td className="py-2">{formatMonthLabel(point.month)}</td>
                    <td className="py-2 text-right tabular-nums">{money(point.savingsCents)}</td>
                    <td className="py-2 text-right tabular-nums">{money(point.investmentsCents)}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {money(point.cumulativeContributionsCents)}
                    </td>
                    <td
                      className={`py-2 text-right tabular-nums ${point.cumulativeGrowthCents >= 0 ? "text-positive" : "text-negative"}`}
                    >
                      {money(point.cumulativeGrowthCents, { signed: true })}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {money(point.netWorthCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/** Scenario + horizon switcher rendered as plain links, so the page stays a server component. */
function ForecastControls({
  scenario,
  months,
}: {
  scenario: Scenario;
  months: Horizon;
}) {
  const linkClass = (active: boolean) =>
    [
      "inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
      active
        ? "bg-surface text-foreground shadow-sm ring-1 ring-border"
        : "text-muted-foreground hover:text-foreground",
    ].join(" ");

  const containerClass =
    "inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5";

  return (
    <div className="flex flex-wrap gap-2">
      <div className={containerClass} role="group" aria-label="Scenario">
        {SCENARIOS.map((value) => (
          <Link
            key={value}
            href={`/forecast?scenario=${value}&months=${months}`}
            aria-current={value === scenario ? "true" : undefined}
            className={linkClass(value === scenario)}
          >
            {SCENARIO_META[value].label}
          </Link>
        ))}
      </div>
      <div className={containerClass} role="group" aria-label="Horizon">
        {HORIZONS.map((value) => (
          <Link
            key={value}
            href={`/forecast?scenario=${scenario}&months=${value}`}
            aria-current={value === months ? "true" : undefined}
            className={linkClass(value === months)}
          >
            {value >= 12 ? `${value / 12}y` : `${value}m`}
          </Link>
        ))}
      </div>
    </div>
  );
}