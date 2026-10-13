import * as React from "react";
import { cn } from "@/lib/utils/cn";

/* ------------------------------------------------------------------ Card */

export function Card({
  className,
  as: Tag = "section",
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" }) {
  return <Tag className={cn("card", className)} {...props} />;
}

export function CardHeader({
  className,
  title,
  description,
  icon,
  action,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 border-b border-border px-5 py-4",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-muted"
            aria-hidden
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-t border-border px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}

/* ----------------------------------------------------------------- Badge */

const TONES = {
  neutral: "bg-surface-3 text-muted",
  primary: "bg-primary-soft text-primary",
  positive: "bg-positive-soft text-positive",
  negative: "bg-negative-soft text-negative",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-accent",
  outline: "border border-border text-muted",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  className,
  tone = "neutral",
  dot = false,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- Skeleton */

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton h-4 w-full", className)} {...props} />;
}

/* ---------------------------------------------------------------- Spinner */

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary",
        className,
      )}
    />
  );
}

/* -------------------------------------------------------------- Separator */

export function Separator({
  className,
  orientation = "horizontal",
}: {
  className?: string;
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
    />
  );
}

/* ----------------------------------------------------------- Empty state */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <span
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-3 text-muted"
          aria-hidden
        >
          {icon}
        </span>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}