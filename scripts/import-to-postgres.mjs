#!/usr/bin/env node
/**
 * Copy a local SQLite database (`./.data/finance.db` by default) into a
 * PostgreSQL database such as Neon, Supabase or Railway.
 *
 * The schema is created by the app itself on first request, so run the app
 * once against the target (or just deploy it) before importing. This script
 * only moves data.
 *
 * Usage:
 *   DATABASE_URL="postgresql://...:...@...neon.tech/neondb?sslmode=require" \
 *     node scripts/import-to-postgres.mjs [path/to/finance.db] [--force]
 *
 * By default it refuses to run when the target already contains users, so it
 * cannot clobber a live database by accident. Pass `--force` to replace the
 * destination data (it TRUNCATEs the app tables first).
 */
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
const args = process.argv.slice(2);
const force = args.includes("--force");
const sqlitePath = args.find((arg) => !arg.startsWith("-")) ?? ".data/finance.db";

if (!databaseUrl) {
  console.error("DATABASE_URL is required (e.g. your Neon connection string).");
  process.exit(1);
}
if (!existsSync(sqlitePath)) {
  console.error(`SQLite database not found: ${sqlitePath}`);
  process.exit(1);
}

/**
 * Insert order matters: a row may only be inserted after every row its foreign
 * keys point at. `app_migrations` is intentionally omitted — the target keeps
 * its own migration bookkeeping.
 */
const TABLES = [
  "users",
  "sessions",
  "password_resets",
  "accounts",
  "categories",
  "recurring_transactions",
  "transactions",
  "bills",
  "emi_payments",
  "paydays",
  "savings_goals",
  "goal_contributions",
  "investments",
  "investment_transactions",
  "snapshots",
  "notification_prefs",
  "notifications",
  "forecasts",
  "market_quotes",
  "market_history",
  "transaction_deletions",
  "occurrence_skips",
  "occurrence_overrides",
  "user_settings",
];

const quoteIdent = (name) => `"${name.replace(/"/g, '""')}"`;

/** node:sqlite returns Uint8Array for BLOBs; pg wants a Buffer. */
function normalize(value) {
  if (value instanceof Uint8Array) return Buffer.from(value);
  return value === undefined ? null : value;
}

const sqlite = new DatabaseSync(sqlitePath);
const pool = new pg.Pool({ connectionString: databaseUrl });
const client = await pool.connect();
let imported = 0;

try {
  await client.query("BEGIN");

  const { rows: existing } = await client.query("SELECT COUNT(*)::int AS n FROM users");
  if (existing[0].n > 0 && !force) {
    throw new Error(
      `Target already has ${existing[0].n} user(s); re-run with --force to replace.`,
    );
  }

  await client.query(`TRUNCATE ${TABLES.map(quoteIdent).join(", ")} CASCADE`);

  for (const table of TABLES) {
    const rows = sqlite.prepare(`SELECT * FROM ${quoteIdent(table)}`).all();
    if (rows.length === 0) {
      console.log(`=  ${table}: 0 rows`);
      continue;
    }

    // Only copy columns that exist on the destination, so a target that is a
    // migration behind/ahead still imports cleanly.
    const { rows: destCols } = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    const destSet = new Set(destCols.map((r) => r.column_name));
    const cols = Object.keys(rows[0]).filter((c) => destSet.has(c));

    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `INSERT INTO ${quoteIdent(table)} (${cols
      .map(quoteIdent)
      .join(", ")}) VALUES (${placeholders})`;

    for (const row of rows) {
      await client.query(sql, cols.map((c) => normalize(row[c])));
    }
    imported += rows.length;
    console.log(`+  ${table}: ${rows.length} rows`);
  }

  await client.query("COMMIT");
  console.log(`\nImport complete: ${imported} rows copied from ${sqlitePath}.`);
} catch (error) {
  await client.query("ROLLBACK");
  console.error(`\nImport failed, rolled back: ${error.message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
  sqlite.close();
}
