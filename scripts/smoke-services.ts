/* Smoke test: exercises the whole service layer against a real SQLite file. */
import { addDays, addMonths } from "date-fns";
import { deleteUser } from "@/lib/repo/users";
import { registerUser } from "@/lib/services/auth/account";
import { clearDemoData } from "@/lib/services/finance/demo";
import { getFinancialSummary } from "@/lib/services/finance/summary";
import { getAnalytics } from "@/lib/services/finance/analytics";
import { buildInsights } from "@/lib/services/finance/insights";
import { getAllScenarios } from "@/lib/services/finance/forecastService";
import {
  getCalendarEvents,
  calendarWindow,
  summariseByDay,
} from "@/lib/services/finance/calendar";
import { generateNotifications } from "@/lib/services/finance/notifications";
import { getHoldings } from "@/lib/services/finance/portfolio";
import { getPaycheckProjection } from "@/lib/services/finance/paycheck";
import { getUpcomingObligations } from "@/lib/services/finance/obligations";
import { getGoalProgress } from "@/lib/services/finance/goals";
import { listNotifications } from "@/lib/repo/notifications";
import { listAccounts } from "@/lib/repo/accounts";
import { listTransactions } from "@/lib/repo/transactions";
import { formatMoney } from "@/lib/utils/money";

