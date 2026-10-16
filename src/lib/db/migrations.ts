/**
 * Portable schema migrations.
 *
 * The DDL below is written in a dialect-neutral subset of SQL so the exact same
 * statements run on the default `node:sqlite` driver and on PostgreSQL (when
 * DATABASE_URL is configured):
 *
 *  - identifiers are TEXT (UUIDs)            -> works in both engines
 *  - money is INTEGER (minor units)          -> exact arithmetic in both
 *  - rates are REAL (double precision)        -> both engines store 8-byte floats
 *  - dates/timestamps are TEXT (ISO-8601)    -> identical lexicographic ordering
 *  - booleans are INTEGER 0/1                -> avoids `boolean` vs `int` drift
 *  - `?` placeholders, translated to `$n` for Postgres by the driver
 *
 * If you later move to Postgres/Supabase, nothing above this file changes.
 */

export type Migration = {
  id: string;
  statements: string[];
};

const MONEY = "INTEGER NOT NULL DEFAULT 0";
const TS = "TEXT NOT NULL";
const REF = "REFERENCES";

export const migrations: Migration[] = [
  {
    id: "0001_init",
    statements: [
      `CREATE TABLE IF NOT EXISTS app_migrations (
        id TEXT PRIMARY KEY,
        applied_at ${TS}
      )`,

      /* ---------------------------------------------------------- users */
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        is_demo INTEGER NOT NULL DEFAULT 0,
        onboarding_step INTEGER NOT NULL DEFAULT 0,
        created_at ${TS},
        updated_at ${TS}
      )`,

      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        expires_at ${TS},
        created_at ${TS},
        user_agent TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,

      `CREATE TABLE IF NOT EXISTS password_resets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at ${TS},
        used_at TEXT,
        created_at ${TS}
      )`,

      /* ------------------------------------------------------- accounts */
      `CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'checking',
        institution TEXT,
        opening_balance_cents ${MONEY},
        credit_limit_cents ${MONEY},
        currency TEXT NOT NULL DEFAULT 'USD',
        color TEXT,
        icon TEXT,
        note TEXT,
        include_in_net_worth INTEGER NOT NULL DEFAULT 1,
        is_archived INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at ${TS},
        updated_at ${TS}
      )`,
      `CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id)`,

      /* ------------------------------------------------------ categories */
      `CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'expense',
        color TEXT,
        icon TEXT,
        is_system INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at ${TS}
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_unique
        ON categories(user_id, name, kind)`,

      /* ---------------------------------------------------- transactions */
      `CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        account_id TEXT ${REF} accounts(id) ON DELETE SET NULL,
        related_account_id TEXT ${REF} accounts(id) ON DELETE SET NULL,
        category_id TEXT ${REF} categories(id) ON DELETE SET NULL,
        goal_id TEXT,
        recurring_id TEXT,
        type TEXT NOT NULL DEFAULT 'expense',
        amount_cents ${MONEY},
        date TEXT NOT NULL,
        description TEXT,
        merchant TEXT,
        payment_method TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'cleared',
        is_recurring INTEGER NOT NULL DEFAULT 0,
        created_at ${TS},
        updated_at ${TS}
      )`,
      `CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date)`,
      `CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tx_goal ON transactions(goal_id)`,

      /* ----------------------------------------------- recurring items */
      `CREATE TABLE IF NOT EXISTS recurring_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'expense',
        amount_cents ${MONEY},
        category_id TEXT ${REF} categories(id) ON DELETE SET NULL,
        account_id TEXT ${REF} accounts(id) ON DELETE SET NULL,
        payment_method TEXT,
        frequency TEXT NOT NULL DEFAULT 'monthly',
        interval_count INTEGER NOT NULL DEFAULT 1,
        days_of_week TEXT,
        day_of_month INTEGER,
        month_of_year INTEGER,
        start_date TEXT NOT NULL,
        end_date TEXT,
        next_occurrence TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at ${TS},
        updated_at ${TS}
      )`,
      `CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring_transactions(user_id)`,

      /* ---------------------------------------------------------- bills */
      `CREATE TABLE IF NOT EXISTS bills (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'bill',
        amount_cents ${MONEY},
        frequency TEXT NOT NULL DEFAULT 'monthly',
        due_day INTEGER NOT NULL DEFAULT 1,
        start_date TEXT NOT NULL,
        end_date TEXT,
        account_id TEXT ${REF} accounts(id) ON DELETE SET NULL,
        category_id TEXT ${REF} categories(id) ON DELETE SET NULL,
        autopay INTEGER NOT NULL DEFAULT 0,
        priority TEXT NOT NULL DEFAULT 'normal',
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        principal_cents INTEGER,
        annual_rate REAL NOT NULL DEFAULT 0,
        term_months INTEGER,
        current_principal_cents INTEGER,
        payments_made INTEGER NOT NULL DEFAULT 0,
        created_at ${TS},
        updated_at ${TS}
      )`,
      `CREATE INDEX IF NOT EXISTS idx_bills_user ON bills(user_id)`,

      `CREATE TABLE IF NOT EXISTS emi_payments (
        id TEXT PRIMARY KEY,
        bill_id TEXT NOT NULL ${REF} bills(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        due_date TEXT NOT NULL,
        amount_cents ${MONEY},
        principal_cents ${MONEY},
        interest_cents ${MONEY},
        balance_after_cents INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'scheduled',
        transaction_id TEXT,
        created_at ${TS}
      )`,
      `CREATE INDEX IF NOT EXISTS idx_emi_bill ON emi_payments(bill_id, due_date)`,

      /* -------------------------------------------------------- paydays */
      `CREATE TABLE IF NOT EXISTS paydays (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        start_date TEXT NOT NULL,
        frequency TEXT NOT NULL DEFAULT 'biweekly',
        second_day INTEGER,
        anchor_day INTEGER,
        amount_cents ${MONEY},
        account_id TEXT ${REF} accounts(id) ON DELETE SET NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at ${TS}
      )`,
      `CREATE INDEX IF NOT EXISTS idx_paydays_user ON paydays(user_id)`,

      /* ---------------------------------------------------- savings goals */
      `CREATE TABLE IF NOT EXISTS savings_goals (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        target_cents INTEGER NOT NULL DEFAULT 0,
        target_date TEXT,
        monthly_contribution_cents ${MONEY},
        priority TEXT NOT NULL DEFAULT 'medium',
        account_id TEXT ${REF} accounts(id) ON DELETE SET NULL,
        color TEXT,
        icon TEXT,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at ${TS},
        updated_at ${TS}
      )`,
      `CREATE INDEX IF NOT EXISTS idx_goals_user ON savings_goals(user_id)`,

      `CREATE TABLE IF NOT EXISTS goal_contributions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        goal_id TEXT NOT NULL ${REF} savings_goals(id) ON DELETE CASCADE,
        amount_cents INTEGER NOT NULL DEFAULT 0,
        date TEXT NOT NULL,
        account_id TEXT ${REF} accounts(id) ON DELETE SET NULL,
        transaction_id TEXT,
        note TEXT,
        created_at ${TS}
      )`,
      `CREATE INDEX IF NOT EXISTS idx_goal_contrib ON goal_contributions(goal_id, date)`,

      /* ---------------------------------------------------- investments */
      `CREATE TABLE IF NOT EXISTS investments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        asset_type TEXT NOT NULL DEFAULT 'stock',
        quantity REAL NOT NULL DEFAULT 0,
        avg_cost_cents INTEGER NOT NULL DEFAULT 0,
        account_id TEXT ${REF} accounts(id) ON DELETE SET NULL,
        notes TEXT,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at ${TS},
        updated_at ${TS}
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_investments_symbol
        ON investments(user_id, symbol)`,
      `CREATE INDEX IF NOT EXISTS idx_investments_user ON investments(user_id)`,

      `CREATE TABLE IF NOT EXISTS investment_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        investment_id TEXT NOT NULL ${REF} investments(id) ON DELETE CASCADE,
        type TEXT NOT NULL DEFAULT 'buy',
        quantity REAL NOT NULL DEFAULT 0,
        price_cents INTEGER NOT NULL DEFAULT 0,
        amount_cents INTEGER NOT NULL DEFAULT 0,
        fees_cents INTEGER NOT NULL DEFAULT 0,
        date TEXT NOT NULL,
        notes TEXT,
        transaction_id TEXT,
        created_at ${TS}
      )`,
      `CREATE INDEX IF NOT EXISTS idx_inv_tx ON investment_transactions(investment_id, date)`,

      /* ------------------------------------------------------- snapshots */
      `CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        net_worth_cents INTEGER NOT NULL DEFAULT 0,
        cash_cents INTEGER NOT NULL DEFAULT 0,
        savings_cents INTEGER NOT NULL DEFAULT 0,
        investments_cents INTEGER NOT NULL DEFAULT 0,
        debt_cents INTEGER NOT NULL DEFAULT 0,
        income_cents INTEGER NOT NULL DEFAULT 0,
        expense_cents INTEGER NOT NULL DEFAULT 0,
        created_at ${TS}
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshots_user_date ON snapshots(user_id, date)`,

      /* -------------------------------------------------- notifications */
      `CREATE TABLE IF NOT EXISTS notification_prefs (
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (user_id, key)
      )`,

      `CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        severity TEXT NOT NULL DEFAULT 'info',
        link TEXT,
        dedupe_key TEXT,
        read_at TEXT,
        created_at ${TS}
      )`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_user
        ON notifications(user_id, created_at)`,

      /* ------------------------------------------------------ forecasts */
      `CREATE TABLE IF NOT EXISTS forecasts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        scenario TEXT NOT NULL DEFAULT 'trend',
        months INTEGER NOT NULL DEFAULT 12,
        params_json TEXT,
        result_json TEXT,
        created_at ${TS}
      )`,
      `CREATE INDEX IF NOT EXISTS idx_forecasts_user ON forecasts(user_id)`,

      /* ------------------------------------------------- market data cache */
      `CREATE TABLE IF NOT EXISTS market_quotes (
        symbol TEXT NOT NULL,
        provider TEXT NOT NULL,
        price_cents INTEGER NOT NULL DEFAULT 0,
        previous_close_cents INTEGER NOT NULL DEFAULT 0,
        change_cents INTEGER NOT NULL DEFAULT 0,
        change_ratio REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        market_time TEXT,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY (symbol, provider)
      )`,

      `CREATE TABLE IF NOT EXISTS market_history (
        symbol TEXT NOT NULL,
        provider TEXT NOT NULL,
        date TEXT NOT NULL,
        close_cents INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (symbol, provider, date)
      )`,
    ],
  },
  {
    id: "0002_transaction_deletions",
    statements: [
      `CREATE TABLE IF NOT EXISTS transaction_deletions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        transaction_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount_cents INTEGER NOT NULL DEFAULT 0,
        date TEXT NOT NULL,
        description TEXT,
        merchant TEXT,
        transaction_notes TEXT,
        deletion_note TEXT NOT NULL,
        deleted_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_transaction_deletions_user
        ON transaction_deletions(user_id, deleted_at)`,
    ],
  },
  {
    id: "0003_occurrence_skips",
    statements: [
      `CREATE TABLE IF NOT EXISTS occurrence_skips (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        date TEXT NOT NULL,
        created_at ${TS},
        UNIQUE (source_type, source_id, date)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_occurrence_skips_user
        ON occurrence_skips(user_id, source_type, source_id)`,
    ],
  },
  {
    id: "0004_occurrence_skip_notes",
    statements: [
      `ALTER TABLE occurrence_skips ADD COLUMN deletion_note TEXT`,
    ],
  },
  {
    id: "0005_occurrence_overrides",
    statements: [
      `CREATE TABLE IF NOT EXISTS occurrence_overrides (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        date TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        created_at ${TS},
        updated_at ${TS},
        UNIQUE (source_type, source_id, date)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_occurrence_overrides_user
        ON occurrence_overrides(user_id, source_type, source_id)`,
    ],
  },
  {
    id: "0006_transaction_payday_link",
    statements: [
      `ALTER TABLE transactions ADD COLUMN payday_id TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_tx_payday
        ON transactions(user_id, payday_id, date)`,
    ],
  },
  {
    id: "0007_liability_balances_negative",
    statements: [
      `UPDATE accounts
          SET opening_balance_cents = -ABS(opening_balance_cents)
        WHERE type IN ('credit_card', 'loan')
          AND opening_balance_cents > 0`,
    ],
  },
  {
    id: "0008_investment_currency_user_market_settings",
    statements: [
      // Holdings are priced in their own currency (e.g. TSX tickers in CAD,
      // US tickers in USD); nothing is converted. Existing rows default to USD.
      `ALTER TABLE investments ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'`,

      // Per-user market-data credentials. Server-only: they are never selected
      // into the browser-facing user shape. Env vars remain a fallback.
      `CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY ${REF} users(id) ON DELETE CASCADE,
        market_api_key TEXT,
        market_provider TEXT,
        updated_at ${TS}
      )`,
    ],
  },
  {
    id: "0009_display_currency",
    statements: [
      // Preferred display currency, converted from the account's base currency
      // at live exchange rates. NULL means "show amounts in the base currency".
      `ALTER TABLE user_settings ADD COLUMN display_currency TEXT`,
    ],
  },
  {
    id: "0010_investment_deletions",
    statements: [
      `CREATE TABLE IF NOT EXISTS investment_deletions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        investment_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        name TEXT,
        asset_type TEXT,
        quantity REAL NOT NULL DEFAULT 0,
        avg_cost_cents INTEGER NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        account_id TEXT,
        investment_notes TEXT,
        deletion_note TEXT NOT NULL,
        deleted_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_investment_deletions_user
        ON investment_deletions(user_id, deleted_at)`,
    ],
  },
  {
    id: "0011_account_deletions",
    statements: [
      // Account deletions are audited like transactions and investments: the
      // account's final snapshot is kept before the row is removed. Any
      // transactions pointing at the account have their link set to NULL by the
      // foreign key, so their history survives.
      `CREATE TABLE IF NOT EXISTS account_deletions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL ${REF} users(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        institution TEXT,
        opening_balance_cents INTEGER NOT NULL DEFAULT 0,
        credit_limit_cents INTEGER NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        color TEXT,
        icon TEXT,
        account_notes TEXT,
        include_in_net_worth INTEGER NOT NULL DEFAULT 1,
        deletion_note TEXT NOT NULL,
        deleted_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_account_deletions_user
        ON account_deletions(user_id, deleted_at)`,
    ],
  },
];