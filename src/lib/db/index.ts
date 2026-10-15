/**
 * Database driver abstraction.
 *
 * Two drivers implement the same tiny interface:
 *   - `node:sqlite` (default): zero-config, file-backed, perfect for local use.
 *     The file lives on the server, so nothing sensitive ever reaches localStorage.
 *   - `pg` (PostgreSQL/Supabase): selected automatically when DATABASE_URL is set.
 *
 * The selected driver is chosen once per process. Queries are written with `?`
 * placeholders; the Postgres driver rewrites them to `$1, $2, ...`.
 */

import type { Migration } from "./migrations";
import { migrations } from "./migrations";

export type SqlParam = string | number | bigint | null | Uint8Array;

export type RunResult = {
  changes: number;
};

export interface DbDriver {
  readonly dialect: "sqlite" | "postgres";
  all<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T[]>;
  get<T = Record<string, unknown>>(
    sql: string,
    params?: SqlParam[],
  ): Promise<T | undefined>;
  run(sql: string, params?: SqlParam[]): Promise<RunResult>;
  exec(sql: string): Promise<void>;
  /** Runs `fn` inside a transaction, rolling back if it throws. */
  tx<T>(fn: (db: DbDriver) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Env + singleton plumbing                                            */
/* ------------------------------------------------------------------ */

function readEnv(key: string): string | undefined {
  const value = process.env[key];
  return value && value.trim() ? value.trim() : undefined;
}

export function databaseUrl(): string | undefined {
  return readEnv("DATABASE_URL");
}

export function isPostgresConfigured(): boolean {
  const url = databaseUrl();
  if (!url) return false;
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

/** `sqlite` when no DATABASE_URL is set, otherwise `postgres`. */
export function dialect(): "sqlite" | "postgres" {
  return isPostgresConfigured() ? "postgres" : "sqlite";
}

function sqliteFilePath(): string {
  const configured = readEnv("SQLITE_PATH");
  if (configured) return configured;
  const dir = readEnv("DATA_DIR") ?? ".data";
  return `${dir}/finance.db`;
}

/* ------------------------------------------------------------------ */
/* SQLite driver (node:sqlite)                                        */
/* ------------------------------------------------------------------ */

/**
 * node:sqlite only accepts null | number | bigint | string | Uint8Array.
 * Booleans and undefined are coerced here so callers can pass plain objects.
 */
function coerceSqliteParams(params: SqlParam[]): SqlParam[] {
  return params.map((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    return value;
  });
}

async function createSqliteDriver(): Promise<DbDriver> {
  const { DatabaseSync } = await import("node:sqlite");
  const path = sqliteFilePath();

  if (path !== ":memory:") {
    const dir = path.slice(0, path.lastIndexOf("/"));
    if (dir) {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(dir, { recursive: true });
    }
  }

  const handle = new DatabaseSync(path);
  // WAL keeps reads fast while a write is in flight; foreign keys are off by
  // default in SQLite and we rely on ON DELETE CASCADE.
  handle.exec("PRAGMA journal_mode = WAL");
  handle.exec("PRAGMA foreign_keys = ON");
  handle.exec("PRAGMA busy_timeout = 5000");

  const driver: DbDriver = {
    dialect: "sqlite",

    async all<T>(sql: string, params: SqlParam[] = []) {
      const statement = handle.prepare(sql);
      const rows = statement.all(...coerceSqliteParams(params));
      return rows as T[];
    },

    async get<T>(sql: string, params: SqlParam[] = []) {
      const statement = handle.prepare(sql);
      const row = statement.get(...coerceSqliteParams(params));
      return (row ?? undefined) as T | undefined;
    },

    async run(sql: string, params: SqlParam[] = []) {
      const statement = handle.prepare(sql);
      const result = statement.run(...coerceSqliteParams(params));
      return { changes: Number(result.changes ?? 0) };
    },

    async exec(sql: string) {
      handle.exec(sql);
    },

    async tx<T>(fn: (db: DbDriver) => Promise<T>) {
      handle.exec("BEGIN");
      try {
        const result = await fn(driver);
        handle.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          handle.exec("ROLLBACK");
        } catch {
          // The transaction was already aborted; surface the original error.
        }
        throw error;
      }
    },

    async close() {
      handle.close();
    },
  };

  return driver;
}

/* ------------------------------------------------------------------ */
/* Postgres driver (pg)                                               */
/* ------------------------------------------------------------------ */

/**
 * Rewrite `?` placeholders to `$1..$n` for Postgres. Literal `?` inside
 * string/identifier quotes is skipped so queries like `WHERE note <> '?'`
 * are not corrupted.
 */
export function toNumberedPlaceholders(sql: string): string {
  let out = "";
  let index = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      out += char;
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        out += char + next;
        i += 1;
        continue;
      }
      out += char;
      continue;
    }
    if (!inSingle && !inDouble) {
      if (char === "-" && next === "-") {
        inLineComment = true;
        out += char;
        continue;
      }
      if (char === "/" && next === "*") {
        inBlockComment = true;
        out += char;
        continue;
      }
    }
    if (char === "'" && !inDouble) inSingle = !inSingle;
    else if (char === '"' && !inSingle) inDouble = !inDouble;

