/* Dumps the live schema so seeders can be checked against real columns. */
import { getDb, dialect } from "@/lib/db";

async function main() {
  const db = await getDb();
  const rows =
    dialect() === "sqlite"
      ? await db.all<{ name: string; sql: string }>(
          `SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name`,
        )
      : await db.all<{ name: string; sql: string }>(
          `SELECT table_name AS name, '' AS sql FROM information_schema.tables
           WHERE table_schema = 'public' ORDER BY table_name`,
        );
  for (const row of rows) {
    console.log(row.sql);
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);