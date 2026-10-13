import { getDb, placeholders } from "@/lib/db";
import { newId } from "@/lib/utils/id";
import type { CategoryBreakdown, Transaction, TransactionType } from "@/lib/types";
import { type TransactionRow, toTransaction } from "./mappers";

const SELECT_WITH_RELATIONS = `
  SELECT t.*,
         a.name AS account_name,
         ra.name AS related_account_name,
         c.name AS category_name,
         c.color AS category_color
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    LEFT JOIN accounts ra ON ra.id = t.related_account_id
    LEFT JOIN categories c ON c.id = t.category_id
`;

export type TransactionInput = {
  type: TransactionType;
  amountCents: number;
  date: string;
  accountId: string | null;
  categoryId?: string | null;
  relatedAccountId?: string | null;
  goalId?: string | null;
  recurringId?: string | null;
  paydayId?: string | null;
  description?: string | null;
  merchant?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  status?: "cleared" | "pending";
  isRecurring?: boolean;
};

export type TransactionFilters = {
  from?: string;
  to?: string;
  accountId?: string;
  categoryId?: string;
  goalId?: string;
  type?: TransactionType | "all";
  minAmountCents?: number;
  maxAmountCents?: number;
  search?: string;
  limit?: number;
  offset?: number;
  sort?: "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
};

