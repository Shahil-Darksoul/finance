"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkAllReadButton } from "./mark-all-read-button";
import { formatRelative } from "./notification-list";
import { cn } from "@/lib/utils/cn";
import type { NotificationRow } from "@/lib/types";

const SEVERITY_DOT = {
  info: "bg-info",
  success: "bg-positive",
  warning: "bg-warning",
  danger: "bg-negative",
} as const;

const MAX_ITEMS = 8;

/**
 * Header bell with a dropdown of the latest alerts — bills and EMIs due soon,
 * paydays, low balances, goal milestones. Full history lives under
 * Settings → Notifications, which the panel links to.
 */
export function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: NotificationRow[];
  unreadCount: number;
}) {
  const pathname = usePathname();
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Tied to the route it was opened on, so navigating anywhere closes the
  // popover automatically — no effect that fires setState per navigation.
  const [openedOn, setOpenedOn] = React.useState<string | null>(null);
  const open = openedOn === pathname;
  const toggle = () => setOpenedOn(open ? null : pathname);

  // Close on Escape and on clicks outside the popover.
  React.useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenedOn(null);
    }
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpenedOn(null);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const items = notifications.slice(0, MAX_ITEMS);
  const unread = notifications.filter((item) => !item.readAt).length;

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggle}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unreadCount > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute top-full right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 ? <MarkAllReadButton count={unread} /> : null}
          </div>

          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nothing to flag — bills, paydays and goal milestones will show
              up here.
            </p>
          ) : (
            <ul className="max-h-[24rem] divide-y divide-border overflow-y-auto p-1">
              {items.map((item) => {
                const body = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={cn(
                          "text-xs leading-snug",
                          item.readAt
                            ? "font-normal text-muted-foreground"
                            : "font-medium text-foreground",
                        )}
                      >
                        {item.title}
                      </p>
                      <span
                        className={cn(
                          "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                          item.readAt ? "bg-border" : SEVERITY_DOT[item.severity],
                        )}
                        aria-hidden
                      />
                    </div>
                    {item.body ? (
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        {item.body}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[10px] text-muted-foreground/60">
                      {formatRelative(item.createdAt)}
                    </p>
                  </>
                );
                const className =
                  "block rounded-lg px-2 py-2 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary";

                return (
                  <li key={item.id}>
                    {item.link ? (
                      <Link
                        href={item.link}
                        onClick={() => setOpenedOn(null)}
                        className={className}
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className={className}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="border-t border-border p-1">
            <Link
              href="/settings?tab=notifications"
              onClick={() => setOpenedOn(null)}
              className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-primary transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              View all notifications
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
