"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils/cn";
import { clamp01, formatMoney } from "@/lib/utils/money";
import { DEFAULT_CURRENCY } from "@/lib/utils/currency";

/* ------------------------------------------------------------ Progress bar */

export function ProgressBar({
  value,
  label,
  showValue = true,
  tone = "primary",
  size = "md",
  className,
  valueFormatter,
}: {
  /** 0..1 */
  value: number;
  label?: string;
  showValue?: boolean;
  tone?: "primary" | "positive" | "accent" | "info" | "warning" | "negative";
  size?: "sm" | "md" | "lg";
  className?: string;
  valueFormatter?: (ratio: number) => string;
}) {
  const ratio = clamp01(value);
  const reduced = useReducedMotion();
  const tones = {
    primary: "bg-primary",
    positive: "bg-positive",
    accent: "bg-accent",
    info: "bg-info",
    warning: "bg-warning",
    negative: "bg-negative",
  } as const;
  const heights = { sm: "h-1.5", md: "h-2.5", lg: "h-3.5" } as const;

  return (
    <div className={cn("w-full", className)}>
      {label || showValue ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          {label ? (
            <span className="truncate text-xs font-medium text-foreground">
              {label}
            </span>
          ) : (
            <span />
          )}
          {showValue ? (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {valueFormatter
                ? valueFormatter(ratio)
                : `${(ratio * 100).toFixed(0)}%`}
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
        className={cn(
          "w-full overflow-hidden rounded-full bg-surface-3",
          heights[size],
        )}
      >
        <motion.div
          className={cn("h-full rounded-full", tones[tone])}
          initial={{ width: reduced ? `${ratio * 100}%` : 0 }}
          animate={{ width: `${ratio * 100}%` }}
          transition={
            reduced
              ? { duration: 0 }
              : { type: "spring", stiffness: 60, damping: 18, mass: 0.9 }
          }
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Progress ring */

export function ProgressRing({
  value,
  size = 120,
  thickness = 10,
  tone = "primary",
  label,
  caption,
  className,
}: {
  /** 0..1 */
  value: number;
  size?: number;
  thickness?: number;
  tone?: "primary" | "positive" | "accent" | "warning" | "negative" | "info";
  label?: string;
  caption?: string;
  className?: string;
}) {
  const ratio = clamp01(value);
  const reduced = useReducedMotion();
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const tones = {
    primary: "stroke-primary",
    positive: "stroke-positive",
    accent: "stroke-accent",
    warning: "stroke-warning",
    negative: "stroke-negative",
    info: "stroke-info",
  } as const;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label ?? "Progress"}: ${(ratio * 100).toFixed(0)} percent`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          className="stroke-surface-3"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          className={cn(tones[tone], "transition-colors")}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: reduced ? circumference * (1 - ratio) : circumference }}
          animate={{ strokeDashoffset: circumference * (1 - ratio) }}
          transition={
            reduced
              ? { duration: 0 }
              : { type: "spring", stiffness: 55, damping: 18 }
          }
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {label ? (
          <span className="text-lg font-semibold tabular-nums tracking-tight">
            {label}
          </span>
        ) : null}
        {caption ? (
          <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {caption}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- Animated number */

/**
 * Counts from the previous value to the next one whenever the number changes.
 * Formatting is delegated so callers keep full control over currency/symbols.
 */
export function AnimatedNumber({
  value,
  format,
  durationMs = 750,
  className,
}: {
  value: number;
  format?: (value: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const formatFn = format ?? ((input: number) => input.toLocaleString("en-US"));

  // `display` is state because it changes every animation frame; `fromRef` is a
  // ref because it is only ever written by the animation loop. When reduced
  // motion is on, `value` is rendered directly instead of animating.
  const [display, setDisplay] = React.useState(value);
  const fromRef = React.useRef(value);
  const frameRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (reduced) {
      fromRef.current = value;
      return;
    }

    const from = fromRef.current;
    if (from === value) return;

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (value - from) * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      fromRef.current = value;
    };
  }, [value, durationMs, reduced]);

  const shown = reduced ? value : display;

  return (
    <span className={cn("tabular-nums", className)}>
      {formatFn(shown)}
    </span>
  );
}

/** Convenience wrapper: animated currency. */
export function AnimatedMoney({
  valueCents,
  currency = DEFAULT_CURRENCY,
  signed = false,
  className,
}: {
  valueCents: number;
  currency?: string;
  signed?: boolean;
  className?: string;
}) {
  return (
    <AnimatedNumber
      value={valueCents}
      className={className}
      format={(value) => formatMoney(Math.round(value), { currency, signed })}
    />
  );
}