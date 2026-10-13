import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "success"
  | "subtle";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-sm hover:brightness-110 active:brightness-95",
  secondary: "bg-surface-3 text-foreground hover:bg-border",
  outline:
    "border border-border bg-surface text-foreground hover:bg-surface-2 hover:border-border-strong",
  ghost: "text-foreground hover:bg-surface-3",
  danger: "bg-negative text-white shadow-sm hover:brightness-110",
  success: "bg-positive text-white shadow-sm hover:brightness-110",
  subtle: "bg-primary-soft text-primary hover:brightness-95 dark:hover:brightness-110",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
  icon: "h-9 w-9 text-sm",
};

export function buttonClass({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    "inline-flex select-none items-center justify-center whitespace-nowrap rounded-xl font-medium",
    "transition-[background-color,color,box-shadow,transform,opacity] duration-150",
    "disabled:pointer-events-none disabled:opacity-55",
    "active:scale-[0.98]",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Rendered before the label. */
  icon?: React.ReactNode;
  /** Rendered after the label. */
  trailing?: React.ReactNode;
  /**
   * Apply the button styles to the single child element instead of rendering a
   * `<button>`. This lets a Button style a `Link` or `router.push` target
   * without nesting one interactive element inside another.
   */
  asChild?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      icon,
      trailing,
      children,
      disabled,
      type = "button",
      asChild = false,
      ...props
    },
    ref,
  ) {
    const classes = buttonClass({ variant, size, className });
    const inert = disabled || loading;

    if (asChild && React.isValidElement(children)) {
      // `disabled` and `type` are meaningless on an anchor, so the child gets an
      // ARIA flag and the muted styling instead.
      const child = children as React.ReactElement<Record<string, unknown>>;
      return React.cloneElement(child, {
        ...props,
        ...(inert ? { "aria-disabled": true } : null),
        className: cn(classes, inert && "pointer-events-none opacity-55", child.props.className as string),
      });
    }

    return (
      <button
        ref={ref}
        type={type}
        className={classes}
        disabled={inert}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          icon
        )}
        {children}
        {!loading && trailing}
      </button>
    );
  },
);