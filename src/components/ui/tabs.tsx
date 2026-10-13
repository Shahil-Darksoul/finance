"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils/cn";

export type TabItem<T extends string = string> = {
  value: T;
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
};

/**
 * Accessible tabs following the WAI-ARIA tabs pattern with roving focus.
 */
export function Tabs<T extends string>({
  items,
  value,
  onValueChange,
  className,
  size = "md",
  "aria-label": ariaLabel = "Tabs",
}: {
  items: TabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
  "aria-label"?: string;
}) {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = items.findIndex((item) => item.value === value);
    if (index < 0) return;

    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % items.length;
    if (event.key === "ArrowLeft")
      nextIndex = (index - 1 + items.length) % items.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;

    if (nextIndex === null) return;
    event.preventDefault();
    const next = items[nextIndex];
    onValueChange(next.value);
    refs.current[next.value]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-surface-2 p-1",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            ref={(element) => {
              refs.current[item.value] = element;
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-1.5 rounded-lg font-medium transition-colors duration-150",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId={`tab-bg-${ariaLabel}`}
                className="absolute inset-0 rounded-lg bg-surface shadow-sm ring-1 ring-border"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {item.icon}
              {item.label}
              {item.badge}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Segmented control for ranges (7d / 30d / 1y / all). */
export function SegmentedControl<T extends string>({
  items,
  value,
  onValueChange,
  ariaLabel = "Range",
  className,
}: {
  items: { value: T; label: string }[];
  value: T;
  onValueChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "rounded-[7px] px-2.5 py-1 text-xs font-medium transition-colors duration-150",
              active
                ? "bg-surface text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}