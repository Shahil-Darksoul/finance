import { getDb } from "@/lib/db";
import { newId } from "@/lib/utils/id";
import type { Payday, PaydayFrequency } from "@/lib/types";
import { type PaydayRow, toPayday } from "./mappers";

export async function listPaydays(userId: string): Promise<Payday[]> {
  const db = await getDb();
  const rows = await db.all<PaydayRow>(
    `SELECT * FROM paydays WHERE user_id = ? AND active = 1
      ORDER BY sort_order ASC, created_at ASC`,
    [userId],
  );
  return rows.map(toPayday);
}

export async function listAllPaydays(userId: string): Promise<Payday[]> {
  const db = await getDb();
  const rows = await db.all<PaydayRow>(
    `SELECT * FROM paydays WHERE user_id = ?
      ORDER BY sort_order ASC, created_at ASC`,
    [userId],
  );
  return rows.map(toPayday);
}

export type PaydayInput = {
  label: string;
  startDate: string;
  frequency: PaydayFrequency;
  amountCents: number;
  /** Second day for semimonthly schedules. */
  secondDay?: number | null;
  /** Anchor day for monthly schedules. */
  anchorDay?: number | null;
  accountId?: string | null;
  sortOrder?: number;
  active?: boolean;
};

export async function createPayday(
  userId: string,
  input: PaydayInput,
): Promise<Payday> {
  const db = await getDb();
  const id = newId();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO paydays (
        id, user_id, label, start_date, frequency, second_day, anchor_day,
        amount_cents, account_id, sort_order, active, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      input.label,
      input.startDate,
      input.frequency,
      input.secondDay ?? null,
      input.anchorDay ?? null,
      Math.abs(Math.trunc(input.amountCents)),
      input.accountId ?? null,
      input.sortOrder ?? 0,
      input.active === false ? 0 : 1,
      now,
    ],
  );
  const created = await getPayday(userId, id);
  if (!created) throw new Error("Payday could not be created");
  return created;
}

export async function getPayday(
  userId: string,
  id: string,
): Promise<Payday | null> {
  const db = await getDb();
  const row = await db.get<PaydayRow>(
    `SELECT * FROM paydays WHERE user_id = ? AND id = ?`,
    [userId, id],
  );
  return row ? toPayday(row) : null;
}

export async function updatePayday(
  userId: string,
  id: string,
  input: Partial<PaydayInput>,
): Promise<Payday | null> {
  const db = await getDb();
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const push = (column: string, value: string | number | null) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };

  if (input.label !== undefined) push("label", input.label);
  if (input.startDate !== undefined) push("start_date", input.startDate);
  if (input.frequency !== undefined) push("frequency", input.frequency);
  if (input.secondDay !== undefined) push("second_day", input.secondDay);
  if (input.anchorDay !== undefined) push("anchor_day", input.anchorDay);
  if (input.amountCents !== undefined)
    push("amount_cents", Math.abs(Math.trunc(input.amountCents)));
  if (input.accountId !== undefined) push("account_id", input.accountId);
  if (input.sortOrder !== undefined) push("sort_order", input.sortOrder);
  if (input.active !== undefined) push("active", input.active ? 1 : 0);

  if (sets.length === 0) return getPayday(userId, id);
  params.push(userId, id);
  const result = await db.run(
    `UPDATE paydays SET ${sets.join(", ")} WHERE user_id = ? AND id = ?`,
    params,
  );
  if (result.changes === 0) return null;
  return getPayday(userId, id);
}

export async function deletePayday(
  userId: string,
  id: string,
): Promise<boolean> {
  const db = await getDb();
  const result = await db.run(`DELETE FROM paydays WHERE user_id = ? AND id = ?`, [
    userId,
    id,
  ]);
  return result.changes > 0;
}