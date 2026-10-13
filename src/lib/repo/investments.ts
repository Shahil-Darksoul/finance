import { getDb } from "@/lib/db";
import { newId } from "@/lib/utils/id";
import type {
  AssetType,
  Investment,
  InvestmentTransaction,
  InvestmentTransactionType,
} from "@/lib/types";
import {
  type InvestmentRow,
  type InvestmentTransactionRow,
  toInvestment,
  toInvestmentTransaction,
} from "./mappers";

export async function listInvestments(
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<Investment[]> {
  const db = await getDb();
  const rows = await db.all<InvestmentRow>(
    `SELECT * FROM investments
      WHERE user_id = ? ${options.includeArchived ? "" : "AND archived = 0"}
      ORDER BY symbol ASC`,
    [userId],
  );
  return rows.map(toInvestment);
}

export async function getInvestment(
  userId: string,
  id: string,
): Promise<Investment | null> {
  const db = await getDb();
  const row = await db.get<InvestmentRow>(
    `SELECT * FROM investments WHERE user_id = ? AND id = ?`,
    [userId, id],
  );
  return row ? toInvestment(row) : null;
}

export type InvestmentInput = {
  symbol: string;
  name: string;
  assetType?: AssetType;
  quantity: number;
  avgCostCents: number;
  /** The currency this holding is priced and displayed in. Defaults to USD. */
  currency?: string;
  accountId?: string | null;
  notes?: string | null;
  archived?: boolean;
};

export async function createInvestment(
  userId: string,
  input: InvestmentInput,
): Promise<Investment> {
  const db = await getDb();
  const id = newId();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO investments (
        id, user_id, symbol, name, asset_type, quantity, avg_cost_cents,
        currency, account_id, notes, archived, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      input.symbol.toUpperCase(),
      input.name,
      input.assetType ?? "stock",
      input.quantity,
      Math.max(0, Math.trunc(input.avgCostCents)),
      input.currency ?? "USD",
      input.accountId ?? null,
      input.notes ?? null,
      input.archived ? 1 : 0,
      now,
      now,
    ],
  );
  const created = await getInvestment(userId, id);
  if (!created) throw new Error("Investment could not be added");
  return created;
}

export async function updateInvestment(
  userId: string,
  id: string,
  input: Partial<InvestmentInput>,
): Promise<Investment | null> {
  const db = await getDb();
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const push = (column: string, value: string | number | null) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };

  if (input.symbol !== undefined) push("symbol", input.symbol.toUpperCase());
  if (input.name !== undefined) push("name", input.name);
  if (input.assetType !== undefined) push("asset_type", input.assetType);
  if (input.quantity !== undefined) push("quantity", input.quantity);
  if (input.avgCostCents !== undefined)
    push("avg_cost_cents", Math.max(0, Math.trunc(input.avgCostCents)));
  if (input.currency !== undefined) push("currency", input.currency);
  if (input.accountId !== undefined) push("account_id", input.accountId);
  if (input.notes !== undefined) push("notes", input.notes);
  if (input.archived !== undefined) push("archived", input.archived ? 1 : 0);

  if (sets.length === 0) return getInvestment(userId, id);
  sets.push("updated_at = ?");
  params.push(new Date().toISOString(), userId, id);
  const result = await db.run(
    `UPDATE investments SET ${sets.join(", ")} WHERE user_id = ? AND id = ?`,
    params,
  );
  if (result.changes === 0) return null;
  return getInvestment(userId, id);
}

export async function deleteInvestment(
  userId: string,
  id: string,
): Promise<boolean> {
  const db = await getDb();
  const result = await db.run(`DELETE FROM investments WHERE user_id = ? AND id = ?`, [
    userId,
    id,
  ]);
  return result.changes > 0;
}

export async function findInvestmentBySymbol(
  userId: string,
  symbol: string,
): Promise<Investment | null> {
  const db = await getDb();
  const row = await db.get<InvestmentRow>(
    `SELECT * FROM investments WHERE user_id = ? AND symbol = ?`,
    [userId, symbol.toUpperCase()],
  );
  return row ? toInvestment(row) : null;
}

/**
 * Records a purchase into the holding for this symbol, creating it if needed.
 *
 * A user cannot hold two rows for the same symbol, so buying more of something
 * they already own folds into the existing position and recomputes the average
 * cost from the combined cost rather than overwriting it.
 */
