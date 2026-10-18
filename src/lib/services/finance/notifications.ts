import { addDays } from "date-fns";
import { getUpcomingObligations } from "./obligations";
import { getNextPaydays } from "./payday";
import { getFinancialSummary } from "./summary";
import { getGoalProgress } from "./goals";
import { listAccounts } from "@/lib/repo/accounts";
import { listTransactions, getRangeTotals } from "@/lib/repo/transactions";
import {
  getNotificationPrefs,
  upsertNotification,
  clearNotifications,
  type NotificationPrefs,
} from "@/lib/repo/notifications";
import { formatMoney } from "@/lib/utils/money";
import { DEFAULT_CURRENCY } from "@/lib/utils/currency";
import { startOfMonth, startOfToday, subMonths, toISODate } from "@/lib/utils/date";
import type { NotificationKey } from "@/lib/types";

/**
 * Derives notifications from stored data.
 *
 * Every notification is deduped per day, so opening the dashboard repeatedly
 * does not flood the inbox. Users can disable each category from Settings.
 */

const LOW_BALANCE_THRESHOLD_CENTS = 50_000; // $500

/** Accounts below this balance raise a warning. */
export async function generateNotifications(
  userId: string,
  currency = DEFAULT_CURRENCY,
): Promise<void> {
  const prefs = await getNotificationPrefs(userId);
  const enabled = (key: NotificationKey) => prefs[key] !== false;
  const today = startOfToday();
  const money = (cents: number) => formatMoney(cents, { currency });

  const [obligations, paydays, summary, goals, accounts] = await Promise.all([
    getUpcomingObligations(userId, { until: addDays(today, 7) }),
    getNextPaydays(userId, today, 1),
    getFinancialSummary(userId),
    getGoalProgress(userId),
    listAccounts(userId),
  ]);

  /* ------------------------------------------------------------ bills */
  for (const obligation of obligations) {
    const daysAway = Math.round(
      (new Date(`${obligation.dueDate}T00:00:00`).getTime() - today.getTime()) /
        86_400_000,
    );
    if (daysAway > 7) continue;

    const key: NotificationKey =
      obligation.source === "emi"
        ? "emi_due"
        : obligation.source === "recurring"
          ? "recurring_payment"
          : "bill_due";

    if (!enabled(key)) continue;

    await upsertNotification({
      userId,
      key,
      title:
        daysAway === 0
          ? `${obligation.name} is due today`
          : `${obligation.name} is due in ${daysAway} day${daysAway === 1 ? "" : "s"}`,
      body: `${money(obligation.amountCents)}${obligation.autopay ? " · autopay on" : ""}`,
      severity: daysAway <= 2 ? "warning" : "info",
      link: "/bills",
      dedupeKey: `${key}:${obligation.id}:${obligation.dueDate}`,
    });
  }

  /* ----------------------------------------------------------- payday */
  const next = paydays[0];
  if (next && next.daysUntil <= 3 && enabled("payday")) {
    await upsertNotification({
      userId,
      key: "payday",
      title:
        next.daysUntil === 0
          ? "Today is payday 🎉"
          : `Payday in ${next.daysUntil} day${next.daysUntil === 1 ? "" : "s"}`,
      body: `${next.label} · expected ${money(next.amountCents)}`,
      severity: "success",
      link: "/dashboard",
      dedupeKey: `payday:${next.paydayId}:${next.date}`,
    });
  }

  /* ---------------------------------------------------- low balances */
  if (enabled("low_balance")) {
    for (const account of accounts) {
      if (account.isArchived) continue;
      if (account.currentBalanceCents >= LOW_BALANCE_THRESHOLD_CENTS) continue;
      if (account.currentBalanceCents < -LOW_BALANCE_THRESHOLD_CENTS * 5) continue;
      await upsertNotification({
        userId,
        key: "low_balance",
        title: `${account.name} balance is low`,
        body: `Currently ${money(account.currentBalanceCents)}`,
        severity: account.currentBalanceCents < 0 ? "danger" : "warning",
        link: "/accounts",
        dedupeKey: `low_balance:${account.id}:${account.currentBalanceCents}`,
      });
    }
  }

  /* ------------------------------------------------------ big spend */
  if (enabled("large_spend")) {
    const monthStart = startOfMonth(today);
    const previousStart = startOfMonth(subMonths(today, 3));
    const [current, history] = await Promise.all([
      getRangeTotals(userId, toISODate(monthStart), toISODate(today)),
      getRangeTotals(userId, toISODate(previousStart), toISODate(monthStart)),
    ]);
    const monthsOfHistory = Math.max(1, Math.round(
      (monthStart.getTime() - previousStart.getTime()) / (30.44 * 86_400_000),
    ));
    const averageExpense = history.expenseCents / monthsOfHistory;

    if (current.expenseCents > averageExpense * 1.25 && averageExpense > 0) {
      await upsertNotification({
        userId,
        key: "large_spend",
        title: `Spending is running above your average`,
        body: `${money(current.expenseCents)} this month so far versus about ${money(
          averageExpense,
        )} a month over the last few months.`,
        severity: "info",
        link: "/analytics",
        dedupeKey: `large_spend:${toISODate(monthStart)}`,
      });
    }
  }

  /* -------------------------------------------------- goal progress */
  if (enabled("goal_progress")) {
    for (const progress of goals) {
      if (progress.progressRatio >= 1) {
        await upsertNotification({
          userId,
          key: "savings_milestone",
          title: `"${progress.goal.name}" is fully funded 🎉`,
          body: `You reached ${money(progress.goal.targetCents)}.`,
          severity: "success",
          link: "/goals",
          dedupeKey: `goal_complete:${progress.goal.id}`,
        });
      } else if (progress.progressRatio >= 0.75) {
        await upsertNotification({
          userId,
          key: "goal_progress",
          title: `"${progress.goal.name}" is ${Math.round(progress.progressRatio * 100)}% funded`,
          body: `${money(progress.remainingCents)} left to go.`,
          severity: "info",
          link: "/goals",
          dedupeKey: `goal_progress:${progress.goal.id}:${Math.floor(progress.progressRatio * 4)}`,
        });
      }
    }
  }

  /* -------------------------------------------- investment movement */
  if (enabled("investment_update") && summary.investmentsCents > 0) {
    await upsertNotification({
      userId,
      key: "investment_update",
      title: "Your investment portfolio moved",
      body: `Estimated value ${money(summary.investmentsCents)} based on the latest available prices.`,
      severity: "info",
      link: "/investments",
      dedupeKey: `investment:${toISODate(today)}`,
    });
  }

  void listTransactions;
}

/** Wipes generated notifications so they can be rebuilt cleanly. */
export async function resetNotifications(userId: string): Promise<void> {
  await clearNotifications(userId);
}

export type { NotificationPrefs };