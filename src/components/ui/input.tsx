"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

/* ----------------------------------------------------------------- Field */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label?: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className="block text-xs font-medium text-foreground"
        >
          {label}
          {required ? (
            <span className="ml-0.5 text-negative" aria-hidden>
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-[11px] font-medium text-negative" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- Input */

const CONTROL_BASE =
  "w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors duration-150 hover:border-border-strong focus:border-primary focus:outline-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-negative";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL_BASE, "h-10", className)}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL_BASE, "resize-y py-2 leading-relaxed", className)}
      {...props}
    />
  );
});

/* ---------------------------------------------------------------- Select */

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          CONTROL_BASE,
          "h-10 cursor-pointer appearance-none pr-9",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        fill="none"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      >
        <path
          d="M6 8l4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
});

/* ------------------------------------------------------------ MoneyInput */

/**
 * Currency input that keeps the raw text while typing (so "12." and "12.0"
 * behave normally) and reports integer cents on change.
 */
export function MoneyInput({
  valueCents,
  onValueChange,
  currency = "$",
  className,
  id,
  placeholder = "0.00",
  style,
  ...props
}: {
  valueCents: number;
  onValueChange: (cents: number) => void;
  currency?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [text, setText] = React.useState(() =>
    valueCents === 0 ? "" : (valueCents / 100).toFixed(2),
  );
  const lastEmitted = React.useRef(valueCents);

  // Re-sync when the parent changes the value (e.g. form reset).
  React.useEffect(() => {
    if (valueCents === lastEmitted.current) return;
    lastEmitted.current = valueCents;
    setText(valueCents === 0 ? "" : (valueCents / 100).toFixed(2));
  }, [valueCents]);

  // Currency codes such as "CAD" are wider than a single "$", so reserve space
  // for the whole prefix instead of using a fixed padding.
  const prefixPadding = `calc(0.75rem + ${Math.max(currency.length, 1)}ch + 0.75rem)`;

  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground"
      >
        {currency}
      </span>
      <Input
        id={id}
        inputMode="decimal"
        placeholder={placeholder}
        className={cn("tabular-nums", className)}
        style={{ paddingLeft: prefixPadding, ...style }}
        value={text}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw !== "" && !/^-?[0-9]*\.?[0-9]*$/.test(raw)) return;
          setText(raw);
          const parsed = Number.parseFloat(raw);
          const cents = Number.isFinite(parsed)
            ? Math.round(parsed * 100)
            : 0;
          lastEmitted.current = cents;
          onValueChange(raw.startsWith("-") ? -Math.abs(cents) : cents);
        }}
        {...props}
      />
    </div>
  );
}

/* --------------------------------------------------------------- Switch */

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  id,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}) {
  const switchId = React.useId();
  const inputId = id ?? switchId;
  return (
    <div className="flex items-start justify-between gap-4">
      {label ? (
        <div className="min-w-0">
          <label
            htmlFor={inputId}
            className="cursor-pointer text-sm font-medium text-foreground"
          >
            {label}
          </label>
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      <button
        id={inputId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label ? undefined : "Toggle"}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200",
          "focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2",
          checked ? "bg-primary" : "bg-border-strong",
          disabled && "cursor-not-allowed opacity-55",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- Checkbox */

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  className,
  id,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  return (
    <label
      htmlFor={inputId}
      className={cn("inline-flex cursor-pointer items-center gap-2 text-sm", className)}
    >
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="h-4 w-4 shrink-0 cursor-pointer rounded border-border-strong text-primary accent-[var(--primary)] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
      />
      {label}
    </label>
  );
}