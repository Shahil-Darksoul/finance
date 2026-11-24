import { getDb } from "@/lib/db";
import { newId } from "@/lib/utils/id";
import type { WorkEntry, WorkSettings } from "@/lib/types";

type WorkSettingsRow = {
  hourly_rate_cents: number;
  tax_percent: number;
};

type WorkEntryRow = {
  id: string;
  user_id: string;
  date: string;
  hours: number;
  created_at: string;
  updated_at: string;
};

function toWorkEntry(row: WorkEntryRow): WorkEntry {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    hours: row.hours,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getWorkSettings(userId: string): Promise<WorkSettings> {
  const db = await getDb();
  const row = await db.get<WorkSettingsRow>(
    `SELECT hourly_rate_cents, tax_percent FROM work_settings WHERE user_id = ?`,
    [userId],
  );
  return {
    hourlyRateCents: row?.hourly_rate_cents ?? 0,
    taxPercent: row?.tax_percent ?? 0,
  };
}

export async function saveWorkSettings(
  userId: string,
  input: { hourlyRateCents?: number; taxPercent?: number },
): Promise<WorkSettings> {
  const db = await getDb();
  const existing = await getWorkSettings(userId);
  const hourlyRateCents =
    input.hourlyRateCents !== undefined
      ? Math.max(0, Math.trunc(input.hourlyRateCents))
      : existing.hourlyRateCents;
  const taxPercent =
    input.taxPercent !== undefined
      ? Math.min(100, Math.max(0, input.taxPercent))
      : existing.taxPercent;
  const now = new Date().toISOString();

  const current = await db.get<{ user_id: string }>(
    `SELECT user_id FROM work_settings WHERE user_id = ?`,
    [userId],
  );
  if (current) {
    await db.run(
      `UPDATE work_settings
          SET hourly_rate_cents = ?, tax_percent = ?, updated_at = ?
        WHERE user_id = ?`,
      [hourlyRateCents, taxPercent, now, userId],
    );
  } else {
    await db.run(
      `INSERT INTO work_settings (user_id, hourly_rate_cents, tax_percent, updated_at)
       VALUES (?, ?, ?, ?)`,
      [userId, hourlyRateCents, taxPercent, now],
    );
  }
  return { hourlyRateCents, taxPercent };
}

export async function listWorkEntries(userId: string): Promise<WorkEntry[]> {
  const db = await getDb();
  const rows = await db.all<WorkEntryRow>(
    `SELECT * FROM work_entries WHERE user_id = ? ORDER BY date DESC`,
    [userId],
  );
  return rows.map(toWorkEntry);
}

export async function getWorkEntry(
  userId: string,
  id: string,
): Promise<WorkEntry | null> {
  const db = await getDb();
  const row = await db.get<WorkEntryRow>(
    `SELECT * FROM work_entries WHERE user_id = ? AND id = ?`,
    [userId, id],
  );
  return row ? toWorkEntry(row) : null;
}

export async function upsertWorkEntry(
  userId: string,
  date: string,
  hours: number,
): Promise<WorkEntry> {
  const db = await getDb();
  const now = new Date().toISOString();
  const existing = await db.get<WorkEntryRow>(
    `SELECT * FROM work_entries WHERE user_id = ? AND date = ?`,
    [userId, date],
  );
  if (existing) {
    await db.run(
      `UPDATE work_entries SET hours = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      [hours, now, existing.id, userId],
    );
    const updated = await getWorkEntry(userId, existing.id);
    if (!updated) throw new Error("Work entry could not be updated");
    return updated;
  }
  const id = newId();
  await db.run(
    `INSERT INTO work_entries (id, user_id, date, hours, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, date, hours, now, now],
  );
  const created = await getWorkEntry(userId, id);
  if (!created) throw new Error("Work entry could not be created");
  return created;
}

export async function updateWorkEntry(
  userId: string,
  id: string,
  hours: number,
): Promise<WorkEntry | null> {
  const db = await getDb();
  const result = await db.run(
    `UPDATE work_entries SET hours = ?, updated_at = ? WHERE user_id = ? AND id = ?`,
    [hours, new Date().toISOString(), userId, id],
  );
  if (result.changes === 0) return null;
  return getWorkEntry(userId, id);
}

export async function deleteWorkEntry(
  userId: string,
  id: string,
): Promise<boolean> {
  const db = await getDb();
  const result = await db.run(
    `DELETE FROM work_entries WHERE user_id = ? AND id = ?`,
    [userId, id],
  );
  return result.changes > 0;
}