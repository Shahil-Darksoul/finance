import { getDb } from "@/lib/db";
import { newId } from "@/lib/utils/id";
import { DEFAULT_CATEGORIES, type User } from "@/lib/types";
import { DEFAULT_CURRENCY } from "@/lib/utils/currency";
import { type UserRow, toUser } from "@/lib/repo/mappers";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  name: string;
  currency?: string;
  isDemo?: boolean;
}): Promise<User> {
  const db = await getDb();
  const id = newId();
  const now = new Date().toISOString();
  const email = normalizeEmail(input.email);

  await db.tx(async (tx) => {
    await tx.run(
      `INSERT INTO users (
          id, email, password_hash, name, currency, is_demo,
          onboarding_step, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        email,
        input.passwordHash,
        input.name.trim() || email.split("@")[0],
        input.currency ?? DEFAULT_CURRENCY,
        input.isDemo ? 1 : 0,
        now,
        now,
      ],
    );

    // Every user gets their own copy of the default categories so custom
    // categories never leak between accounts.
    for (const [index, category] of DEFAULT_CATEGORIES.entries()) {
      await tx.run(
        `INSERT INTO categories (
            id, user_id, name, kind, color, icon, is_system, sort_order, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          newId(),
          id,
          category.name,
          category.kind,
          category.color,
          category.icon,
          index,
          now,
        ],
      );
    }
  });

  const created = await getUserById(id);
  if (!created) throw new Error("User could not be created");
  return created;
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const db = await getDb();
  const row = await db.get<UserRow>(`SELECT * FROM users WHERE email = ?`, [
    normalizeEmail(email),
  ]);
  return row ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const db = await getDb();
  const row = await db.get<UserRow>(`SELECT * FROM users WHERE id = ?`, [id]);
  return row ? toUser(row) : null;
}

export async function updateUser(
  userId: string,
  input: Partial<{ name: string; currency: string; onboardingStep: number }>,
): Promise<User | null> {
  const db = await getDb();
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (input.name !== undefined) {
    sets.push("name = ?");
    params.push(input.name);
  }
  if (input.currency !== undefined) {
    sets.push("currency = ?");
    params.push(input.currency);
  }
  if (input.onboardingStep !== undefined) {
    sets.push("onboarding_step = ?");
    params.push(Math.max(0, Math.trunc(input.onboardingStep)));
  }
  if (sets.length === 0) return getUserById(userId);
  sets.push("updated_at = ?");
  params.push(new Date().toISOString(), userId);
  await db.run(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, params);
  return getUserById(userId);
}

export async function setDemoFlag(
  userId: string,
  isDemo: boolean,
): Promise<void> {
  const db = await getDb();
  await db.run(`UPDATE users SET is_demo = ? WHERE id = ?`, [
    isDemo ? 1 : 0,
    userId,
  ]);
}

export async function deleteUser(userId: string): Promise<void> {
  const db = await getDb();
  await db.run(`DELETE FROM users WHERE id = ?`, [userId]);
}