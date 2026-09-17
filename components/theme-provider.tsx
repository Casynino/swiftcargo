"use client";

import { ThemeProvider as NextThemes } from "next-themes";

/**
 * Light and dark, remembered per person.
 *
 * `attribute="class"` because every token in globals.css is scoped under
 * `.dark`, and `disableTransitionOnChange` because animating a hundred colour
 * variables at once produces a visible smear rather than a fade.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemes>
  );
}
