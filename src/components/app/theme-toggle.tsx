"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveTheme } from "@/lib/hooks/use-active-theme";

/**
 * Light/dark toggle.
 *
 * The theme is applied by an inline script in the root layout before hydration
 * and stored on the `<html>` element, which is the single source of truth. This
 * component mirrors that element rather than keeping its own copy of the state.
 */
export function ThemeToggle() {
  const theme = useActiveTheme();

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.toggle("dark", next === "dark");
    root.style.colorScheme = next;

    try {
      localStorage.setItem("ledgerly-theme", next);
    } catch {
      // Private browsing can reject storage writes; the toggle still works for
      // this session, it just will not persist across reloads.
    }
  }

  const label =
    theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" aria-hidden />
      ) : (
        <Moon className="h-4 w-4" aria-hidden />
      )}
    </Button>
  );
}