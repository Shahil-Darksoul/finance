import { randomBytes } from "node:crypto";
import {
  createUser,
  getUserByEmail,
  getUserById,
  updateUser,
} from "@/lib/repo/users";
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { seedDemoData } from "@/lib/services/finance/demo";
import { resetNotifications } from "@/lib/services/finance/notifications";
import { getNotificationPrefs } from "@/lib/repo/notifications";
import type { User } from "@/lib/types";

/**
 * Account lifecycle.
 *
 * The API routes stay thin: they validate input with Zod and delegate the real
 * work here, so password hashing, session creation and demo seeding can never
 * be skipped by a new endpoint.
 */

export class AuthError extends Error {
  constructor(
    message: string,
    readonly field?: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export const DEMO_ACCOUNT = {
  name: "Demo User",
  email: "demo@ledgerly.app",
  password: "DemoPass123",
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type RegisterInput = {
  email: string;
  password: string;
  name: string;
  currency?: string;
  /** Loads the fictional dataset so the app is explorable immediately. */
  withDemoData?: boolean;
};

export async function registerUser(input: RegisterInput): Promise<User> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new AuthError("Enter a valid email address.", "email");
  }

  const strength = validatePasswordStrength(input.password);
  if (!strength.ok) {
    throw new AuthError(strength.error ?? "Choose a stronger password.", "password");
  }

  if (await getUserByEmail(email)) {
    throw new AuthError("An account with that email already exists.", "email", 409);
  }

  const user = await createUser({
    email,
    name: input.name.trim(),
    passwordHash: await hashPassword(input.password),
    currency: input.currency ?? "USD",
  });

  await getNotificationPrefs(user.id);
  await resetNotifications(user.id);

  if (input.withDemoData) {
    await seedDemoData(user.id);
  }

  return user;
}

export async function signInUser(input: {
  email: string;
  password: string;
}): Promise<{ user: User; token: string; expiresAt: Date }> {
  const email = input.email.trim().toLowerCase();
  const record = await getUserByEmail(email);

  // Always run a verification, against a real hash when the account is unknown,
  // so that a missing account and a wrong password take a similar amount of
  // time. Otherwise response latency would leak which emails are registered.
  const stored = record?.password_hash ?? (await dummyHash());
  const passwordMatches = await verifyPassword(input.password, stored);

  if (!record || !passwordMatches) {
    throw new AuthError("Email or password is incorrect.", undefined, 401);
  }

  const user = await requireUserRecord(record.id);
  const { token, expiresAt } = await createSession(user.id);
  return { user, token, expiresAt };
}

export async function ensureDemoUser(): Promise<User> {
  const existing = await getUserByEmail(DEMO_ACCOUNT.email);
  if (existing) {
    return requireUserRecord(existing.id);
  }

  const user = await createUser({
    email: DEMO_ACCOUNT.email,
    name: DEMO_ACCOUNT.name,
    passwordHash: await hashPassword(DEMO_ACCOUNT.password),
    currency: "USD",
  });

  await getNotificationPrefs(user.id);
  await resetNotifications(user.id);
  await seedDemoData(user.id);

  return user;
}

export async function updateProfile(
  userId: string,
  patch: { name?: string; currency?: string },
): Promise<User> {
  const updated = await updateUser(userId, {
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
  });
  if (!updated) throw new AuthError("Account not found.", undefined, 404);
  return updated;
}

/** Fetches the full user record or throws; keeps call sites honest. */
async function requireUserRecord(userId: string): Promise<User> {
  const user = await getUserById(userId);
  if (!user) throw new AuthError("Account not found.", undefined, 404);
  return user;
}

/**
 * Hash of a random value nobody keeps, built once per process. Verifying
 * against it costs the same as verifying a real account, which is the whole
 * point: unknown emails must not fail faster than known ones.
 */
let dummyHashPromise: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomBytes(32).toString("hex"));
  return dummyHashPromise;
}