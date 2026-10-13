import { getDb } from "@/lib/db";
import { newId } from "@/lib/utils/id";
import type { NotificationKey, NotificationRow, Scenario } from "@/lib/types";
import { NOTIFICATION_KEYS } from "@/lib/types";
import { type NotificationDbRow, toNotification } from "@/lib/repo/mappers";
import { toISODate } from "@/lib/utils/date";

export async function listNotifications(
  userId: string,
  limit = 25,
): Promise<NotificationRow[]> {
  const db = await getDb();
  const rows = await db.all<NotificationDbRow>(
    `SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
    [userId, limit],
  );
  return rows.map(toNotification);
}

export async function countUnread(userId: string): Promise<number> {
  const db = await getDb();
  const row = await db.get<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND read_at IS NULL`,
    [userId],
  );
  return Number(row?.cnt ?? 0);
}

/**
 * Inserts a notification unless one with the same `dedupe_key` already exists
 * for today. This keeps a recurring generator from filling the inbox with
 * duplicates every time the dashboard renders.
 */
export async function upsertNotification(input: {
  userId: string;
  key: NotificationKey | string;
  title: string;
  body?: string | null;
  severity?: "info" | "success" | "warning" | "danger";
  link?: string | null;
  dedupeKey: string;
}): Promise<boolean> {
  const db = await getDb();
  const today = toISODate(new Date());
  const existing = await db.get<{ id: string }>(
    `SELECT id FROM notifications
      WHERE user_id = ? AND dedupe_key = ? AND SUBSTR(created_at, 1, 10) = ?`,
    [input.userId, input.dedupeKey, today],
  );
  if (existing) return false;

  await db.run(
    `INSERT INTO notifications (
        id, user_id, key, title, body, severity, link, dedupe_key, read_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    [
      newId(),
      input.userId,
      input.key,
      input.title,
      input.body ?? null,
      input.severity ?? "info",
      input.link ?? null,
      input.dedupeKey,
      new Date().toISOString(),
    ],
  );
  return true;
}

export async function markRead(userId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.run(
    `UPDATE notifications SET read_at = ? WHERE user_id = ? AND id = ? AND read_at IS NULL`,
    [new Date().toISOString(), userId, id],
  );
  return result.changes > 0;
}

export async function markAllRead(userId: string): Promise<number> {
  const db = await getDb();
  const result = await db.run(
    `UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL`,
    [new Date().toISOString(), userId],
  );
  return result.changes;
}

export async function clearNotifications(userId: string): Promise<number> {
  const db = await getDb();
  const result = await db.run(`DELETE FROM notifications WHERE user_id = ?`, [userId]);
  return result.changes;
}

/* ------------------------------------------------------- preferences */

export type NotificationPrefs = Record<NotificationKey, boolean>;

export async function getNotificationPrefs(
  userId: string,
): Promise<NotificationPrefs> {
  const db = await getDb();
  const rows = await db.all<{ key: string; enabled: number }>(
    `SELECT key, enabled FROM notification_prefs WHERE user_id = ?`,
    [userId],
  );
  const stored = new Map(rows.map((row) => [row.key, Number(row.enabled) === 1]));
  return Object.fromEntries(
    NOTIFICATION_KEYS.map((key) => [key, stored.get(key) ?? true]),
  ) as NotificationPrefs;
}

export async function setNotificationPref(
  userId: string,
  key: NotificationKey,
  enabled: boolean,
): Promise<void> {
  const db = await getDb();
  const existing = await db.get<{ user_id: string }>(
    `SELECT user_id FROM notification_prefs WHERE user_id = ? AND key = ?`,
    [userId, key],
  );
  if (existing) {
    await db.run(
      `UPDATE notification_prefs SET enabled = ? WHERE user_id = ? AND key = ?`,
      [enabled ? 1 : 0, userId, key],
    );
    return;
  }
  await db.run(
    `INSERT INTO notification_prefs (user_id, key, enabled) VALUES (?, ?, ?)`,
    [userId, key, enabled ? 1 : 0],
  );
}

/* --------------------------------------------------------- snapshots */

export type SnapshotInput = {
  date: string;
  netWorthCents: number;
  cashCents: number;
  savingsCents: number;
  investmentsCents: number;
  debtCents: number;
  incomeCents: number;
  expenseCents: number;
};

export async function upsertSnapshot(
  userId: string,
  input: SnapshotInput,
): Promise<void> {
  const db = await getDb();
  const existing = await db.get<{ id: string }>(
    `SELECT id FROM snapshots WHERE user_id = ? AND date = ?`,
    [userId, input.date],
  );
  if (existing) {
    await db.run(
      `UPDATE snapshots SET
          net_worth_cents = ?, cash_cents = ?, savings_cents = ?,
          investments_cents = ?, debt_cents = ?, income_cents = ?, expense_cents = ?
        WHERE user_id = ? AND date = ?`,
      [
        input.netWorthCents,
        input.cashCents,
        input.savingsCents,
        input.investmentsCents,
        input.debtCents,
        input.incomeCents,
        input.expenseCents,
        userId,
        input.date,
      ],
    );
    return;
  }
  await db.run(
    `INSERT INTO snapshots (
        id, user_id, date, net_worth_cents, cash_cents, savings_cents,
        investments_cents, debt_cents, income_cents, expense_cents, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      userId,
      input.date,
      input.netWorthCents,
      input.cashCents,
      input.savingsCents,
      input.investmentsCents,
      input.debtCents,
      input.incomeCents,
      input.expenseCents,
      new Date().toISOString(),
    ],
  );
}

export async function listSnapshots(
  userId: string,
  from?: string,
  to?: string,
): Promise<
  {
    date: string;
    netWorthCents: number;
    cashCents: number;
    savingsCents: number;
    investmentsCents: number;
    debtCents: number;
    incomeCents: number;
    expenseCents: number;
  }[]
> {
  const db = await getDb();
  const conditions = ["user_id = ?"];
  const params: (string | number)[] = [userId];
  if (from) {
    conditions.push("date >= ?");
    params.push(from);
  }
  if (to) {
    conditions.push("date <= ?");
    params.push(to);
  }
  const rows = await db.all<Record<string, string | number>>(
    `SELECT * FROM snapshots WHERE ${conditions.join(" AND ")} ORDER BY date ASC`,
    params,
  );
  return rows.map((row) => ({
    date: String(row.date),
    netWorthCents: Number(row.net_worth_cents),
    cashCents: Number(row.cash_cents),
    savingsCents: Number(row.savings_cents),
    investmentsCents: Number(row.investments_cents),
    debtCents: Number(row.debt_cents),
    incomeCents: Number(row.income_cents),
    expenseCents: Number(row.expense_cents),
  }));
}

/* --------------------------------------------------------- forecasts */

export async function saveForecast(input: {
  userId: string;
  label: string;
  scenario: Scenario;
  months: number;
  params: unknown;
  result: unknown;
}): Promise<string> {
  const db = await getDb();
  const id = newId();
  await db.run(
    `INSERT INTO forecasts (
        id, user_id, label, scenario, months, params_json, result_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.userId,
      input.label,
      input.scenario,
      input.months,
      JSON.stringify(input.params ?? {}),
      JSON.stringify(input.result ?? {}),
      new Date().toISOString(),
    ],
  );
  return id;
}