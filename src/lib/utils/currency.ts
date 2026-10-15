/**
 * Currency metadata shared by server and client code.
 *
 * Kept free of any database or Node imports so client components (e.g. the
 * display-currency switcher) can import it without pulling server-only modules
 * into the browser bundle. The conversion logic lives in
 * `@/lib/services/finance/currency`.
 */

export const DISPLAY_CURRENCY_CODES = ["USD", "CAD", "INR", "EUR", "GBP", "AUD"] as const;
export type DisplayCurrencyCode = (typeof DISPLAY_CURRENCY_CODES)[number];

export const DISPLAY_CURRENCY_LABELS: Record<DisplayCurrencyCode, string> = {
  USD: "US Dollar",
  CAD: "Canadian Dollar",
  INR: "Indian Rupee",
  EUR: "Euro",
  GBP: "British Pound",
  AUD: "Australian Dollar",
};

export function isDisplayCurrency(code: string): code is DisplayCurrencyCode {
  return (DISPLAY_CURRENCY_CODES as readonly string[]).includes(code);
}

/** JSON-safe view of a resolved display context, safe to pass to the client. */
export type DisplayView = {
  baseCurrency: string;
  currency: string;
  rate: number;
  live: boolean;
  asOf: string | null;
  converted: boolean;
};