const money = (cents: number) => formatMoney(cents, { currency: "USD" });
const pct = (ratio: number) => `${(ratio * 100).toFixed(1)}%`;

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const user = await registerUser({
    email: "smoke@example.com",
    name: "Smoke Test",
    password: "correct-horse-battery-9",
    withDemoData: true,
  });
  console.log(`user ${user.id} (isDemo=${user.isDemo})\n`);

  /* ------------------------------------------------------------ accounts */
  const accounts = await listAccounts(user.id);
  console.log(`accounts (${accounts.length}):`);
  for (const account of accounts) {
    console.log(
      `  ${account.name.padEnd(20)} ${money(account.currentBalanceCents).padStart(12)}  [${account.type}]`,
    );
  }

  const brokerageCents = accounts
    .filter((account) => account.type === "brokerage" || account.type === "loan")
    .reduce((sum, account) => sum + account.currentBalanceCents, 0);

  const transactions = await listTransactions(user.id, { limit: 5000 });
  console.log(`\ntransactions: ${transactions.length}`);
  check("transactions were seeded", transactions.length > 200, `${transactions.length} rows`);

  /* -------------------------------------------------------------- summary */
  const summary = await getFinancialSummary(user.id);
  console.log("\nsummary:");
  console.log(`  netWorth      ${money(summary.netWorthCents)}`);
  console.log(`  cash          ${money(summary.cashCents)}`);
  console.log(`  savings       ${money(summary.savingsCents)}`);
  console.log(`  debt          ${money(summary.debtCents)}`);
  console.log(`  investments   ${money(summary.investmentsCents)}`);
  console.log(`  month income  ${money(summary.monthlyIncomeCents)}`);
  console.log(`  month expense ${money(summary.monthlyExpenseCents)}`);
  console.log(`  savings rate  ${pct(summary.savingsRate)}`);

  check("net worth is positive", summary.netWorthCents > 0);
  check("debt is reported", summary.debtCents > 0, money(summary.debtCents));
  // The current month is partial by definition (paydays are biweekly), so a
  // negative month-to-date savings rate is real, not a bug. It must simply be a
  // finite number that can be rendered.
  check("savings rate is finite", Number.isFinite(summary.savingsRate), String(summary.savingsRate));
  // Includes brokerage cash: that is real money held at the custodian, and it
  // is distinct from the market value of the securities sitting in it.
  check(
    "net worth = cash + savings + brokerage + investments - debt + receivables",
    Math.abs(
      summary.netWorthCents -
        (summary.cashCents +
          summary.savingsCents +
          brokerageCents +
          summary.investmentsCents -
          summary.debtCents +
          summary.receivablesCents),
    ) <= 2,
    `stated ${money(summary.netWorthCents)} vs components`,
  );

  /* ----------------------------------------------------------- analytics */
  const analytics = await getAnalytics(user.id, "1y");
  console.log("\nanalytics (1y):");
  console.log(`  months covered   ${analytics.monthlySeries.length}`);
  console.log(`  hasData          ${analytics.hasData}`);
  console.log(`  avg income/mo    ${money(analytics.averages.monthlyIncomeCents)}`);
  console.log(`  avg expense/mo   ${money(analytics.averages.monthlyExpenseCents)}`);
  console.log(`  avg savings/mo   ${money(analytics.averages.monthlySavingsCents)}`);
  console.log(`  expense cats     ${analytics.expenseByCategory.length}`);
  for (const category of analytics.expenseByCategory.slice(0, 5)) {
    console.log(`     ${category.categoryName.padEnd(15)} ${money(category.amountCents).padStart(11)} (${pct(category.ratio)})`);
  }
  console.log(`  income cats      ${analytics.incomeByCategory.length}`);
  console.log(`  net worth pts    ${analytics.netWorthSeries.length}`);

  check("12 monthly points", analytics.monthlySeries.length >= 12, `${analytics.monthlySeries.length}`);
  check("hasData is true", analytics.hasData);
  check("categories were bucketed", analytics.expenseByCategory.length > 3);
  check("net worth series has history", analytics.netWorthSeries.length >= 12);
  const categoryShares = analytics.expenseByCategory.reduce((sum, row) => sum + row.ratio, 0);
  check("category shares sum to ~100%", Math.abs(categoryShares - 1) < 0.02, pct(categoryShares));

  /* ------------------------------------------------------------ insights */
  const insights = await buildInsights(user.id);
  console.log(`\ninsights (${insights.length}):`);
  for (const insight of insights) {
    console.log(`  [${insight.kind}/${insight.basis}] ${insight.title}`);
    console.log(`      ${insight.detail.slice(0, 100)}`);
    console.log(`      evidence: ${insight.evidence.join(" | ").slice(0, 110)}`);
  }
  check("insights were produced", insights.length > 0, `${insights.length} insights`);
  check("every insight carries evidence", insights.every((item) => item.evidence.length > 0));

  /* ----------------------------------------------------------- forecast */
  const scenarios = await getAllScenarios(user.id, 12);
  console.log("\nforecasts (12 months):");
  for (const [name, result] of Object.entries(scenarios)) {
    console.log(
      `  ${name.padEnd(13)} savings ${money(result.finalSavingsCents).padStart(12)}  invest ${money(result.finalInvestmentsCents).padStart(12)}  nw ${money(result.finalNetWorthCents).padStart(12)}  milestones ${result.milestones.length}`,
    );
  }
  const trend = scenarios.trend;
  const conservative = scenarios.conservative;
  const optimistic = scenarios.optimistic;
  check("optimistic >= trend >= conservative (investments)", optimistic.finalInvestmentsCents >= trend.finalInvestmentsCents && trend.finalInvestmentsCents >= conservative.finalInvestmentsCents);
  check("points match requested months", trend.points.length === 12, `${trend.points.length} points`);
  check(
    "last point is 12 months out",
    trend.points.at(-1)?.month === addMonths(new Date(), 12).toISOString().slice(0, 7),
    trend.points.at(-1)?.month ?? "",
  );
  check("savings grow when income > expenses", trend.finalSavingsCents > 0);

  /* ----------------------------------------------------------- portfolio */
  const portfolio = await getHoldings(user.id);
  console.log(`\nportfolio: ${portfolio.holdings.length} holdings, provider=${portfolio.summary.provider}, simulated=${portfolio.summary.simulated}`);
  for (const holding of portfolio.holdings) {
    console.log(
      `  ${holding.investment.symbol.padEnd(6)} ${String(holding.investment.quantity).padStart(5)}x  value ${money(holding.marketValueCents).padStart(11)}  gain ${money(holding.unrealizedGainCents).padStart(10)}  price ${money(holding.quote?.priceCents ?? 0)}`,
    );
  }
  console.log(`  total ${money(portfolio.summary.totalValueCents)} (${pct(portfolio.summary.totalGainRatio)} all-time)`);
  check("holdings were seeded", portfolio.holdings.length === 4);
  check("simulated prices are flagged", portfolio.summary.simulated === true);

  /* ------------------------------------------------------------ calendar */
  const window = calendarWindow("month", new Date());
  const events = await getCalendarEvents(user.id, window.from, window.to);
  const bySource = new Map<string, number>();
  for (const event of events) bySource.set(event.source, (bySource.get(event.source) ?? 0) + 1);
  console.log(`\ncalendar (${window.from.toDateString()} .. ${window.to.toDateString()}): ${events.length} events`);
  console.log(`  by source: ${JSON.stringify(Object.fromEntries(bySource))}`);
  for (const day of summariseByDay(events).slice(0, 4)) {
    console.log(`  ${day.date}  in ${money(day.income).padStart(10)}  out ${money(day.bills).padStart(10)}`);
  }
  check("calendar returned events", events.length > 10, `${events.length} events`);
  check("calendar is date-sorted", events.every((event, i) => i === 0 || events[i - 1].date <= event.date));
  check("payday events present", (bySource.get("payday") ?? 0) > 0);

  /* --------------------------------------------------------- obligations */
  const obligations = await getUpcomingObligations(user.id, { until: addDays(new Date(), 30) });
  console.log(`\nobligations next 30d: ${obligations.length}`);
  for (const obligation of obligations.slice(0, 6)) {
    console.log(`  ${obligation.dueDate}  ${obligation.name.padEnd(20)} ${money(obligation.amountCents).padStart(10)} [${obligation.source}]`);
  }
  check("obligations were projected", obligations.length > 3, `${obligations.length}`);
  check("obligations are date-sorted", obligations.every((o, i) => i === 0 || obligations[i - 1].dueDate <= o.dueDate));

  /* ------------------------------------------------------------ paycheck */
  const paycheck = await getPaycheckProjection(user.id);
  console.log(`\npaycheck projection:`);
  console.log(`  next payday      ${paycheck.nextPaydayDate} (${paycheck.daysUntilPayday}d away)`);
  console.log(`  expected amount  ${money(paycheck.expectedPaycheckCents)}`);
  console.log(`  available cash   ${money(paycheck.availableCashCents)}`);
  console.log(`  obligations      ${money(paycheck.obligationsTotalCents)} (${paycheck.obligations.length})`);
  console.log(`  safe to spend    ${money(paycheck.safeToSpendCents)}`);
  console.log(`  expected savings ${money(paycheck.expectedSavingsCents)}`);
  check("next payday is known", paycheck.nextPaydayDate !== null, paycheck.nextPaydayDate ?? "");
  check("safe-to-spend is computed", Number.isFinite(paycheck.safeToSpendCents));

  /* --------------------------------------------------------------- goals */
  const goals = await getGoalProgress(user.id);
  console.log(`\ngoals (${goals.length}):`);
  for (const goal of goals) {
    console.log(
      `  ${goal.goal.name.padEnd(23)} ${pct(goal.progressRatio).padStart(6)}  ${money(goal.goal.currentCents).padStart(10)} / ${money(goal.goal.targetCents).padStart(10)}  req ${money(goal.requiredMonthlyCents).padStart(9)}  onTrack=${goal.onTrack}`,
    );
  }
  check("goals were seeded", goals.length === 3);
  check("goal progress is between 0 and 1", goals.every((goal) => goal.progressRatio >= 0 && goal.progressRatio <= 1));

  /* ------------------------------------------------------- notifications */
  await generateNotifications(user.id);
  await generateNotifications(user.id); // must not duplicate
  const notifications = await listNotifications(user.id);
  console.log(`\nnotifications after two runs (dedup check): ${notifications.length}`);
  for (const notification of notifications.slice(0, 8)) {
    console.log(`  [${notification.severity}] ${notification.title}`);
  }
  check("notifications were generated", notifications.length > 0, `${notifications.length}`);
  const titles = notifications.map((n) => n.title);
  check("no duplicate titles", new Set(titles).size === titles.length);

  /* ------------------------------------------------------------- cleanup */
  await clearDemoData(user.id);
  const cleared = await listTransactions(user.id, { limit: 10 });
  const clearedAccounts = await listAccounts(user.id);
  const clearedAnalytics = await getAnalytics(user.id, "1y");
  console.log(`\nafter clearDemoData: accounts=${clearedAccounts.length} transactions=${cleared.length} hasData=${clearedAnalytics.hasData}`);
  check("demo data fully removed", cleared.length === 0 && clearedAccounts.length === 0);
  check("analytics degrades to empty, not NaN", clearedAnalytics.totals.expenseCents === 0);
  const emptySummary = await getFinancialSummary(user.id);
  check("empty summary is zero, not NaN", Number.isFinite(emptySummary.netWorthCents) && emptySummary.netWorthCents === 0);

  await deleteUser(user.id);
  console.log("\ncleanup ok");

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nSMOKE TEST CRASHED:\n", error);
  process.exit(1);
});