/**
 * Browser-safe half of the API layer.
 *
 * This module is imported by client components, so it must not pull in anything
 * server-only. Keeping `apiFetch` here means a client bundle never transitively
 * imports the database driver, the session reader or `next/server`.
 */

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  error: { message: string; code: string; fields?: Record<string, string> };
};

/** Standard error shape for parsing errors inside the client fetch wrapper. */
export class ApiClientError extends Error {
  status: number;
  code: string;
  fields: Record<string, string>;

  constructor(
    message: string,
    status: number,
    code: string,
    fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/**
 * How long a request may take before it is abandoned.
 *
 * Without a ceiling a stalled server leaves the caller's submit button
 * spinning forever, with no way for the user to tell whether the save worked.
 */
export const DEFAULT_TIMEOUT_MS = 20_000;

/** Client-side helper used by every form and fetch call. */
export async function apiFetch<T>(
  input: string,
  init: RequestInit & { json?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const { json, timeoutMs, signal: callerSignal, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (json !== undefined) {
    headers.set("content-type", "application/json");
  }
  headers.set("accept", "application/json");

  // The abort controller is wired up by hand rather than with
  // `AbortSignal.timeout`, so the same code path works in every browser and
  // lets a caller-supplied signal cancel the request early.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(input, {
      ...rest,
      signal: controller.signal,
      headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      cache: "no-store",
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ApiClientError(
        "That took longer than expected and was stopped. Check your connection and try again.",
        0,
        "timeout",
      );
    }
    throw new ApiClientError(
      "We couldn't reach the server. Check your connection and try again.",
      0,
      "network_error",
    );
  } finally {
    clearTimeout(timeout);
  }

  let payload: ApiSuccess<T> | ApiFailure | null = null;
  try {
    payload = (await response.json()) as ApiSuccess<T> | ApiFailure;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || payload.ok !== true) {
    const error = payload && payload.ok === false ? payload.error : null;
    throw new ApiClientError(
      error?.message ?? "Something went wrong. Please try again.",
      response.status,
      error?.code ?? "unknown_error",
      error?.fields ?? {},
    );
  }

  return payload.data;
}