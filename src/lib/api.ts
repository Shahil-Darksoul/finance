import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getApiUser } from "@/lib/auth/session";
import type { ApiFailure, ApiSuccess } from "@/lib/api-client";
import type { User } from "@/lib/types";

// Re-exported so route handlers can import their response types from one place.
export type { ApiFailure, ApiSuccess };

/**
 * Server-side API helpers.
 *
 * Route handlers use `route`/`publicRoute` to get same-origin checking, session
 * resolution and error mapping in one call. Client components must import
 * `apiFetch` from `@/lib/api-client` instead, since this module reaches the
 * database and must never end up in a browser bundle.
 */

/**
 * Friendly, non-leaking error type.
 *
 * Raw driver/API errors are logged server-side and replaced with a generic
 * message so database details and stack traces never reach the browser.
 */
export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(
    message: string,
    status = 400,
    code = "bad_request",
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  static unauthorized(message = "Please sign in to continue."): ApiError {
    return new ApiError(message, 401, "unauthorized");
  }

  static forbidden(message = "You do not have access to that."): ApiError {
    return new ApiError(message, 403, "forbidden");
  }

  static notFound(message = "We couldn't find that."): ApiError {
    return new ApiError(message, 404, "not_found");
  }

  static conflict(message: string): ApiError {
    return new ApiError(message, 409, "conflict");
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json<ApiSuccess<T>>({ ok: true, data }, { status });
}

export function fail(error: ApiError) {
  return NextResponse.json<ApiFailure>(
    {
      ok: false,
      error: {
        message: error.message,
        code: error.code,
        ...(error.fields ? { fields: error.fields } : {}),
      },
    },
    { status: error.status },
  );
}

/**
 * Blocks cross-site form submissions.
 *
 * SameSite=Lax already protects most cases; this Origin check additionally
 * rejects requests that arrive with a foreign Origin, which matters for
 * browsers that treat Lax + POST as cross-site.
 */
export function assertSameOrigin(request: Request): void {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  const origin = request.headers.get("origin");
  if (!origin) return; // same-origin navigations may omit it

  const host = request.headers.get("host");
  if (!host) return;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError("Request rejected.", 403, "bad_origin");
  }

  if (originHost !== host) {
    throw new ApiError("Request rejected.", 403, "bad_origin");
  }
}

/** Parse a JSON body with a zod schema, surfacing readable field errors. */
export async function parseBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError("We couldn't read that request.", 400, "bad_json");
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw validationError(result.error);
  }
  return result.data;
}

export function validationError(error: ZodError): ApiError {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "form";
    if (!fields[key]) fields[key] = issue.message;
  }
  return new ApiError("Please check the highlighted fields.", 422, "validation", fields);
}

/** Parse a JSON body and validate it, without requiring a session. */
export async function parsePublicBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  return parseBody(request, schema);
}

/**
 * Wraps a route handler: enforces same-origin, resolves the session user and
 * converts any thrown error into a safe JSON response.
 */
export function route(
  handler: (request: Request, user: User, context: never) => Promise<Response>,
) {
  return async (request: Request, context?: unknown): Promise<Response> => {
    try {
      assertSameOrigin(request);
      const user = await getApiUser();
      return await handler(request, user, context as never);
    } catch (error) {
      return handleError(error);
    }
  };
}

/** Same as `route` but for endpoints that do not require a session. */
export function publicRoute(
  handler: (request: Request, context: never) => Promise<Response>,
) {
  return async (request: Request, context?: unknown): Promise<Response> => {
    try {
      assertSameOrigin(request);
      return await handler(request, context as never);
    } catch (error) {
      return handleError(error);
    }
  };
}

function handleError(error: unknown): Response {
  if (error instanceof ApiError) {
    return fail(error);
  }

  if (error instanceof ZodError) {
    return fail(validationError(error));
  }

  // Log server-side with context; return an opaque message to the client.
  console.error("[api] unhandled error", error);
  return fail(
    new ApiError(
      "Something went wrong on our side. Please try again.",
      500,
      "server_error",
    ),
  );
}
