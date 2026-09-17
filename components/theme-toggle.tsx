"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

/**
 * The light/dark switch.
 *
 * EVERYTHING that depends on the resolved theme waits for mount — the icon and
 * the label both. The server cannot know which theme the browser will settle
 * on, so anything derived from it differs between the two renders; guarding
 * only the icon still leaves an aria-label that says "switch to light" on the
 * server and "switch to dark" on the client, which is a hydration mismatch and
 * a lie to a screen reader in the same attribute.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const dark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={
        mounted ? (dark ? "Switch to light" : "Switch to dark") : "Change theme"
      }
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={cn(
        "focus-ring grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        className
      )}
    >
      {!mounted ? (
        <span className="size-4" />
      ) : dark ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </button>
  );
}
