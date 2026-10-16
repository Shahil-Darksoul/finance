import { getDb } from "@/lib/db";
import { newId } from "@/lib/utils/id";
import { ACCOUNT_TYPE_META, type Account, type AccountType } from "@/lib/types";
import {
  type AccountRow,
  bool,
  toAccount,
} from "./mappers";

/**
 * Balances are never stored. They are derived from `opening_balance_cents` plus
 * every transaction that touches the account, which makes it impossible for the
 * balance to drift out of sync with the ledger.
 *
 * A transfer is one row: `account_id` is the source (money leaves) and
 * `related_account_id` is the destination (money arrives).
 */
const BALANCE_AGGREGATES = `
  COALESCE(agg.out_delta, 0) AS out_delta,
  COALESCE(agg_in.in_delta, 0) AS in_delta,
  COALESCE(agg.cnt, 0) AS transaction_count
`;

/** A liability balance is money owed, so it is stored negative. */
function normalizeOpeningBalance(
  type: AccountType,
  openingBalanceCents?: number,
): number {
  const opening = Math.trunc(openingBalanceCents ?? 0);
  return ACCOUNT_TYPE_META[type].kind === "liability" ? -Math.abs(opening) : opening;
}

const BALANCE_JOINS = `
  LEFT JOIN (
    SELECT
      account_id AS aid,
      SUM(
        CASE
          WHEN type IN ('income', 'refund') THEN amount_cents
          WHEN type IN ('expense', 'investment', 'transfer', 'lending') THEN -amount_cents
          ELSE 0
        END
      ) AS out_delta,
      COUNT(*) AS cnt
    FROM transactions
    GROUP BY account_id
  ) agg ON agg.aid = a.id
  LEFT JOIN (
    SELECT
      related_account_id AS aid,
      SUM(amount_cents) AS in_delta
    FROM transactions
    WHERE type = 'transfer' AND related_account_id IS NOT NULL
    GROUP BY related_account_id
  ) agg_in ON agg_in.aid = a.id
`;

export type AccountInput = {
  name: string;
  type: AccountType;
  institution?: string | null;
  openingBalanceCents?: number;
  creditLimitCents?: number;
  currency?: string;
  color?: string | null;
  icon?: string | null;
  note?: string | null;
  includeInNetWorth?: boolean;
  sortOrder?: number;
};

