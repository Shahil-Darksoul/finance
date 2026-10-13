import { getDb } from "@/lib/db";
import { newId } from "@/lib/utils/id";
import type { RecurringTransaction, TransactionType } from "@/lib/types";
import { type RecurringRow, toRecurring } from "./mappers";

export async function listRecurring(
  userId: string,
  options: { includeInactive?: boolean } = {},
): Promise<RecurringTransaction[]> {
  const db = await getDb();
  const rows = await db.all<RecurringRow>(
    `SELECT * FROM recurring_transactions
      WHERE user_id = ? ${options.includeInactive ? "" : "AND active = 1"}
      ORDER BY next_occurrence ASC NULLS LAST, name ASC`,
    [userId],
  );
  return rows.map(toRecurring);
}

export type RecurringInput = {
  name: string;
  type: TransactionType;
  amountCents: number;
  frequency: RecurringTransaction["frequency"];
  intervalCount?: number;
  daysOfWeek?: number[] | null;
  dayOfMonth?: number | null;
  monthOfYear?: number | null;
  startDate: string;
  endDate?: string | null;
  categoryId?: string | null;
  accountId?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  active?: boolean;
};

export async function createRecurring(
  userId: string,
  input: RecurringInput,
  nextOccurrence: string | null,
): Promise<RecurringTransaction> {
  const db = await getDb();
  const id = newId();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO recurring_transactions (
        id, user_id, name, type, amount_cents, category_id, account_id,
        payment_method, frequency, interval_count, days_of_week, day_of_month,
        month_of_year, start_date, end_date, next_occurrence, active, notes,
        created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      input.name,
      input.type,
      Math.abs(Math.trunc(input.amountCents)),
      input.categoryId ?? null,
      input.accountId ?? null,
      input.paymentMethod ?? null,
      input.frequency,
      Math.max(1, input.intervalCount ?? 1),
      input.daysOfWeek?.length ? input.daysOfWeek.join(",") : null,
      input.dayOfMonth ?? null,
      input.monthOfYear ?? null,
      input.startDate,
      input.endDate ?? null,
      nextOccurrence,
      input.active === false ? 0 : 1,
      input.notes ?? null,
      now,
      now,
    ],
  );
  const created = await getRecurring(userId, id);
  if (!created) throw new Error("Recurring item could not be created");
  return created;
}

export async function getRecurring(
  userId: string,
  id: string,
): Promise<RecurringTransaction | null> {
  const db = await getDb();
  const row = await db.get<RecurringRow>(
    `SELECT * FROM recurring_transactions WHERE user_id = ? AND id = ?`,
    [userId, id],
  );
  return row ? toRecurring(row) : null;
}

export async function updateRecurring(
  userId: string,
  id: string,
  input: Partial<RecurringInput> & { nextOccurrence?: string | null },
): Promise<RecurringTransaction | null> {
  const db = await getDb();
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const push = (column: string, value: string | number | null) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };

  if (input.name !== undefined) push("name", input.name);
  if (input.type !== undefined) push("type", input.type);
  if (input.amountCents !== undefined)
    push("amount_cents", Math.abs(Math.trunc(input.amountCents)));
  if (input.frequency !== undefined) push("frequency", input.frequency);
  if (input.intervalCount !== undefined)
    push("interval_count", Math.max(1, input.intervalCount));
  if (input.daysOfWeek !== undefined)
    push("days_of_week", input.daysOfWeek?.length ? input.daysOfWeek.join(",") : null);
  if (input.dayOfMonth !== undefined) push("day_of_month", input.dayOfMonth);
  if (input.monthOfYear !== undefined) push("month_of_year", input.monthOfYear);
  if (input.startDate !== undefined) push("start_date", input.startDate);
  if (input.endDate !== undefined) push("end_date", input.endDate);
  if (input.nextOccurrence !== undefined)
    push("next_occurrence", input.nextOccurrence);
  if (input.categoryId !== undefined) push("category_id", input.categoryId);
  if (input.accountId !== undefined) push("account_id", input.accountId);
  if (input.paymentMethod !== undefined)
    push("payment_method", input.paymentMethod);
  if (input.notes !== undefined) push("notes", input.notes);
  if (input.active !== undefined) push("active", input.active ? 1 : 0);

  if (sets.length === 0) return getRecurring(userId, id);
  sets.push("updated_at = ?");
  params.push(new Date().toISOString(), userId, id);
  const result = await db.run(
    `UPDATE recurring_transactions SET ${sets.join(", ")} WHERE user_id = ? AND id = ?`,
    params,
  );
  if (result.changes === 0) return null;
  return getRecurring(userId, id);
}

export async function deleteRecurring(
  userId: string,
  id: string,
): Promise<boolean> {
  const db = await getDb();
  const result = await db.run(
    `DELETE FROM recurring_transactions WHERE user_id = ? AND id = ?`,
    [userId, id],
  );
  return result.changes > 0;
}