"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { checkVersion, useStale } from "@/components/app/version-watch";
/**
 * "New update is up."
 *
 * A desk keeps this open all day beside WhatsApp, so a page loaded this morning
 * is still on screen after a fix has shipped — and the floor least likely to
 * think of a hard refresh is the one most likely to need the fix.
 *
 * So the page asks. It compares the build it was loaded from against the one
 * the server is serving now, and offers a reload rather than performing one: a
 * clerk half-way through typing a consignment must not have the form pulled out
 * from under them.
 *
 * Checked when the tab is looked at again rather than on a fast timer. Coming
 * back to it is exactly the moment a stale page matters, and a poll every few
 * seconds would be a thousand requests a day per phone to answer a question
 * that changes twice.
 */
/* A minute: a JSON answer of forty bytes, and only while the tab is being
   looked at. Five minutes let a press made just after a deploy go out from
   the old page and hang. */
const EVERY = 60 * 1000;

export function NewVersionNotice({ build }: { build: string }) {
  const tx = useT();
  const stale = useStale();

  useEffect(() => {
    if (build === "development") return;
    const check = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };
    const timer = setInterval(check, EVERY);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    check();
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [build]);

  if (!stale) return null;

  /*
    ACROSS THE MIDDLE OF THE TOP BAR, WHERE THERE IS NOTHING TO COVER.

    On a desktop the strip between the logo and the bell is empty. A phone has
    no such gap, so there it sits at the bottom above the thumb's reach instead.
    The whole pill is the button, with the reload icon on the end so what
    pressing it does is shown rather than spelled out twice.
  */
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 print:hidden lg:bottom-auto lg:top-3">
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="update-pill pointer-events-auto inline-flex items-center gap-2.5 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground shadow-xl transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {tx("New update is up")}
        <RefreshCw className="size-4 shrink-0" />
      </button>
    </div>
  );
}