export async function listAccounts(
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<Account[]> {
  const db = await getDb();
  const rows = await db.all<AccountRow>(
    `SELECT a.*, ${BALANCE_AGGREGATES},
            a.opening_balance_cents + COALESCE(agg.out_delta, 0) + COALESCE(agg_in.in_delta, 0) AS current_balance_cents
       FROM accounts a
       ${BALANCE_JOINS}
      WHERE a.user_id = ?
        ${options.includeArchived ? "" : "AND a.is_archived = 0"}
      ORDER BY a.sort_order ASC, a.created_at ASC`,
    [userId],
  );
  return rows.map(toAccount);
}

export async function getAccount(
  userId: string,
  accountId: string,
): Promise<Account | null> {
  const db = await getDb();
  const row = await db.get<AccountRow>(
    `SELECT a.*, ${BALANCE_AGGREGATES},
            a.opening_balance_cents + COALESCE(agg.out_delta, 0) + COALESCE(agg_in.in_delta, 0) AS current_balance_cents
       FROM accounts a
       ${BALANCE_JOINS}
      WHERE a.user_id = ? AND a.id = ?`,
    [userId, accountId],
  );
  return row ? toAccount(row) : null;
}

export async function createAccount(
  userId: string,
  input: AccountInput,
): Promise<Account> {
  const db = await getDb();
  const id = newId();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO accounts (
        id, user_id, name, type, institution, opening_balance_cents,
        credit_limit_cents, currency, color, icon, note,
        include_in_net_worth, is_archived, sort_order, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [
      id,
      userId,
      input.name,
      input.type,
      input.institution ?? null,
      normalizeOpeningBalance(input.type, input.openingBalanceCents),
      input.creditLimitCents ?? 0,
      input.currency ?? "USD",
      input.color ?? null,
      input.icon ?? null,
      input.note ?? null,
      input.includeInNetWorth === false ? 0 : 1,
      input.sortOrder ?? 0,
      now,
      now,
    ],
  );
  const created = await getAccount(userId, id);
  if (!created) throw new Error("Account could not be created");
  return created;
}

export async function updateAccount(
  userId: string,
  accountId: string,
  input: Partial<AccountInput> & { isArchived?: boolean },
): Promise<Account | null> {
  const db = await getDb();
  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  const push = (column: string, value: string | number | null) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };

  if (input.name !== undefined) push("name", input.name);
  if (input.type !== undefined) push("type", input.type);
  if (input.institution !== undefined) push("institution", input.institution);
  if (input.openingBalanceCents !== undefined) {
    const type = input.type ?? (await getAccount(userId, accountId))?.type;
    if (type) push("opening_balance_cents", normalizeOpeningBalance(type, input.openingBalanceCents));
    else push("opening_balance_cents", Math.trunc(input.openingBalanceCents));
  }
  if (input.creditLimitCents !== undefined)
    push("credit_limit_cents", Math.trunc(input.creditLimitCents));
  if (input.currency !== undefined) push("currency", input.currency);
  if (input.color !== undefined) push("color", input.color);
  if (input.icon !== undefined) push("icon", input.icon);
  if (input.note !== undefined) push("note", input.note);
  if (input.includeInNetWorth !== undefined)
    push("include_in_net_worth", input.includeInNetWorth ? 1 : 0);
  if (input.isArchived !== undefined) push("is_archived", input.isArchived ? 1 : 0);
  if (input.sortOrder !== undefined) push("sort_order", input.sortOrder);

  if (sets.length === 0) return getAccount(userId, accountId);

  sets.push("updated_at = ?");
  params.push(new Date().toISOString(), userId, accountId);

  const result = await db.run(
    `UPDATE accounts SET ${sets.join(", ")} WHERE user_id = ? AND id = ?`,
    params,
  );
  if (result.changes === 0) return null;
  return getAccount(userId, accountId);
}

