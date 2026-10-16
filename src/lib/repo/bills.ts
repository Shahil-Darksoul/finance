import { getDb } from "@/lib/db";
import { newId } from "@/lib/utils/id";
import type { Bill, BillFrequency, Priority } from "@/lib/types";
import { type BillRow, type EmiPaymentRow, toBill, toEmiPayment } from "./mappers";
import type { EmiPayment } from "@/lib/types";

const SELECT_WITH_RELATIONS = `
  SELECT b.*,
         a.name AS account_name,
         c.name AS category_name
    FROM bills b
    LEFT JOIN accounts a ON a.id = b.account_id
    LEFT JOIN categories c ON c.id = b.category_id
`;

export async function listBills(
  userId: string,
  options: { includeInactive?: boolean; kind?: "bill" | "emi" } = {},
): Promise<Bill[]> {
  const db = await getDb();
  const conditions = ["b.user_id = ?"];
  const params: (string | number)[] = [userId];
  if (!options.includeInactive) conditions.push("b.active = 1");
  if (options.kind) {
    conditions.push("b.kind = ?");
    params.push(options.kind);
  }

  const rows = await db.all<BillRow>(
    `${SELECT_WITH_RELATIONS} WHERE ${conditions.join(" AND ")}
      ORDER BY b.kind ASC, b.due_day ASC, b.name ASC`,
    params,
  );
  return rows.map(toBill);
}

export async function getBill(userId: string, id: string): Promise<Bill | null> {
  const db = await getDb();
  const row = await db.get<BillRow>(
    `${SELECT_WITH_RELATIONS} WHERE b.user_id = ? AND b.id = ?`,
    [userId, id],
  );
  return row ? toBill(row) : null;
}

export type BillInput = {
  name: string;
  kind: "bill" | "emi";
  amountCents: number;
  frequency: BillFrequency;
  dueDay: number;
  startDate: string;
  endDate?: string | null;
  accountId?: string | null;
  categoryId?: string | null;
  autopay?: boolean;
  priority?: Priority;
  notes?: string | null;
  active?: boolean;
  principalCents?: number | null;
  annualRate?: number;
  termMonths?: number | null;
};

export async function createBill(
  userId: string,
  input: BillInput,
): Promise<Bill> {
  const db = await getDb();
  const id = newId();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO bills (
        id, user_id, name, kind, amount_cents, frequency, due_day, start_date,
        end_date, account_id, category_id, autopay, priority, notes, active,
        principal_cents, annual_rate, term_months, current_principal_cents,
        payments_made, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      id,
      userId,
      input.name,
      input.kind,
      Math.abs(Math.trunc(input.amountCents)),
      input.frequency,
      input.dueDay,
      input.startDate,
      input.endDate ?? null,
      input.accountId ?? null,
      input.categoryId ?? null,
      input.autopay ? 1 : 0,
      input.priority ?? "normal",
      input.notes ?? null,
      input.active === false ? 0 : 1,
      input.principalCents ?? null,
      input.annualRate ?? 0,
      input.termMonths ?? null,
      input.principalCents ?? null,
      now,
      now,
    ],
  );
  const created = await getBill(userId, id);
  if (!created) throw new Error("Bill could not be created");
  return created;
}

