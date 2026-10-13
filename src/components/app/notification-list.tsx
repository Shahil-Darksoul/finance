import Link from "next/link";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { BellRing, CheckCheck } from "lucide-react";
import { MarkAllReadButton } from "./mark-all-read-button";
import type { NotificationRow } from "@/lib/types";

const SEVERITY_TONE = {
  info: "info",
  success: "positive",
  warning: "warning",
  danger: "negative",
} as const;

/**
 * Notification feed.
 *
 * Rendered on the server from stored rows; marking read is a client mutation so
 * the list does not need to be a client component.
 */
export function NotificationList({
  notifications,
}: {
  notifications: NotificationRow[];
}) {
  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={<BellRing className="h-6 w-6" />}
        title="Nothing to flag"
        description="Bills, paydays, milestones and unusual spending will appear here as they happen."
      />
    );
  }

  const unread = notifications.filter((item) => !item.readAt).length;

  return (
    <>
      {unread > 0 ? (
        <div className="flex justify-end pb-1">
          <MarkAllReadButton count={unread} />
        </div>
      ) : null}

      <ul className="divide-y divide-border">
        {notifications.map((item) => {
          const body = (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium leading-snug text-foreground">
                  {item.title}
                </p>
                <Badge tone={SEVERITY_TONE[item.severity]}>
                  {item.readAt ? "Read" : "New"}
                </Badge>
              </div>
              {item.body ? (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              ) : null}
              <p className="mt-1.5 text-[10px] text-muted-foreground/60">
                {formatRelative(item.createdAt)}
              </p>
            </>
          );

          const className =
            "block rounded-lg px-2 py-3 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary";

          return (
            <li key={item.id}>
              {item.link ? (
                <Link href={item.link} className={className}>
                  {body}
                </Link>
              ) : (
                <div className={className}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
        <CheckCheck className="h-3 w-3" aria-hidden />
        Generated from your own records, not from external services.
      </p>
    </>
  );
}

/** "just now" / "3h ago" / "2d ago" — falls back to a date past a week. */
function formatRelative(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const seconds = Math.round((Date.now() - then.getTime()) / 1000);
  if (seconds < 60) return "Just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Re-exported so the settings page can reuse the card framing. */
export function NotificationsCard({
  notifications,
}: {
  notifications: NotificationRow[];
}) {
  return (
    <Card>
      <CardHeader
        title="Notifications"
        description="Derived from your transactions, bills and paydays."
      />
      <CardBody>
        <NotificationList notifications={notifications} />
      </CardBody>
    </Card>
  );
}