"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { rememberTitle, visit } from "@/lib/nav-trail";

/**
 * The one thing that records where the reader has been. Mounted once in the
 * shell, so no link in the app has to know about it.
 *
 * The search string is kept — the tab, the filter and the search box are the
 * place somebody was working — except one-shot instructions, which would
 * re-fire every time the reader came back.
 */
export function NavTrail() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(search.toString());
    for (const oneShot of ["download", "record", "open", "new"]) params.delete(oneShot);
    const query = params.toString();
    visit(query ? `${pathname}?${query}` : pathname);
  }, [pathname, search]);


  return null;
}

/**
 * A page saying its own name, from its own header, once it is on screen — the
 * one moment the address and the name are certain to belong together.
 */
export function RememberTitle({ title }: { title: string }) {
  const pathname = usePathname();
  useEffect(() => {
    rememberTitle(pathname, title);
  }, [pathname, title]);
  return null;
}