export async function updateBill(
  userId: string,
  id: string,
  input: Partial<BillInput> & { paymentsMade?: number; currentPrincipalCents?: number },
): Promise<Bill | null> {
  const db = await getDb();
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const push = (column: string, value: string | number | null) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };

  if (input.name !== undefined) push("name", input.name);
  if (input.kind !== undefined) push("kind", input.kind);
  if (input.amountCents !== undefined)
    push("amount_cents", Math.abs(Math.trunc(input.amountCents)));
  if (input.frequency !== undefined) push("frequency", input.frequency);
  if (input.dueDay !== undefined) push("due_day", input.dueDay);
  if (input.startDate !== undefined) push("start_date", input.startDate);
  if (input.endDate !== undefined) push("end_date", input.endDate);
  if (input.accountId !== undefined) push("account_id", input.accountId);
  if (input.categoryId !== undefined) push("category_id", input.categoryId);
  if (input.autopay !== undefined) push("autopay", input.autopay ? 1 : 0);
  if (input.priority !== undefined) push("priority", input.priority);
  if (input.notes !== undefined) push("notes", input.notes);
  if (input.active !== undefined) push("active", input.active ? 1 : 0);
  if (input.principalCents !== undefined)
    push("principal_cents", input.principalCents);
  if (input.currentPrincipalCents !== undefined)
    push("current_principal_cents", input.currentPrincipalCents);
  if (input.annualRate !== undefined) push("annual_rate", input.annualRate);
  if (input.termMonths !== undefined) push("term_months", input.termMonths);
  if (input.paymentsMade !== undefined)
    push("payments_made", Math.max(0, Math.trunc(input.paymentsMade)));

  if (sets.length === 0) return getBill(userId, id);
  sets.push("updated_at = ?");
  params.push(new Date().toISOString(), userId, id);
  const result = await db.run(
    `UPDATE bills SET ${sets.join(", ")} WHERE user_id = ? AND id = ?`,
    params,
  );
  if (result.changes === 0) return null;
  return getBill(userId, id);
}

export async function deleteBill(userId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.run(`DELETE FROM bills WHERE user_id = ? AND id = ?`, [
    userId,
    id,
  ]);
  return result.changes > 0;
}

/**
 * Outstanding principal across active EMI (loan) bills — money still owed.
 *
 * Loans recorded as liability accounts are already deducted from net worth via
 * their negative balances; this covers loans tracked only as an EMI schedule,
 * which would otherwise be invisible to net worth.
 */
export async function getOutstandingLoanPrincipalCents(
  userId: string,
): Promise<number> {
  const db = await getDb();
  const row = await db.get<{ total: number }>(
    `SELECT COALESCE(SUM(current_principal_cents), 0) AS total
       FROM bills
      WHERE user_id = ? AND kind = 'emi' AND active = 1`,
    [userId],
  );
  return Number(row?.total ?? 0);
}

/* ------------------------------------------------------- EMI schedules */

export async function listEmiPayments(
  userId: string,
  billId: string,
): Promise<EmiPayment[]> {
  const db = await getDb();
  const rows = await db.all<EmiPaymentRow>(
    `SELECT * FROM emi_payments
      WHERE user_id = ? AND bill_id = ?
      ORDER BY due_date ASC`,
    [userId, billId],
  );
  return rows.map(toEmiPayment);
}

export async function replaceEmiSchedule(
  userId: string,
  billId: string,
  rows: {
    dueDate: string;
    amountCents: number;
    principalCents: number;
    interestCents: number;
    balanceAfterCents: number;
  }[],
): Promise<void> {
  const db = await getDb();
  await db.tx(async (tx) => {
    await tx.run(`DELETE FROM emi_payments WHERE user_id = ? AND bill_id = ?`, [
      userId,
      billId,
    ]);
    const now = new Date().toISOString();
    for (const row of rows) {
      await tx.run(
        `INSERT INTO emi_payments (
            id, bill_id, user_id, due_date, amount_cents, principal_cents,
            interest_cents, balance_after_cents, status, transaction_id, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', NULL, ?)`,
        [
          newId(),
          billId,
          userId,
          row.dueDate,
          row.amountCents,
          row.principalCents,
          row.interestCents,
          row.balanceAfterCents,
          now,
        ],
      );
    }
  });
}

export async function markEmiPaid(input: {
  userId: string;
  emiPaymentId: string;
  transactionId: string;
}): Promise<void> {
  const db = await getDb();
  await db.run(
    `UPDATE emi_payments SET status = 'paid', transaction_id = ?
      WHERE id = ? AND user_id = ?`,
    [input.transactionId, input.emiPaymentId, input.userId],
  );
}