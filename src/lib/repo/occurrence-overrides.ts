import { getDb } from "@/lib/db";
import { newId } from "@/lib/utils/id";

export type OccurrenceOverride = {
  id: string;
  userId: string;
  sourceType: string;
  sourceId: string;
  date: string;
  amountCents: number;
  updatedAt: string;
};

type OccurrenceOverrideRow = {
  id: string;
  user_id: string;
  source_type: string;
  source_id: string;
  date: string;
  amount_cents: number;
  updated_at: string;
};

function toOverride(row: OccurrenceOverrideRow): OccurrenceOverride {
  return {
    id: row.id,
    userId: row.user_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    date: row.date,
    amountCents: row.amount_cents,
    updatedAt: row.updated_at,
  };
}

/** Every per-date amount override, so schedules can be adjusted for a single day. */
export async function listOccurrenceOverrides(userId: string): Promise<OccurrenceOverride[]> {
  const db = await getDb();
  const rows = await db.all<OccurrenceOverrideRow>(
    `SELECT * FROM occurrence_overrides WHERE user_id = ?
      ORDER BY date ASC`,
    [userId],
  );
  return rows.map(toOverride);
}

export async function getOccurrenceOverride(
  userId: string,
  sourceType: string,
  sourceId: string,
  date: string,
): Promise<OccurrenceOverride | null> {
  const db = await getDb();
  const row = await db.get<OccurrenceOverrideRow>(
    `SELECT * FROM occurrence_overrides
      WHERE user_id = ? AND source_type = ? AND source_id = ? AND date = ?`,
    [userId, sourceType, sourceId, date],
  );
  return row ? toOverride(row) : null;
}

/** Upserts the amount for one date. A repeating item keeps its default elsewhere. */
export async function setOccurrenceOverride(
  userId: string,
  sourceType: string,
  sourceId: string,
  date: string,
  amountCents: number,
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  const existing = await getOccurrenceOverride(userId, sourceType, sourceId, date);
  if (existing) {
    await db.run(
      `UPDATE occurrence_overrides
         SET amount_cents = ?, updated_at = ?
       WHERE user_id = ? AND source_type = ? AND source_id = ? AND date = ?`,
      [Math.abs(Math.trunc(amountCents)), now, userId, sourceType, sourceId, date],
    );
    return;
  }
  await db.run(
    `INSERT INTO occurrence_overrides (
        id, user_id, source_type, source_id, date, amount_cents, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      userId,
      sourceType,
      sourceId,
      date,
      Math.abs(Math.trunc(amountCents)),
      now,
      now,
    ],
  );
}

export async function deleteOccurrenceOverride(
  userId: string,
  sourceType: string,
  sourceId: string,
  date: string,
): Promise<boolean> {
  const db = await getDb();
  const result = await db.run(
    `DELETE FROM occurrence_overrides
      WHERE user_id = ? AND source_type = ? AND source_id = ? AND date = ?`,
    [userId, sourceType, sourceId, date],
  );
  return result.changes > 0;
}