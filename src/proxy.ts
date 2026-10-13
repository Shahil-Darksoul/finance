import { NextResponse, type NextRequest } from "next/server";

/**
 * Fast-path route protection.
 *
 * Next 16 renamed the `middleware` convention to `proxy`. This only checks that
 * a session cookie is *present* so signed-out visitors are redirected before any
 * page renders. The cookie is an opaque random token, so it cannot be verified
 * here — every authenticated page re-validates the session against the database
 * in its server layout (`requireUser`), which is the authoritative check.
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/transactions",
  "/accounts",
  "/bills",
  "/calendar",
  "/investments",
  "/goals",
  "/analytics",
  "/forecast",
  "/settings",
  "/onboarding",
];

const AUTH_ROUTES = ["/login", "/signup", "/forgot-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get("finance_session")?.value);

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  if (AUTH_ROUTES.includes(pathname) && hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};