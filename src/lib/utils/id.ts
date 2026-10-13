/**
 * Identifier helpers.
 *
 * `crypto.randomUUID` exists in Node 18+, modern browsers and Edge runtime, so
 * the same helper works on the server and the client.
 */

export function newId(): string {
  return crypto.randomUUID();
}

/** Short opaque token, used for session ids and password reset codes. */
export function newToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Slug used for stable React keys / DOM ids. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}