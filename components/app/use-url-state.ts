"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { visit } from "@/lib/nav-trail";

/**
 * A piece of list state — a tab, a search, a sort — kept in the address.
 *
 * In component state alone it is gone the moment the reader opens a row and
 * comes back, and they have to find their place in a three-hundred-line
 * manifest again. Written with replaceState, so a change of sort is not a step
 * the browser's Back button has to walk through; the default is left out so an
 * untouched list keeps a clean address.
 */
export function useUrlState<T extends string>(
  key: string,
  fallback: T,
  allowed?: readonly T[]
): [T, (next: T) => void] {
  const params = useSearchParams();
  const [value, setValue] = useState<T>(() => {
    const raw = params.get(key);
    if (raw === null) return fallback;
    if (allowed && !allowed.includes(raw as T)) return fallback;
    return raw as T;
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (value === fallback || value === "") url.searchParams.delete(key);
    else url.searchParams.set(key, value);
    if (url.href !== window.location.href) {
      window.history.replaceState(window.history.state, "", url.href);
      /* The trail records the address when the page is reached; a sort changed
         afterwards has to be written there too, or Back returns to the list as
         it was first opened. */
      visit(url.pathname + url.search);
    }
  }, [key, value, fallback]);

  return [value, setValue];
}
