"use client";

import { useSyncExternalStore } from "react";

import { BUILD_ID } from "@/lib/build-id";

/**
 * WHETHER THIS PAGE IS STILL THE VERSION BEING SERVED.
 *
 * A page loaded before a deploy keeps the old ids for its server actions, and
 * the new build does not know them: the press goes out and nothing answers, so
 * the button sat on "Saving…" until somebody reloaded. One answer, shared by
 * the update pill and every submit button, so both can say so.
 */
let stale = false;
const listeners = new Set<() => void>();

export async function checkVersion(): Promise<boolean> {
  /* A dev server rebuilds constantly and would cry wolf all day. */
  if (stale || BUILD_ID === "development") return stale;
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { build?: string };
      /* Only ever set: a hiccup answering with the old build must not make
         the notice flicker away. */
      if (data.build && data.build !== BUILD_ID) {
        stale = true;
        listeners.forEach((l) => l());
      }
    }
  } catch {
    /* Offline or mid-deploy. This is a convenience; it never reports itself. */
  }
  return stale;
}

export function useStale(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => stale,
    () => false
  );
}
