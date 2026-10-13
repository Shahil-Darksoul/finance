"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  CalendarDays,
  Target,
  Receipt,
  TrendingUp,
  ChartPie,
  LineChart,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { ThemeToggle } from "./theme-toggle";
import { BrandMark } from "./brand-mark";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils/cn";

/**
 * Primary navigation, grouped the way people actually look for things:
 * "what is happening" (dashboard, transactions, calendar), "what I own"
 * (accounts, goals, investments) and "what I owe" (bills), with tools after.
 */
const NAV_GROUPS: {
  label: string;
  items: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[];
}[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/analytics", label: "Analytics", icon: ChartPie },
      { href: "/forecast", label: "Forecast", icon: LineChart },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
      { href: "/accounts", label: "Accounts", icon: Wallet },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Planning",
    items: [
      { href: "/goals", label: "Savings goals", icon: Target },
      { href: "/bills", label: "Bills & EMIs", icon: Receipt },
      { href: "/investments", label: "Investments", icon: TrendingUp },
    ],
  },
];

const SETTINGS_ITEM = { href: "/settings", label: "Settings", icon: Settings };

export function AppShell({
  user,
  unreadNotifications,
  children,
}: {
  user: { name: string; email: string; isDemo: boolean };
  unreadNotifications: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  // The drawer is tied to the route it was opened on, so navigating anywhere
  // closes it automatically. Deriving `open` this way avoids an effect that
  // fires setState on every navigation.
  const [openedOn, setOpenedOn] = React.useState<string | null>(null);
  const open = openedOn === pathname;
  const closeDrawer = () => setOpenedOn(null);

  async function signOut() {
    setSigningOut(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex min-h-dvh bg-background">
      {/* ------------------------------------------------------- sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-surface transition-transform duration-200 lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <Link
            href="/dashboard"
            onClick={closeDrawer}
            className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-primary"
          >
            <BrandMark className="h-7 w-7" />
            <span className="text-sm font-semibold tracking-tight">Ledgerly</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={closeDrawer}
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={closeDrawer}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                          active
                            ? "bg-primary-soft font-medium text-primary"
                            : "text-muted-foreground hover:bg-surface-3 hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div>
            <ul className="space-y-0.5">
              <li>
                <Link
                  href={SETTINGS_ITEM.href}
                  onClick={closeDrawer}
                  aria-current={
                    pathname === SETTINGS_ITEM.href ? "page" : undefined
                  }
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                    pathname === SETTINGS_ITEM.href
                      ? "bg-primary-soft font-medium text-primary"
                      : "text-muted-foreground hover:bg-surface-3 hover:text-foreground",
                  )}
                >
                  <Settings className="h-4 w-4 shrink-0" aria-hidden />
                  {SETTINGS_ITEM.label}
                </Link>
              </li>
            </ul>
          </div>
        </nav>

        {user.isDemo ? (
          <div className="border-t border-border px-4 py-3">
            <Badge tone="warning" dot>
              Demo data
            </Badge>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              These figures are fictional and exist only to show how Ledgerly
              works.
            </p>
          </div>
        ) : null}

        <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">
              {user.name}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {user.email}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            disabled={signingOut}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[1px] lg:hidden"
          onClick={closeDrawer}
          aria-label="Close navigation"
        />
      ) : null}

      {/* --------------------------------------------------------- main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur-md">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpenedOn(pathname)}
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" aria-hidden />
          </Button>

          <h1 className="truncate text-sm font-semibold tracking-tight">
            {pageTitle(pathname)}
          </h1>

          {/* Theme lives in the header only: the sidebar footer has no room for
              it on a 320px viewport, and two toggles would desync. */}
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/settings?tab=notifications")}
              aria-label={
                unreadNotifications > 0
                  ? `Notifications, ${unreadNotifications} unread`
                  : "Notifications"
              }
              className="relative"
            >
              <Bell className="h-4 w-4" aria-hidden />
              {unreadNotifications > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </span>
              ) : null}
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[80rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}

function pageTitle(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        return item.label;
      }
    }
  }
  if (pathname.startsWith(SETTINGS_ITEM.href)) return SETTINGS_ITEM.label;
  if (pathname.startsWith("/onboarding")) return "Getting started";
  return "Ledgerly";
}