function buildWhere(userId: string, filters: TransactionFilters): {
  clause: string;
  params: (string | number)[];
} {
  const conditions: string[] = ["t.user_id = ?"];
  const params: (string | number)[] = [userId];

  if (filters.from) {
    conditions.push("t.date >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push("t.date <= ?");
    params.push(filters.to);
  }
  if (filters.accountId) {
    conditions.push("(t.account_id = ? OR t.related_account_id = ?)");
    params.push(filters.accountId, filters.accountId);
  }
  if (filters.categoryId) {
    conditions.push("t.category_id = ?");
    params.push(filters.categoryId);
  }
  if (filters.goalId) {
    conditions.push("t.goal_id = ?");
    params.push(filters.goalId);
  }
  if (filters.type && filters.type !== "all") {
    conditions.push("t.type = ?");
    params.push(filters.type);
  }
  if (typeof filters.minAmountCents === "number") {
    conditions.push("t.amount_cents >= ?");
    params.push(filters.minAmountCents);
  }
  if (typeof filters.maxAmountCents === "number") {
    conditions.push("t.amount_cents <= ?");
    params.push(filters.maxAmountCents);
  }
  if (filters.search) {
    conditions.push(
      `(LOWER(COALESCE(t.description, '')) LIKE ?
        OR LOWER(COALESCE(t.merchant, '')) LIKE ?
        OR LOWER(COALESCE(t.notes, '')) LIKE ?
        OR LOWER(COALESCE(c.name, '')) LIKE ?
        OR LOWER(COALESCE(a.name, '')) LIKE ?)`,
    );
    const needle = `%${filters.search.toLowerCase()}%`;
    params.push(needle, needle, needle, needle, needle);
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

const SORTS: Record<NonNullable<TransactionFilters["sort"]>, string> = {
  date_desc: "t.date DESC, t.created_at DESC",
  date_asc: "t.date ASC, t.created_at ASC",
  amount_desc: "t.amount_cents DESC, t.date DESC",
  amount_asc: "t.amount_cents ASC, t.date DESC",
};

export async function listTransactions(
  userId: string,
  filters: TransactionFilters = {},
): Promise<Transaction[]> {
  const db = await getDb();
  const where = buildWhere(userId, filters);
  const order = SORTS[filters.sort ?? "date_desc"];
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const rows = await db.all<TransactionRow>(
    `${SELECT_WITH_RELATIONS} ${where.clause} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...where.params, limit, offset],
  );
  return rows.map(toTransaction);
}

export async function countTransactions(
  userId: string,
  filters: TransactionFilters = {},
): Promise<number> {
  const db = await getDb();
  const where = buildWhere(userId, filters);
  const row = await db.get<{ total: number }>(
    `SELECT COUNT(*) AS total
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN accounts a ON a.id = t.account_id
     ${where.clause}`,
    where.params,
  );
  return Number(row?.total ?? 0);
}

export async function getTransaction(
  userId: string,
  transactionId: string,
): Promise<Transaction | null> {
  const db = await getDb();
  const row = await db.get<TransactionRow>(
    `${SELECT_WITH_RELATIONS} WHERE t.user_id = ? AND t.id = ?`,
    [userId, transactionId],
  );
  return row ? toTransaction(row) : null;
}

/**
 * Verifies the referenced accounts/categories belong to the user before writing.
 * Every mutation is scoped by `user_id`, so a guessed id cannot be used to touch
 * another person's data even if ownership checks were skipped.
 */
async function assertOwnership(
  userId: string,
  input: {
    accountId: string | null;
    relatedAccountId?: string | null;
    categoryId?: string | null;
    goalId?: string | null;
  },
): Promise<void> {
  const db = await getDb();
  const ids = [input.accountId, input.relatedAccountId].filter(
    (id): id is string => Boolean(id),
  );
  if (ids.length > 0) {
    const rows = await db.all<{ id: string }>(
      `SELECT id FROM accounts WHERE user_id = ? AND id IN (${placeholders(ids.length)})`,
      [userId, ...ids],
    );
    if (rows.length !== ids.length) {
      throw new Error("One of the selected accounts is not available.");
    }
  }
  if (input.categoryId) {
    const row = await db.get<{ id: string }>(
      `SELECT id FROM categories WHERE user_id = ? AND id = ?`,
      [userId, input.categoryId],
    );
    if (!row) throw new Error("That category is not available.");
  }
  if (input.goalId) {
    const row = await db.get<{ id: string }>(
      `SELECT id FROM savings_goals WHERE user_id = ? AND id = ?`,
      [userId, input.goalId],
    );
    if (!row) throw new Error("That savings goal is not available.");
  }
}

export async function createTransaction(
  userId: string,
  input: TransactionInput,
): Promise<Transaction> {
  await assertOwnership(userId, input);
  const db = await getDb();
  const id = newId();
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO transactions (
        id, user_id, account_id, related_account_id, category_id, goal_id,
        recurring_id, payday_id, type, amount_cents, date, description, merchant,
        payment_method, notes, status, is_recurring, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      input.accountId,
      input.relatedAccountId ?? null,
      input.categoryId ?? null,
      input.goalId ?? null,
      input.recurringId ?? null,
      input.paydayId ?? null,
      input.type,
      Math.abs(Math.trunc(input.amountCents)),
      input.date,
      input.description ?? null,
      input.merchant ?? null,
      input.paymentMethod ?? null,
      input.notes ?? null,
      input.status ?? "cleared",
      input.isRecurring ? 1 : 0,
      now,
      now,
    ],
  );

  const created = await getTransaction(userId, id);
  if (!created) throw new Error("Transaction could not be created");
  return created;
}

export async function updateTransaction(
  userId: string,
  transactionId: string,
  input: Partial<TransactionInput>,
): Promise<Transaction | null> {
  const existing = await getTransaction(userId, transactionId);
  if (!existing) return null;

  await assertOwnership(userId, {
    accountId: input.accountId ?? existing.accountId,
    relatedAccountId:
      input.relatedAccountId !== undefined
        ? input.relatedAccountId
        : existing.relatedAccountId,
    categoryId:
      input.categoryId !== undefined ? input.categoryId : existing.categoryId,
    goalId: input.goalId !== undefined ? input.goalId : existing.goalId,
  });

  const db = await getDb();
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const push = (column: string, value: string | number | null) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };

  if (input.type !== undefined) push("type", input.type);
  if (input.amountCents !== undefined)
    push("amount_cents", Math.abs(Math.trunc(input.amountCents)));
  if (input.date !== undefined) push("date", input.date);
  if (input.accountId !== undefined) push("account_id", input.accountId);
  if (input.relatedAccountId !== undefined)
    push("related_account_id", input.relatedAccountId);
  if (input.categoryId !== undefined) push("category_id", input.categoryId);
  if (input.goalId !== undefined) push("goal_id", input.goalId);
  if (input.recurringId !== undefined) push("recurring_id", input.recurringId);
  if (input.paydayId !== undefined) push("payday_id", input.paydayId);
  if (input.description !== undefined) push("description", input.description);
  if (input.merchant !== undefined) push("merchant", input.merchant);
  if (input.paymentMethod !== undefined)
    push("payment_method", input.paymentMethod);
  if (input.notes !== undefined) push("notes", input.notes);
  if (input.status !== undefined) push("status", input.status);
  if (input.isRecurring !== undefined)
    push("is_recurring", input.isRecurring ? 1 : 0);

  if (sets.length === 0) return existing;
  sets.push("updated_at = ?");
  params.push(new Date().toISOString(), userId, transactionId);

  const result = await db.run(
    `UPDATE transactions SET ${sets.join(", ")} WHERE user_id = ? AND id = ?`,
    params,
  );
  if (result.changes === 0) return null;
  return getTransaction(userId, transactionId);
}

export async function deleteTransaction(
  userId: string,
  transactionId: string,
  deletionNote: string,
): Promise<boolean> {
  const db = await getDb();
  const now = new Date().toISOString();
  let deleted = false;

  await db.tx(async (tx) => {
    const row = await tx.get<{
      type: string;
      amount_cents: number;
      date: string;
      description: string | null;
      merchant: string | null;
      notes: string | null;
    }>(
      `SELECT type, amount_cents, date, description, merchant, notes
         FROM transactions
        WHERE user_id = ? AND id = ?`,
      [userId, transactionId],
    );
    if (!row) return;

    await tx.run(
      `INSERT INTO transaction_deletions (
          id, user_id, transaction_id, type, amount_cents, date,
          description, merchant, transaction_notes, deletion_note, deleted_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        userId,
        transactionId,
        row.type,
        row.amount_cents,
        row.date,
        row.description,
        row.merchant,
        row.notes,
        deletionNote,
        now,
      ],
    );

    const result = await tx.run(
      `DELETE FROM transactions WHERE user_id = ? AND id = ?`,
      [userId, transactionId],
    );
    deleted = result.changes > 0;
  });

  return deleted;
}

/* ------------------------------------------------------------ aggregates */

export type MonthlyTotals = {
  incomeCents: number;
  expenseCents: number;
  investmentCents: number;
  refundCents: number;
};

/**
 * Income and expense totals per calendar month.
 *
 * Transfers are intentionally excluded so moving money between accounts can
 * never be mistaken for earning or spending. `investment` is tracked separately
 * from `expense` because buying a stock moves cash without consuming it.
 */
export async function getMonthlyTotals(
  userId: string,
  fromMonth: string,
  toMonth: string,
): Promise<Map<string, MonthlyTotals>> {
  const db = await getDb();
  const rows = await db.all<{
    month: string;
    income_cents: number;
    expense_cents: number;
    investment_cents: number;
    refund_cents: number;
  }>(
    `SELECT
        SUBSTR(date, 1, 7) AS month,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS income_cents,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense_cents,
        COALESCE(SUM(CASE WHEN type = 'investment' THEN amount_cents ELSE 0 END), 0) AS investment_cents,
        COALESCE(SUM(CASE WHEN type = 'refund' THEN amount_cents ELSE 0 END), 0) AS refund_cents
       FROM transactions
      WHERE user_id = ? AND date >= ? AND date <= ?
        AND type <> 'transfer'
      GROUP BY SUBSTR(date, 1, 7)
      ORDER BY month ASC`,
    [userId, fromMonth, toMonth],
  );

  const map = new Map<string, MonthlyTotals>();
  for (const row of rows) {
    map.set(row.month, {
      incomeCents: Number(row.income_cents),
      expenseCents: Number(row.expense_cents),
      investmentCents: Number(row.investment_cents),
      refundCents: Number(row.refund_cents),
    });
  }
  return map;
}

export type NetFlowPoint = { date: string; netWorthCents: number };

/**
 * Daily running net worth across the window (accounts only; investments are
 * added by the analytics service).
 *
 * The running balance is accumulated in JavaScript rather than SQL: a correlated
 * subquery per account per day is prohibitively expensive, and this keeps the
 * query dialect-neutral between SQLite and Postgres.
 */
export async function getNetWorthSeries(
  userId: string,
  from: string,
  to: string,
): Promise<NetFlowPoint[]> {
  const db = await getDb();

  const opening = await db.get<{ total: number }>(
    `SELECT COALESCE(SUM(opening_balance_cents), 0) AS total
       FROM accounts WHERE user_id = ? AND is_archived = 0`,
    [userId],
  );

  const rows = await db.all<{
    date: string;
    type: string;
    amount_cents: number;
    account_id: string | null;
    related_account_id: string | null;
  }>(
    `SELECT date, type, amount_cents, account_id, related_account_id
       FROM transactions
      WHERE user_id = ? AND date <= ?
      ORDER BY date ASC, created_at ASC`,
    [userId, to],
  );

  // Balance of every transaction that happened on or before `from`, then a
  // per-day delta for the rest of the window.
  let running = Number(opening?.total ?? 0);
  const byDate = new Map<string, number>();
  let started = false;

  for (const row of rows) {
    const amount = Number(row.amount_cents);
    let delta = 0;
    switch (row.type) {
      case "income":
      case "refund":
        delta = amount;
        break;
      case "expense":
      case "investment":
      case "transfer":
        delta = -amount;
        break;
      default:
        delta = 0;
    }
    // The destination of a transfer gains what the source loses.
    if (row.type === "transfer") {
      delta = -amount;
    }

    if (row.date > to) continue;

    if (row.date < from) {
      running += delta;
    } else {
      byDate.set(row.date, (byDate.get(row.date) ?? 0) + delta);
      started = true;
    }
  }

  // Transfers out are already negative; add the inbound leg for the destination.
  const inbound = new Map<string, number>();
  for (const row of rows) {
    if (row.type !== "transfer" || !row.related_account_id) continue;
    if (row.date > to) continue;
    if (row.date < from) running += Number(row.amount_cents);
    else inbound.set(row.date, (inbound.get(row.date) ?? 0) + Number(row.amount_cents));
  }

  const dates = [...byDate.keys()].sort();
  if (dates.length === 0) {
    return started ? [] : [{ date: from, netWorthCents: Math.trunc(running) }];
  }

  const points: NetFlowPoint[] = [{ date: from, netWorthCents: Math.trunc(running) }];
  for (const date of dates) {
    running += (byDate.get(date) ?? 0) + (inbound.get(date) ?? 0);
    points.push({ date, netWorthCents: Math.trunc(running) });
  }
  return points;
}

export async function getCategoryBreakdown(
  userId: string,
  from: string,
  to: string,
  kind: "expense" | "income" = "expense",
  limit = 12,
): Promise<CategoryBreakdown[]> {
  const db = await getDb();
  const rows = await db.all<{
    category_id: string | null;
    category_name: string | null;
    color: string | null;
    total: number;
    cnt: number;
  }>(
    `SELECT t.category_id,
            COALESCE(c.name, 'Uncategorised') AS category_name,
            c.color AS color,
            SUM(t.amount_cents) AS total,
            COUNT(*) AS cnt
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = ?
        AND t.date >= ? AND t.date <= ?
        AND t.type = ?
      GROUP BY t.category_id, category_name, color
      ORDER BY total DESC`,
    [userId, from, to, kind],
  );

  const total = rows.reduce((sum, row) => sum + Number(row.total), 0);
  return rows.slice(0, limit).map((row) => ({
    categoryId: row.category_id,
    categoryName: row.category_name ?? "Uncategorised",
    color: row.color,
    amountCents: Math.trunc(Number(row.total)),
    ratio: total > 0 ? Number(row.total) / total : 0,
    transactionCount: Number(row.cnt),
  }));
}

/** Totals for an arbitrary date window (used by analytics range filters). */
export async function getRangeTotals(
  userId: string,
  from: string,
  to: string,
): Promise<MonthlyTotals> {
  const db = await getDb();
  const row = await db.get<{
    income_cents: number;
    expense_cents: number;
    investment_cents: number;
    refund_cents: number;
  }>(
    `SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS income_cents,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense_cents,
        COALESCE(SUM(CASE WHEN type = 'investment' THEN amount_cents ELSE 0 END), 0) AS investment_cents,
        COALESCE(SUM(CASE WHEN type = 'refund' THEN amount_cents ELSE 0 END), 0) AS refund_cents
       FROM transactions
      WHERE user_id = ? AND date >= ? AND date <= ? AND type <> 'transfer'`,
    [userId, from, to],
  );
  return {
    incomeCents: Number(row?.income_cents ?? 0),
    expenseCents: Number(row?.expense_cents ?? 0),
    investmentCents: Number(row?.investment_cents ?? 0),
    refundCents: Number(row?.refund_cents ?? 0),
  };
}

export async function getLargestExpense(
  userId: string,
  from: string,
  to: string,
): Promise<Transaction | null> {
  const db = await getDb();
  const row = await db.get<TransactionRow>(
    `${SELECT_WITH_RELATIONS}
      WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ? AND t.date <= ?
      ORDER BY t.amount_cents DESC LIMIT 1`,
    [userId, from, to],
  );
  return row ? toTransaction(row) : null;
}

export async function getTransactionCountByMonth(
  userId: string,
  fromMonth: string,
  toMonth: string,
): Promise<number> {
  const db = await getDb();
  const row = await db.get<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM transactions
      WHERE user_id = ? AND date >= ? AND date <= ?`,
    [userId, fromMonth, toMonth],
  );
  return Number(row?.cnt ?? 0);
}

export async function getRecurringRevenueByMonth(
  userId: string,
  fromMonth: string,
  toMonth: string,
): Promise<number> {
  const db = await getDb();
  const row = await db.get<{ total: number }>(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total
       FROM transactions
      WHERE user_id = ? AND is_recurring = 1 AND type = 'expense'
        AND date >= ? AND date <= ?`,
    [userId, fromMonth, toMonth],
  );
  return Number(row?.total ?? 0);
}

/** Distinct dates that have any transaction — used to detect "no data yet". */
export async function getFirstTransactionDate(
  userId: string,
): Promise<string | null> {
  const db = await getDb();
  const row = await db.get<{ date: string | null }>(
    `SELECT MIN(date) AS date FROM transactions WHERE user_id = ?`,
    [userId],
  );
  return row?.date ?? null;
}