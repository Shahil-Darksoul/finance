import { getDb } from "@/lib/db";
import { newId } from "@/lib/utils/id";

export type OccurrenceSkipSource = "bill" | "recurring" | "payday" | "goal";

export type OccurrenceSkip = {
  id: string;
  userId: string;
  sourceType: OccurrenceSkipSource;
  sourceId: string;
  date: string;
  deletionNote: string | null;
  createdAt: string;
};

type OccurrenceSkipRow = {
  id: string;
  user_id: string;
  source_type: OccurrenceSkipSource;
  source_id: string;
  date: string;
  deletion_note: string | null;
  created_at: string;
};

function toOccurrenceSkip(row: OccurrenceSkipRow): OccurrenceSkip {
  return {
    id: row.id,
    userId: row.user_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    date: row.date,
    deletionNote: row.deletion_note,
    createdAt: row.created_at,
  };
}

/**
 * Every scheduled occurrence the user removed from their calendar.
 *
 * A skip hides one specific date of a repeating bill, subscription, payday or
 * goal contribution; the underlying rule (and every other date of it) survives.
 */
export async function listOccurrenceSkips(
  userId: string,
): Promise<OccurrenceSkip[]> {
  const db = await getDb();
  const rows = await db.all<OccurrenceSkipRow>(
    `SELECT * FROM occurrence_skips WHERE user_id = ? ORDER BY date ASC`,
    [userId],
  );
  return rows.map(toOccurrenceSkip);
}

/** Records a skip, ignoring repeat submissions for the same occurrence. */
export async function addOccurrenceSkip(
  userId: string,
  sourceType: OccurrenceSkipSource,
  sourceId: string,
  date: string,
  deletionNote: string | null = null,
): Promise<OccurrenceSkip> {
  const db = await getDb();
  const existing = await db.get<OccurrenceSkipRow>(
    `SELECT * FROM occurrence_skips
      WHERE user_id = ? AND source_type = ? AND source_id = ? AND date = ?`,
    [userId, sourceType, sourceId, date],
  );
  if (existing) return toOccurrenceSkip(existing);

  const id = newId();
  await db.run(
    `INSERT INTO occurrence_skips (id, user_id, source_type, source_id, date, deletion_note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, sourceType, sourceId, date, deletionNote, new Date().toISOString()],
  );
  return {
    id,
    userId,
    sourceType,
    sourceId,
    date,
    deletionNote,
    createdAt: new Date().toISOString(),
  };
}