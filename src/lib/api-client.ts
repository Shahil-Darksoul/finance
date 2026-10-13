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

/** Client-side helper used by every form and fetch call. */
export async function apiFetch<T>(
  input: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (json !== undefined) {
    headers.set("content-type", "application/json");
  }
  headers.set("accept", "application/json");

  let response: Response;
  try {
    response = await fetch(input, {
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      cache: "no-store",
    });
  } catch {
    throw new ApiClientError(
      "We couldn't reach the server. Check your connection and try again.",
      0,
      "network_error",
    );
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