import { cn } from "@/lib/utils/cn";

/**
 * Ledgerly logomark: a rounded square with a rising bar chart inside.
 *
 * Drawn in `currentColor` and the semantic tokens so it follows the theme in
 * both light and dark mode without a second asset.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm",
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-2/3 w-2/3"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 19h16" />
        <path d="M7 15.5v-4" />
        <path d="M11.5 15.5v-7.5" />
        <path d="M16 15.5v-4.5" />
      </svg>
    </span>
  );
}