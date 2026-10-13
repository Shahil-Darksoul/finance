import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Small labelled statistic used across the dashboard, analytics and forecast.
 *
 * `basis` exists so a derived number is never presented as a stored fact. The
 * app is explicit that health scores, projections and forecasts are calculations
 * made from the user's own records, not advice.
 */
export type StatTileProps = {
  label: string;
  value: React.ReactNode;
  /** Small line under the value: what it is, or how it changed. */
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "neutral" | "primary" | "positive" | "negative" | "warning" | "info" | "accent";
  /** Renders a top accent line instead of an icon badge. */
  emphasis?: boolean;
  footer?: React.ReactNode;
  className?: string;
};

const TONE_TEXT: Record<NonNullable<StatTileProps["tone"]>, string> = {
  neutral: "text-foreground",
  primary: "text-primary",
  positive: "text-positive",
  negative: "text-negative",
  warning: "text-warning",
  info: "text-info",
  accent: "text-accent",
};

const TONE_RING: Record<NonNullable<StatTileProps["tone"]>, string> = {
  neutral: "bg-border",
  primary: "bg-primary",
  positive: "bg-positive",
  negative: "bg-negative",
  warning: "bg-warning",
  info: "bg-info",
  accent: "bg-accent",
};

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  emphasis = false,
  footer,
  className,
}: StatTileProps) {
  return (
    <div
      className={cn(
        "card relative overflow-hidden px-4 py-3.5",
        emphasis && "pt-4",
        className,
      )}
    >
      {emphasis ? (
        <span
          className={cn(
            "absolute inset-x-0 top-0 h-0.5",
            TONE_RING[tone],
          )}
          aria-hidden
        />
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground">
          {label}
        </p>
        {icon ? (
          <span
            className={cn("shrink-0 text-muted-foreground/70", TONE_TEXT[tone])}
            aria-hidden
          >
            {icon}
          </span>
        ) : null}
      </div>

      <p
        className={cn(
          "mt-1.5 text-xl font-semibold tracking-tight tabular-nums",
          TONE_TEXT[tone],
        )}
      >
        {value}
      </p>

      {hint ? (
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
}

/**
 * Delta chip for "up vs last month" comparisons.
 *
 * Colour alone never carries the meaning: the arrow and the signed number do,
 * and the accessible label spells out the direction.
 */
export function TrendChip({
  ratio,
  direction,
  hasBaseline,
  inverted = false,
  label = "vs last month",
}: {
  ratio: number;
  direction: "up" | "down" | "flat";
  hasBaseline: boolean;
  /** Set when a rise is bad (expenses, debt), so the colours flip. */
  inverted?: boolean;
  label?: string;
}) {
  if (!hasBaseline || direction === "flat") {
    return (
      <span className="text-[11px] text-muted-foreground/70">No change to compare</span>
    );
  }

  const good = inverted ? direction === "down" : direction === "up";
  const tone = good
    ? "bg-positive-soft text-positive"
    : "bg-negative-soft text-negative";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
        tone,
      )}
    >
      <span aria-hidden>{direction === "up" ? "↑" : "↓"}</span>
      {Math.abs(ratio * 100).toFixed(0)}%
      <span className="sr-only">
        {` ${direction === "up" ? "up" : "down"} ${label}`}
      </span>
    </span>
  );
}

/** Inline "calculated from your data" note. */
export function BasisNote({
  basis,
  className,
}: {
  basis: "fact" | "calculation" | "estimate" | "forecast";
  className?: string;
}) {
  const text = {
    fact: "From your records",
    calculation: "Calculated from your records",
    estimate: "Estimate",
    forecast: "Forecast, not a prediction",
  }[basis];

  return (
    <p className={cn("text-[10px] text-muted-foreground/60", className)}>{text}</p>
  );
}