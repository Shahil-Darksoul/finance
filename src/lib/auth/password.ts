import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Password hashing with scrypt from Node's standard library.
 *
 * scrypt is memory-hard and ships with Node, so there is no native dependency
 * and no risk of shipping a weak fallback. The stored format is
 * `scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>` so parameters can be raised later
 * without invalidating existing hashes.
 */
const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, nRaw, rRaw, pRaw, saltHex, hashHex] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  let derived: Buffer;
  try {
    derived = (await scrypt(password, salt, expected.length)) as Buffer;
  } catch {
    return false;
  }
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** Password policy for signup. Kept explicit so the UI and API agree. */
export function validatePasswordStrength(password: string): {
  ok: boolean;
  error?: string;
} {
  if (password.length < 10) {
    return { ok: false, error: "Use at least 10 characters." };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { ok: false, error: "Include at least one letter." };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, error: "Include at least one number." };
  }
  return { ok: true };
}