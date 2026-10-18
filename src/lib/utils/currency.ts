/**
 * Currency metadata shared by server and client code.
 *
 * The app is single-currency: every amount is stored and shown in Canadian
 * dollars. Kept free of database or Node imports so client components can
 * import it without pulling server-only modules into the browser bundle.
 */

/** Currency the whole app stores and displays amounts in. */
export const DEFAULT_CURRENCY = "CAD";
