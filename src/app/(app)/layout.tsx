import { requireUser } from "@/lib/auth/guard";
import { countUnread } from "@/lib/repo/notifications";
import { AppShell } from "@/components/app/app-shell";

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

  return (
    <AppShell
      user={{ name: user.name, email: user.email, isDemo: user.isDemo }}
      unreadNotifications={unread}
    >
      {children}
    </AppShell>
  );
}