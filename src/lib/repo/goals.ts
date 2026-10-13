import { getDb } from "@/lib/db";
import { newId } from "@/lib/utils/id";
import type { GoalContribution, Priority, SavingsGoal } from "@/lib/types";
import {
  type GoalContributionRow,
  type GoalRow,
  toGoal,
  toGoalContribution,
} from "./mappers";

/**
 * `current_cents` is never written directly by callers — it is recomputed from
 * the contribution ledger on every change, so the progress bar can never drift
 * away from the underlying records.
 */
const GOAL_SELECT = `
  SELECT g.*,
         COALESCE((SELECT SUM(amount_cents) FROM goal_contributions gc WHERE gc.goal_id = g.id), 0) AS current_cents,
         a.name AS account_name
    FROM savings_goals g
    LEFT JOIN accounts a ON a.id = g.account_id
`;

export async function listGoals(
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<SavingsGoal[]> {
  const db = await getDb();
  const rows = await db.all<GoalRow>(
    `${GOAL_SELECT}
      WHERE g.user_id = ? ${options.includeArchived ? "" : "AND g.archived = 0"}
      ORDER BY g.archived ASC, g.created_at ASC`,
    [userId],
  );
  return rows.map(toGoal);
}

export async function getGoal(
  userId: string,
  id: string,
): Promise<SavingsGoal | null> {
  const db = await getDb();
  const row = await db.get<GoalRow>(`${GOAL_SELECT} WHERE g.user_id = ? AND g.id = ?`, [
    userId,
    id,
  ]);
  return row ? toGoal(row) : null;
}

export type GoalInput = {
  name: string;
  description?: string | null;
  targetCents: number;
  targetDate?: string | null;
  monthlyContributionCents?: number;
  priority?: Priority;
  accountId?: string | null;
  color?: string | null;
  icon?: string | null;
  archived?: boolean;
};

export async function createGoal(
  userId: string,
  input: GoalInput,
): Promise<SavingsGoal> {
  const db = await getDb();
  const id = newId();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO savings_goals (
        id, user_id, name, description, target_cents, target_date,
        monthly_contribution_cents, priority, account_id, color, icon,
        archived, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      input.name,
      input.description ?? null,
      Math.max(0, Math.trunc(input.targetCents)),
      input.targetDate ?? null,
      Math.max(0, Math.trunc(input.monthlyContributionCents ?? 0)),
      input.priority ?? "medium",
      input.accountId ?? null,
      input.color ?? null,
      input.icon ?? null,
      input.archived ? 1 : 0,
      now,
      now,
    ],
  );
  const created = await getGoal(userId, id);
  if (!created) throw new Error("Savings goal could not be created");
  return created;
}

export async function updateGoal(
  userId: string,
  id: string,
  input: Partial<GoalInput>,
): Promise<SavingsGoal | null> {
  const db = await getDb();
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const push = (column: string, value: string | number | null) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };

  if (input.name !== undefined) push("name", input.name);
  if (input.description !== undefined) push("description", input.description);
  if (input.targetCents !== undefined)
    push("target_cents", Math.max(0, Math.trunc(input.targetCents)));
  if (input.targetDate !== undefined) push("target_date", input.targetDate);
  if (input.monthlyContributionCents !== undefined)
    push(
      "monthly_contribution_cents",
      Math.max(0, Math.trunc(input.monthlyContributionCents)),
    );
  if (input.priority !== undefined) push("priority", input.priority);
  if (input.accountId !== undefined) push("account_id", input.accountId);
  if (input.color !== undefined) push("color", input.color);
  if (input.icon !== undefined) push("icon", input.icon);
  if (input.archived !== undefined) push("archived", input.archived ? 1 : 0);

  if (sets.length === 0) return getGoal(userId, id);
  sets.push("updated_at = ?");
  params.push(new Date().toISOString(), userId, id);
  const result = await db.run(
    `UPDATE savings_goals SET ${sets.join(", ")} WHERE user_id = ? AND id = ?`,
    params,
  );
  if (result.changes === 0) return null;
  return getGoal(userId, id);
}

export async function deleteGoal(userId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.run(
    `DELETE FROM savings_goals WHERE user_id = ? AND id = ?`,
    [userId, id],
  );
  return result.changes > 0;
}

/* ------------------------------------------------------- contributions */

export async function listContributions(
  userId: string,
  goalId?: string,
): Promise<GoalContribution[]> {
  const db = await getDb();
  const rows = await db.all<GoalContributionRow>(
    `SELECT * FROM goal_contributions
      WHERE user_id = ? ${goalId ? "AND goal_id = ?" : ""}
      ORDER BY date DESC, created_at DESC`,
    goalId ? [userId, goalId] : [userId],
  );
  return rows.map(toGoalContribution);
}

export type ContributionInput = {
  goalId: string;
  amountCents: number;
  date: string;
  accountId?: string | null;
  transactionId?: string | null;
  note?: string | null;
};

export async function addContribution(
  userId: string,
  input: ContributionInput,
): Promise<GoalContribution> {
  const db = await getDb();
  const id = newId();
  await db.run(
    `INSERT INTO goal_contributions (
        id, user_id, goal_id, amount_cents, date, account_id, transaction_id, note, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      input.goalId,
      Math.trunc(input.amountCents),
      input.date,
      input.accountId ?? null,
      input.transactionId ?? null,
      input.note ?? null,
      new Date().toISOString(),
    ],
  );
  const row = await db.get<GoalContributionRow>(
    `SELECT * FROM goal_contributions WHERE id = ?`,
    [id],
  );
  if (!row) throw new Error("Contribution could not be recorded");
  return toGoalContribution(row);
}

export async function deleteContribution(
  userId: string,
  id: string,
): Promise<boolean> {
  const db = await getDb();
  const result = await db.run(
    `DELETE FROM goal_contributions WHERE user_id = ? AND id = ?`,
    [userId, id],
  );
  return result.changes > 0;
}

/**
 * Average monthly contribution actually recorded over the last `months`.
 * Used by forecasting so projections reflect real behaviour, not just the
 * user's aspirational setting.
 */
export async function getHistoricalContributionRate(
  userId: string,
  months: number,
): Promise<number> {
  const db = await getDb();
  const row = await db.get<{ total: number; cnt: number }>(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total, COUNT(*) AS cnt
       FROM goal_contributions
      WHERE user_id = ? AND date >= ?`,
    [
      userId,
      new Date(Date.now() - months * 30.44 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
    ],
  );
  const total = Number(row?.total ?? 0);
  const count = Number(row?.cnt ?? 0);
  if (count === 0) return 0;
  // Spread the recorded total across the window rather than dividing by the
  // number of deposits, so one large lump sum is not mistaken for a monthly rate.
  return Math.round(total / Math.max(1, months));
}