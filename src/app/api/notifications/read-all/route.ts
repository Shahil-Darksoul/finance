import { markAllRead } from "@/lib/repo/notifications";
import { route, ok } from "@/lib/api";

/**
 * Clears the unread badge.
 *
 * `route` handles same-origin checking, session lookup and error mapping, so
 * the handler only deals with the happy path.
 */
export const POST = route(async (_request, user) => {
  const updated = await markAllRead(user.id);
  return ok({ updated });
});