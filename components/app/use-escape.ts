"use client";

import { useEffect, useRef } from "react";

/**
 * Escape closes whatever is laid over the page. Every dialog here is drawn by
 * hand rather than by a library that would do this for it, and a keyboard user
 * otherwise has no way out but the mouse.
 */
export function useEscape(open: boolean, close: () => void) {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") latest.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}
