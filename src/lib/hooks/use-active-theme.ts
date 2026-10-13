import * as React from "react";

/**
 * Reads the active theme from the document.
 *
 * The root layout's inline script sets `.dark` on `<html>` before hydration, so
 * the correct value is already on the DOM when React first renders. Using
 * `useSyncExternalStore` means the toggle reads that value directly instead of
 * guessing `"light"` and correcting it in an effect, which would render the
 * wrong icon for a frame and cascade a second render pass.
 *
 * A `MutationObserver` keeps it in sync if anything else changes the class.
 */
export function useActiveTheme(): "light" | "dark" {
  return React.useSyncExternalStore(subscribeToThemeChange, readTheme, () => "light");
}

function readTheme(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function subscribeToThemeChange(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  return () => observer.disconnect();
}