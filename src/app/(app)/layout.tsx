import { requireUser } from "@/lib/auth/guard";
import { countUnread, listNotifications } from "@/lib/repo/notifications";
import { generateNotifications } from "@/lib/services/finance/notifications";
import { DEFAULT_CURRENCY } from "@/lib/utils/currency";
import { AppShell } from "@/components/app/app-shell";
import type { NotificationRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();

  // Deriving notifications is a side effect, so it runs before the reads and
  // must never blank the shell. Generating here (rather than per page) keeps
  // the bell current wherever the user lands.
  const [generated] = await Promise.allSettled([
    generateNotifications(user.id, DEFAULT_CURRENCY),
  ]);
  if (generated.status === "rejected") {
    console.error("[app-shell] notification generation failed", generated.reason);
  }

  let notifications: NotificationRow[] = [];
  let unread = 0;
  try {
    [notifications, unread] = await Promise.all([
      listNotifications(user.id, 8),
      countUnread(user.id),
    ]);
  } catch (error) {
    console.error("[app-shell] notifications read failed", error);
  }

  return (
    <AppShell
      user={{ name: user.name, email: user.email, isDemo: user.isDemo }}
      notifications={notifications}
      unreadNotifications={unread}
    >
      {children}
    </AppShell>
  );
}
