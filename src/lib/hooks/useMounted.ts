import * as React from "react";

/**
 * `false` during server rendering and the first client render, `true`
 * afterwards.
 *
 * Used to gate anything that touches `document` at render time — portals,
 * focus traps, `getBoundingClientRect` — which would otherwise cause a
 * hydration mismatch. Implemented with `useSyncExternalStore` rather than a
 * `setState` inside an effect, because a state flip in an effect forces an
 * extra render pass for every consumer.
 */
const emptySubscribe = () => () => {};

export function useMounted(): boolean {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}