    if (char === "?" && !inSingle && !inDouble) {
      index += 1;
      out += `$${index}`;
    } else {
      out += char;
    }
  }

  return out;
}

async function createPostgresDriver(): Promise<DbDriver> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({
    connectionString: databaseUrl(),
    max: 10,
    // Do NOT pass `options`/`statement_timeout` here. Node sends it as the
    // `options` startup packet, and Neon's pooled endpoint (PgBouncer in
    // transaction mode) rejects that with "unsupported startup parameter in
    // options", failing every connection. Use a direct (non-pooled) URL if a
    // server-side statement timeout is ever required.
  });

  // Keep money as JS numbers of cents (well under 2^53).
  const normalize = (params: SqlParam[]) =>
    params.map((value) => {
      if (value === undefined) return null;
      if (typeof value === "boolean") return value ? 1 : 0;
      if (typeof value === "number") return value;
      if (typeof value === "bigint") return Number(value);
      if (value instanceof Uint8Array) return Buffer.from(value);
      return value;
    });

  const query = async <T>(
    sql: string,
    params: SqlParam[],
  ): Promise<{ rows: T[]; rowCount: number }> => {
    const result = await pool.query(toNumberedPlaceholders(sql), normalize(params));
    return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
  };

  const driver: DbDriver = {
    dialect: "postgres",

    async all<T>(sql: string, params: SqlParam[] = []) {
      const { rows } = await query<T>(sql, params);
      return rows;
    },

    async get<T>(sql: string, params: SqlParam[] = []) {
      const { rows } = await query<T>(sql, params);
      return rows[0];
    },

    async run(sql: string, params: SqlParam[] = []) {
      const { rowCount } = await query(sql, params);
      return { changes: rowCount };
    },

    async exec(sql: string) {
      await query(sql, []);
    },

    async tx<T>(fn: (db: DbDriver) => Promise<T>) {
      const client = await pool.connect();
      const txDriver: DbDriver = {
        dialect: "postgres",
        async all<T2>(sql: string, params: SqlParam[] = []) {
          const result = await client.query(
            toNumberedPlaceholders(sql),
            normalize(params),
          );
          return result.rows as T2[];
        },
        async get<T2>(sql: string, params: SqlParam[] = []) {
          const result = await client.query(
            toNumberedPlaceholders(sql),
            normalize(params),
          );
          return result.rows[0] as T2 | undefined;
        },
        async run(sql: string, params: SqlParam[] = []) {
          const result = await client.query(
            toNumberedPlaceholders(sql),
            normalize(params),
          );
          return { changes: result.rowCount ?? 0 };
        },
        async exec(sql: string) {
          await client.query(toNumberedPlaceholders(sql), []);
        },
        async tx<T2>(nested: (db: DbDriver) => Promise<T2>) {
          return nested(txDriver);
        },
        async close() {
          /* the outer pool owns the connection */
        },
      };

      try {
        await client.query("BEGIN");
        const result = await fn(txDriver);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore rollback failures, surface original error */
        }
        throw error;
      } finally {
        client.release();
      }
    },

    async close() {
      await pool.end();
    },
  };

  return driver;
}

/* ------------------------------------------------------------------ */
/* Singleton + migrations                                             */
/* ------------------------------------------------------------------ */

declare global {
  /** Cached driver, so migrations run once per process rather than per request. */
  var __financeDb: Promise<DbDriver> | undefined;
}

async function initDriver(): Promise<DbDriver> {
  const driver = dialect() === "postgres"
    ? await createPostgresDriver()
    : await createSqliteDriver();
  await runMigrations(driver, migrations);
  return driver;
}

/** Returns the process-wide database handle, initialising it on first use. */
export function getDb(): Promise<DbDriver> {
  if (!globalThis.__financeDb) {
    globalThis.__financeDb = initDriver().catch((error) => {
      // Allow a later request to retry instead of caching a rejected promise.
      globalThis.__financeDb = undefined;
      throw error;
    });
  }
  return globalThis.__financeDb;
}

export async function runMigrations(
  driver: DbDriver,
  list: Migration[],
): Promise<string[]> {
  const applied: string[] = [];
  await driver.exec(
    `CREATE TABLE IF NOT EXISTS app_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`,
  );

  const existing = new Set(
    (await driver.all<{ id: string }>(`SELECT id FROM app_migrations`)).map(
      (row) => row.id,
    ),
  );

  for (const migration of list) {
    if (existing.has(migration.id)) continue;
    await driver.tx(async (tx) => {
      for (const statement of migration.statements) {
        await tx.exec(statement);
      }
      await tx.run(`INSERT INTO app_migrations (id, applied_at) VALUES (?, ?)`, [
        migration.id,
        new Date().toISOString(),
      ]);
    });
    applied.push(migration.id);
  }

  return applied;
}

/** Build an `IN (?, ?, ?)` clause with the right arity. */
export function placeholders(count: number): string {
  return new Array(count).fill("?").join(", ");
}