export async function deleteAccount(
  userId: string,
  accountId: string,
  deletionNote?: string,
): Promise<boolean> {
  const db = await getDb();
  let deleted = false;
  await db.tx(async (tx) => {
    const row = await tx.get<{
      name: string;
      type: string;
      institution: string | null;
      opening_balance_cents: number;
      credit_limit_cents: number;
      currency: string;
      color: string | null;
      icon: string | null;
      note: string | null;
      include_in_net_worth: number;
    }>(
      `SELECT name, type, institution, opening_balance_cents, credit_limit_cents,
              currency, color, icon, note, include_in_net_worth
         FROM accounts
        WHERE user_id = ? AND id = ?`,
      [userId, accountId],
    );
    if (!row) return;

    // Snapshot the account before removing it so a deletion can always be
    // explained later. Linked transactions keep their history; the foreign key
    // just clears their account reference.
    await tx.run(
      `INSERT INTO account_deletions (
          id, user_id, account_id, name, type, institution, opening_balance_cents,
          credit_limit_cents, currency, color, icon, account_notes,
          include_in_net_worth, deletion_note, deleted_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        userId,
        accountId,
        row.name,
        row.type,
        row.institution,
        row.opening_balance_cents,
        row.credit_limit_cents,
        row.currency,
        row.color,
        row.icon,
        row.note,
        row.include_in_net_worth,
        (deletionNote ?? "").trim() || "Account removed",
        new Date().toISOString(),
      ],
    );

    const result = await tx.run(
      `DELETE FROM accounts WHERE user_id = ? AND id = ?`,
      [userId, accountId],
    );
    deleted = result.changes > 0;
  });
  return deleted;
}

/** Totals used by the dashboard summary and net-worth calculations. */
export type AccountTotals = {
  /**
   * Ledger net worth: the sum of account balances (including outstanding money
   * lent out as a receivable), excluding anything marked
   * `include_in_net_worth = 0`.
   *
   * This deliberately does *not* include the market value of investments,
   * because valuing holdings requires a quote and this layer is pure SQL. Use
   * `netWorthCents` from `getFinancialSummary` for anything user-facing, which
   * adds the portfolio value on top.
   */
  netWorthCents: number;
  cashCents: number;
  savingsCents: number;
  /** Cash held in brokerage/investment accounts, held out of `cashCents`. */
  brokerageCents: number;
  debtCents: number;
  /**
   * Outstanding money lent to others. It is treated as an asset because it is
   * expected back, so it offsets the cash that left the account.
   */
  receivablesCents: number;
  positiveAssetsCents: number;
  totalAssetsCents: number;
};

const SAVINGS_TYPES = ["savings", "emergency", "high_yield"];

export async function getAccountTotals(
  userId: string,
): Promise<AccountTotals> {
  const db = await getDb();
  const row = await db.get<{
    net_worth_cents: number;
    cash_cents: number;
    savings_cents: number;
    brokerage_cents: number;
    debt_cents: number;
    positive_assets_cents: number;
    total_assets_cents: number;
  }>(
    `WITH balances AS (
       SELECT a.id, a.type, a.include_in_net_worth,
              a.opening_balance_cents
              + COALESCE(agg.out_delta, 0)
              + COALESCE(agg_in.in_delta, 0) AS balance
         FROM accounts a
         ${BALANCE_JOINS}
        WHERE a.user_id = ? AND a.is_archived = 0
     )
     SELECT
       COALESCE(SUM(CASE WHEN include_in_net_worth = 1 THEN balance ELSE 0 END), 0) AS net_worth_cents,
       COALESCE(SUM(CASE WHEN type NOT IN ('savings','emergency','high_yield','credit_card','brokerage','loan')
                          THEN balance ELSE 0 END), 0) AS cash_cents,
       COALESCE(SUM(CASE WHEN type IN (${SAVINGS_TYPES.map(() => "?").join(",")})
                          THEN balance ELSE 0 END), 0) AS savings_cents,
       COALESCE(SUM(CASE WHEN type IN ('brokerage','investment')
                          THEN balance ELSE 0 END), 0) AS brokerage_cents,
       -- Debt includes credit cards and loans (liabilities).
       COALESCE(SUM(CASE WHEN balance < 0 AND type NOT IN ('brokerage','investment')
                          THEN -balance ELSE 0 END), 0) AS debt_cents,
       COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) AS positive_assets_cents,
       COALESCE(SUM(balance), 0) AS total_assets_cents
       FROM balances`,
    [userId, ...SAVINGS_TYPES],
  );

  // Money lent out leaves the account but is still owed back, so it is counted
  // as an asset. Only accounts included in net worth contribute.
  const receivables = await db.get<{ total: number }>(
    `SELECT COALESCE(SUM(t.amount_cents), 0) AS total
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
      WHERE t.user_id = ?
        AND t.type = 'lending'
        AND a.include_in_net_worth = 1
        AND a.is_archived = 0`,
    [userId],
  );
  const receivablesCents = Number(receivables?.total ?? 0);

  return {
    netWorthCents: Number(row?.net_worth_cents ?? 0) + receivablesCents,
    cashCents: Number(row?.cash_cents ?? 0),
    savingsCents: Number(row?.savings_cents ?? 0),
    brokerageCents: Number(row?.brokerage_cents ?? 0),
    debtCents: Number(row?.debt_cents ?? 0),
    receivablesCents,
    positiveAssetsCents: Number(row?.positive_assets_cents ?? 0),
    totalAssetsCents: Number(row?.total_assets_cents ?? 0),
  };
}

/** Sum of balances for a specific set of account ids (used for goal + cash math). */
export async function getBalanceForAccounts(
  userId: string,
  accountIds: string[],
): Promise<number> {
  if (accountIds.length === 0) return 0;
  const db = await getDb();
  const { placeholders } = await import("@/lib/db");
  const row = await db.get<{ total: number }>(
    `WITH balances AS (
       SELECT a.id,
              a.opening_balance_cents
              + COALESCE(agg.out_delta, 0)
              + COALESCE(agg_in.in_delta, 0) AS balance
         FROM accounts a
         ${BALANCE_JOINS}
        WHERE a.user_id = ? AND a.id IN (${placeholders(accountIds.length)})
     )
     SELECT COALESCE(SUM(balance), 0) AS total FROM balances`,
    [userId, ...accountIds],
  );
  return Number(row?.total ?? 0);
}

export { bool };