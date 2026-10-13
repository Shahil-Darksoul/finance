import { getDb, placeholders } from "@/lib/db";
import { newId } from "@/lib/utils/id";
import type { Category } from "@/lib/types";
import { type CategoryRow, toCategory } from "./mappers";

export async function listCategories(
  userId: string,
  kind?: "expense" | "income",
): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.all<CategoryRow>(
    `SELECT * FROM categories
      WHERE user_id = ?
        ${kind ? "AND kind = ?" : ""}
      ORDER BY kind ASC, sort_order ASC, name ASC`,
    kind ? [userId, kind] : [userId],
  );
  return rows.map(toCategory);
}

export async function findCategoryByName(
  userId: string,
  name: string,
  kind: "expense" | "income",
): Promise<Category | null> {
  const db = await getDb();
  const row = await db.get<CategoryRow>(
    `SELECT * FROM categories WHERE user_id = ? AND name = ? AND kind = ?`,
    [userId, name, kind],
  );
  return row ? toCategory(row) : null;
}

export async function createCategory(input: {
  userId: string;
  name: string;
  kind: "expense" | "income";
  color?: string | null;
  icon?: string | null;
  isSystem?: boolean;
}): Promise<Category> {
  const db = await getDb();
  const id = newId();
  const maxRow = await db.get<{ next: number }>(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM categories WHERE user_id = ?`,
    [input.userId],
  );
  await db.run(
    `INSERT INTO categories (id, user_id, name, kind, color, icon, is_system, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.userId,
      input.name,
      input.kind,
      input.color ?? null,
      input.icon ?? null,
      input.isSystem ? 1 : 0,
      maxRow?.next ?? 0,
      new Date().toISOString(),
    ],
  );
  const created = await db.get<CategoryRow>(
    `SELECT * FROM categories WHERE id = ?`,
    [id],
  );
  if (!created) throw new Error("Category could not be created");
  return toCategory(created);
}

export async function updateCategory(
  userId: string,
  categoryId: string,
  input: { name?: string; color?: string | null; icon?: string | null },
): Promise<Category | null> {
  const db = await getDb();
  const sets: string[] = [];
  const params: (string | null)[] = [];
  if (input.name !== undefined) {
    sets.push("name = ?");
    params.push(input.name);
  }
  if (input.color !== undefined) {
    sets.push("color = ?");
    params.push(input.color);
  }
  if (input.icon !== undefined) {
    sets.push("icon = ?");
    params.push(input.icon);
  }
  if (sets.length === 0) return null;
  params.push(userId, categoryId);
  const result = await db.run(
    `UPDATE categories SET ${sets.join(", ")} WHERE user_id = ? AND id = ?`,
    params,
  );
  if (result.changes === 0) return null;
  const row = await db.get<CategoryRow>(`SELECT * FROM categories WHERE id = ?`, [
    categoryId,
  ]);
  return row ? toCategory(row) : null;
}

export async function deleteCategory(
  userId: string,
  categoryId: string,
): Promise<boolean> {
  const db = await getDb();
  const result = await db.run(
    `DELETE FROM categories WHERE user_id = ? AND id = ?`,
    [userId, categoryId],
  );
  return result.changes > 0;
}

export async function categoryCounts(
  userId: string,
): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.all<{ category_id: string; cnt: number }>(
    `SELECT category_id, COUNT(*) AS cnt
       FROM transactions
      WHERE user_id = ? AND category_id IS NOT NULL
      GROUP BY category_id`,
    [userId],
  );
  return new Map(rows.map((row) => [row.category_id, Number(row.cnt)]));
}

export { placeholders };