import { requireUser } from "@/lib/auth/guard";
import { getAnalytics } from "@/lib/services/finance/analytics";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { IncomeExpenseChart, CategoryDonut, NetWorthChart } from "@/components/app/charts";
import { formatMoney, formatPercent } from "@/lib/utils/money";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await requireUser();
  const analytics = await getAnalytics(user.id, "6m");

  const flowPoints = analytics.monthlySeries.map(p => ({
    label: new Date(p.month + '-01').toLocaleDateString('en-US', { month: 'short' }),
    incomeCents: p.incomeCents,
    expenseCents: p.expenseCents,
  }));

  const nwPoints = analytics.netWorthSeries.slice(-12).map((p) => ({
    label: new Date(p.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    netWorthCents: p.netWorthCents,
  }));

  const catSlices = analytics.expenseByCategory.slice(0, 10).map(c => ({
    name: c.categoryName,
    amountCents: c.amountCents,
    ratio: c.ratio,
    color: c.color,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Analytics</h1>
        <p className="text-xs text-muted-foreground">Trends and breakdowns from your own records</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Income vs Spending (6m)" />
          <CardBody><IncomeExpenseChart data={flowPoints} currency={user.currency} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Net Worth" />
          <CardBody><NetWorthChart data={nwPoints} currency={user.currency} /></CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Spending by Category" />
        <CardBody><CategoryDonut data={catSlices} currency={user.currency} /></CardBody>
      </Card>

      <Card>
        <CardHeader title="Totals (6m)" />
        <CardBody>
          <div className="grid gap-3 md:grid-cols-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Income</p>
              <p className="font-semibold tabular-nums">{formatMoney(analytics.totals.incomeCents, { currency: user.currency })}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Expenses</p>
              <p className="font-semibold tabular-nums text-negative">{formatMoney(analytics.totals.expenseCents, { currency: user.currency })}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Savings</p>
              <p className="font-semibold tabular-nums text-positive">{formatMoney(analytics.totals.savingsCents, { currency: user.currency })}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Savings Rate</p>
              <p className="font-semibold tabular-nums">{formatPercent(analytics.totals.savingsRate)}</p>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
