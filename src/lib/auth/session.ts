import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { newToken } from "@/lib/utils/id";
import type { User } from "@/lib/types";
import { type UserRow, toUser } from "@/lib/repo/mappers";

export const SESSION_COOKIE = "finance_session";
const SESSION_TTL_DAYS = 30;

/**
 * Only a SHA-256 digest of the session token is stored, so a database leak
 * cannot be replayed as a login. The raw token lives in an httpOnly cookie
 * and is never readable from JavaScript.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type SessionInfo = {
  id: string;
  userId: string;
  expiresAt: string;
};

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const db = await getDb();
  const token = newToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO sessions (id, user_id, expires_at, created_at, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
    [
      hashToken(token),
      userId,
      expiresAt.toISOString(),
      now,
      meta.userAgent?.slice(0, 250) ?? null,
    ],
  );

  return { token, expiresAt };
}

export async function resolveSession(
  token: string | undefined,
): Promise<SessionInfo | null> {
  if (!token) return null;
  const db = await getDb();
  const row = await db.get<{
    id: string;
    user_id: string;
    expires_at: string;
  }>(
    `SELECT id, user_id, expires_at FROM sessions WHERE id = ?`,
    [hashToken(token)],
  );
  if (!row) return null;

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await db.run(`DELETE FROM sessions WHERE id = ?`, [row.id]);
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: row.expires_at,
  };
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  const db = await getDb();
  await db.run(`DELETE FROM sessions WHERE id = ?`, [hashToken(token)]);
}

/** Removes every session for a user (used after a password change/reset). */
export async function destroyAllSessions(userId: string): Promise<void> {
  const db = await getDb();
  await db.run(`DELETE FROM sessions WHERE user_id = ?`, [userId]);
}

export async function purgeExpiredSessions(): Promise<void> {
  const db = await getDb();
  await db.run(`DELETE FROM sessions WHERE expires_at < ?`, [
    new Date().toISOString(),
  ]);
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  };
}

/**
 * Reads the session cookie and returns the signed-in user.
 * Returns null for signed-out visitors; it never throws.
 */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const session = await resolveSession(token);
  if (!session) return null;

  const db = await getDb();
  const row = await db.get<UserRow>(`SELECT * FROM users WHERE id = ?`, [
    session.userId,
  ]);
  return row ? toUser(row) : null;
}

/** Same as getCurrentUser but throws a typed error for API routes. */
export async function getApiUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    const error = new Error("Not authenticated") as Error & { status?: number };
    error.status = 401;
    throw error;
  }
  return user;
}