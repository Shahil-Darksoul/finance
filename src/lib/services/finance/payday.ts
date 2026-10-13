import { addDays, addMonths } from "date-fns";
import { getDb } from "@/lib/db";
import { listPaydays } from "@/lib/repo/paydays";
import { listOccurrenceOverrides } from "@/lib/repo/occurrence-overrides";
import { createTransaction, updateTransaction } from "@/lib/repo/transactions";
import { DEPOSIT_ACCOUNT_TYPES, type PaydayOccurrence } from "@/lib/types";
import { fromISODate, startOfToday, toISODate } from "@/lib/utils/date";

/**
 * Payday calendar.
 *
 * Each configured payday becomes one or two recurrence rules:
 *   - weekly / biweekly → a single rule anchored on the start date
 *   - semimonthly      → two rules (e.g. the 15th and the last day)
 *   - monthly          → one rule anchored on `anchorDay`
 *
 * Two separate payday records therefore describe two independent pay cycles,
 * which is exactly what a biweekly + biweekly pair of payroll schedules means.
 */
export function paydayRules(payday: {
  id: string;
  label: string;
  startDate: string;
  frequency: string;
  amountCents: number;
  accountId: string | null;
  secondDay?: number | null;
  anchorDay?: number | null;
}): { rule: PaydayRuleInput; amountCents: number }[] {
  const anchorDate = fromISODate(payday.startDate);

  switch (payday.frequency) {
    case "weekly":
    case "biweekly":
      return [
        {
          rule: {
            paydayId: payday.id,
            label: payday.label,
            frequency: payday.frequency,
            startDate: payday.startDate,
            intervalCount: 1,
            daysOfWeek: [anchorDate.getDay()],
          },
          amountCents: payday.amountCents,
        },
      ];

    case "semimonthly": {
      const second = payday.secondDay ?? 15;
      // The last-day rule is expressed as day 31; the recurrence engine clamps
      // it to the final day of shorter months.
      const days = second >= 28 ? [second, 31] : [second];
      return days.map((day) => ({
        rule: {
          paydayId: payday.id,
          label: `${payday.label}${days.length > 1 ? ` (day ${day})` : ""}`,
          frequency: "monthly" as const,
          startDate: toISODate(
            new Date(anchorDate.getFullYear(), anchorDate.getMonth(), Math.min(day, 28)),
          ),
          intervalCount: 1,
          dayOfMonth: day,
        },
        amountCents: payday.amountCents,
      }));
    }

    case "monthly":
    default:
      return [
        {
          rule: {
            paydayId: payday.id,
            label: payday.label,
            frequency: "monthly",
            startDate: payday.startDate,
            intervalCount: 1,
            dayOfMonth: payday.anchorDay ?? anchorDate.getDate(),
          },
          amountCents: payday.amountCents,
        },
      ];
  }
}

type PaydayRuleInput = {
  paydayId: string;
  label: string;
  frequency: "weekly" | "biweekly" | "monthly";
  startDate: string;
  intervalCount: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
};

export type UpcomingPayday = PaydayOccurrence & {
  daysUntil: number;
};