export async function upsertInvestmentHolding(
  userId: string,
  input: InvestmentInput,
): Promise<{ investment: Investment; merged: boolean }> {
  const existing = await findInvestmentBySymbol(userId, input.symbol);
  if (!existing) {
    return { investment: await createInvestment(userId, input), merged: false };
  }

  const addQuantity = input.quantity;
  const newQuantity = existing.quantity + addQuantity;
  const newAvgCostCents =
    newQuantity > 0
      ? Math.round(
          (existing.quantity * existing.avgCostCents + addQuantity * input.avgCostCents) /
            newQuantity,
        )
      : input.avgCostCents;

  const investment = await updateInvestment(userId, existing.id, {
    quantity: newQuantity,
    avgCostCents: newAvgCostCents,
    // Fill in details only while they are still unknown.
    name: existing.name || input.name,
    accountId: existing.accountId ?? input.accountId ?? null,
    notes: input.notes ?? existing.notes ?? null,
  });

  if (!investment) throw new Error("Investment could not be updated");
  return { investment, merged: true };
}

/* ------------------------------------------------ investment ledger */

export async function listInvestmentTransactions(
  userId: string,
  investmentId?: string,
): Promise<InvestmentTransaction[]> {
  const db = await getDb();
  const rows = await db.all<InvestmentTransactionRow>(
    `SELECT * FROM investment_transactions
      WHERE user_id = ? ${investmentId ? "AND investment_id = ?" : ""}
      ORDER BY date DESC, created_at DESC`,
    investmentId ? [userId, investmentId] : [userId],
  );
  return rows.map(toInvestmentTransaction);
}

export type InvestmentTransactionInput = {
  investmentId: string;
  type: InvestmentTransactionType;
  quantity: number;
  priceCents: number;
  amountCents: number;
  feesCents?: number;
  date: string;
  notes?: string | null;
  transactionId?: string | null;
};

export async function createInvestmentTransaction(
  userId: string,
  input: InvestmentTransactionInput,
): Promise<InvestmentTransaction> {
  const db = await getDb();
  const id = newId();
  await db.run(
    `INSERT INTO investment_transactions (
        id, user_id, investment_id, type, quantity, price_cents, amount_cents,
        fees_cents, date, notes, transaction_id, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      input.investmentId,
      input.type,
      input.quantity,
      Math.max(0, Math.trunc(input.priceCents)),
      Math.trunc(input.amountCents),
      Math.max(0, Math.trunc(input.feesCents ?? 0)),
      input.date,
      input.notes ?? null,
      input.transactionId ?? null,
      new Date().toISOString(),
    ],
  );
  const row = await db.get<InvestmentTransactionRow>(
    `SELECT * FROM investment_transactions WHERE id = ?`,
    [id],
  );
  if (!row) throw new Error("Investment transaction could not be recorded");
  return toInvestmentTransaction(row);
}

export async function deleteInvestmentTransaction(
  userId: string,
  id: string,
): Promise<boolean> {
  const db = await getDb();
  const result = await db.run(
    `DELETE FROM investment_transactions WHERE user_id = ? AND id = ?`,
    [userId, id],
  );
  return result.changes > 0;
}

/** Cash actually invested (buys + deposits), ignoring dividends and growth. */
export async function getTotalInvested(
  userId: string,
): Promise<{ boughtCents: number; dividendsCents: number; soldCents: number }> {
  const db = await getDb();
  const row = await db.get<{
    bought: number;
    dividends: number;
    sold: number;
  }>(
    `SELECT
        COALESCE(SUM(CASE WHEN type IN ('buy','deposit') THEN amount_cents ELSE 0 END), 0) AS bought,
        COALESCE(SUM(CASE WHEN type = 'dividend' THEN amount_cents ELSE 0 END), 0) AS dividends,
        COALESCE(SUM(CASE WHEN type = 'sell' THEN amount_cents ELSE 0 END), 0) AS sold
       FROM investment_transactions WHERE user_id = ?`,
    [userId],
  );
  return {
    boughtCents: Number(row?.bought ?? 0),
    dividendsCents: Number(row?.dividends ?? 0),
    soldCents: Number(row?.sold ?? 0),
  };
}

/**
 * Annualised return implied by recorded buys and dividends over the holding
 * period. This is a simple money-weighted approximation, clearly labelled as an
 * estimate wherever it is displayed.
 */
export async function getImpliedAnnualReturn(
  userId: string,
): Promise<number | null> {
  const db = await getDb();
  const row = await db.get<{ first: string | null; last: string | null }>(
    `SELECT MIN(date) AS first, MAX(date) AS last
       FROM investment_transactions WHERE user_id = ?`,
    [userId],
  );
  const first = row?.first;
  const last = row?.last;
  if (!first || !last) return null;

  const years = (new Date(last).getTime() - new Date(first).getTime()) /
    (365.25 * 24 * 60 * 60 * 1000);
  if (years < 0.5) return null;

  const { boughtCents, dividendsCents, soldCents } = await getTotalInvested(userId);
  const netContributed = boughtCents - soldCents;
  if (netContributed <= 0) return null;

  const totalGain = dividendsCents;
  if (totalGain <= 0) return 0;

  const simpleAnnual = totalGain / netContributed / years;
  // Cap so an unusual month cannot produce an absurd assumption downstream.
  return Math.max(-0.5, Math.min(0.5, simpleAnnual));
}