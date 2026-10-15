import { requireUser } from "@/lib/auth/guard";
import { countUnread } from "@/lib/repo/notifications";
import { AppShell } from "@/components/app/app-shell";
import { resolveDisplay, toDisplayView } from "@/lib/services/finance/currency";

export const dynamic = "force-dynamic";

/**
 * Authenticated layout.
 *
 * `requireUser` re-validates the session against the database on every request.
 * The proxy only checks that a cookie is *present*, so this is the authoritative
 * gate — a stale or forged cookie gets no user here.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();

  // Counting is cheap and read-only, so it must never take the app down with it.
  let unread = 0;
  try {
    unread = await countUnread(user.id);
  } catch (error) {
    console.error("[app-shell] unread count failed", error);
  }

  // Resolved once per request so the header's currency switcher is available on
  // every page, not just the dashboard.
  const display = toDisplayView(await resolveDisplay(user.currency, user.id));

  return (
    <AppShell
      user={{ name: user.name, email: user.email, isDemo: user.isDemo }}
      unreadNotifications={unread}
      display={display}
    >
      {children}
    </AppShell>
  );
}