/** Occurrences between `from` and `to`, de-duplicated and sorted. */
export async function getPaydayOccurrences(
  userId: string,
  from: Date,
  to: Date,
): Promise<PaydayOccurrence[]> {
  const [paydays, overrides] = await Promise.all([
    listPaydays(userId),
    listOccurrenceOverrides(userId),
  ]);
  if (paydays.length === 0) return [];

  // Per-check amounts are recorded per date. A date without one stays at $0:
  // the schedule's default is only a template, never treated as an actual check.
  const overrideByKey = new Map(
    overrides
      .filter((override) => override.sourceType === "payday")
      .map((override) => [`${override.sourceId}:${override.date}`, override.amountCents]),
  );

  const { occurrencesInRange } = await import("./recurrence");
  const seen = new Set<string>();
  const results: PaydayOccurrence[] = [];

  for (const payday of paydays) {
    for (const { rule } of paydayRules(payday)) {
      for (const date of occurrencesInRange(rule, from, to, 120)) {
        const key = `${rule.paydayId}:${toISODate(date)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          paydayId: rule.paydayId,
          label: rule.label,
          date: toISODate(date),
          amountCents: overrideByKey.get(key) ?? 0,
          amountEdited: overrideByKey.has(key),
          accountId: payday.accountId,
        });
      }
    }
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The next payday on or after today, plus the one after it.
 * Used by the countdown card and the paycheck projection.
 */
export async function getNextPaydays(
  userId: string,
  from = startOfToday(),
  count = 2,
): Promise<UpcomingPayday[]> {
  const windowEnd = addDays(from, 120);
  const occurrences = await getPaydayOccurrences(userId, from, windowEnd);
  return occurrences.slice(0, count).map((occurrence) => ({
    ...occurrence,
    daysUntil: Math.round(
      (fromISODate(occurrence.date).getTime() - from.getTime()) / 86_400_000,
    ),
  }));
}

/** Paydays already recorded in the current month (month-to-date income check). */
export async function getPaydaysThisMonth(
  userId: string,
  today = startOfToday(),
): Promise<PaydayOccurrence[]> {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = addMonths(start, 1);
  return getPaydayOccurrences(userId, start, end);
}

/** Approximate yearly pay, used by the recurring-income ratio insight. */
export async function getAnnualPaydayIncome(userId: string): Promise<number> {
  const occurrences = await getPaydayOccurrences(
    userId,
    startOfToday(),
    addDays(startOfToday(), 371),
  );
  return occurrences.reduce((sum, occurrence) => sum + occurrence.amountCents, 0);
}

/* ------------------------------------------------------------ writing */

/**
 * The account a check should be recorded against. Prefers the payday's linked
 * account; when a payday has none, falls back to the user's first spendable
 * account so income still moves net worth and monthly totals.
 */
export async function resolveDepositAccount(
  userId: string,
  preferred: string | null,
): Promise<string | null> {
  if (preferred) return preferred;
  const db = await getDb();
  const row = await db.get<{ id: string }>(
    `SELECT id FROM accounts
      WHERE user_id = ? AND is_archived = 0
        AND type IN (?, ?, ?, ?, ?)
      ORDER BY sort_order ASC, created_at ASC
      LIMIT 1`,
    [userId, ...DEPOSIT_ACCOUNT_TYPES],
  );
  return row?.id ?? null;
}

/**
 * Records a payday's check as an income transaction the moment an amount is set
 * (or changed) on the calendar, so "Income this month" and net worth move with
 * the calendar. Reuses the income already on that payday + date (including an
 * unclaimed historical "Paycheck", e.g. demo-seeded rows) so re-editing an
 * amount never double-counts a check.
 */
export async function setPaydayIncome(
  userId: string,
  payday: { id: string; label: string; accountId: string | null },
  date: string,
  amountCents: number,
): Promise<void> {
  const amount = Math.abs(Math.trunc(amountCents));
  if (amount <= 0) return;

  const accountId = await resolveDepositAccount(userId, payday.accountId);
  if (!accountId) return;

  const db = await getDb();
  const existing = await db.get<{ id: string }>(
    `SELECT id
       FROM transactions
      WHERE user_id = ? AND type = 'income' AND date = ? AND account_id = ?
        AND (payday_id = ?
             OR (payday_id IS NULL
                 AND (description IN (?, 'Paycheck') OR merchant = ?)))
      ORDER BY CASE WHEN payday_id = ? THEN 0 ELSE 1 END, created_at ASC
      LIMIT 1`,
    [userId, date, accountId, payday.id, payday.label, payday.label, payday.id],
  );

  if (existing) {
    await updateTransaction(userId, existing.id, {
      amountCents: amount,
      paydayId: payday.id,
      description: payday.label,
      merchant: payday.label,
    });
    return;
  }

  const category = await db.get<{ id: string }>(
    `SELECT id FROM categories
      WHERE user_id = ? AND kind = 'income'
      ORDER BY is_system DESC, sort_order ASC, created_at ASC
      LIMIT 1`,
    [userId],
  );

  await createTransaction(userId, {
    type: "income",
    amountCents: amount,
    date,
    accountId,
    categoryId: category?.id ?? null,
    description: payday.label,
    merchant: payday.label,
    paymentMethod: "Bank transfer",
    paydayId: payday.id,
  });
}

/**
 * Re-points a payday's recorded checks to a different deposit account.
 *
 * Only checks dated on or after `from` move. A past payday already landed in
 * the account it actually hit, so changing the schedule's account applies from
 * today forward without rewriting history.
 */
export async function moveFuturePaydayIncome(
  userId: string,
  paydayId: string,
  newAccountId: string,
  from: string = toISODate(startOfToday()),
): Promise<void> {
  const db = await getDb();
  await db.run(
    `UPDATE transactions
        SET account_id = ?
      WHERE user_id = ? AND payday_id = ? AND date >= ? AND account_id <> ?`,
    [newAccountId, userId, paydayId, from, newAccountId],
  );
}

/** Removes the income recorded for one payday date (when its override is cleared). */
export async function removePaydayIncome(
  userId: string,
  payday: { id: string; accountId: string | null },
  date: string,
): Promise<void> {
  const accountId = await resolveDepositAccount(userId, payday.accountId);
  if (!accountId) return;
  const db = await getDb();
  await db.run(
    `DELETE FROM transactions
      WHERE user_id = ? AND payday_id = ? AND date = ? AND account_id = ?`,
    [userId, payday.id, date, accountId],
  );
}

/** Removes every income transaction tied to a payday (when the payday is deleted). */
export async function deletePaydayIncome(
  userId: string,
  paydayId: string,
): Promise<void> {
  const db = await getDb();
  await db.run(`DELETE FROM transactions WHERE user_id = ? AND payday_id = ?`, [
    userId,
    paydayId,
  ]);
}