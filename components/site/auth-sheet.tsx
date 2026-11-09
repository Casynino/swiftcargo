"use client";

import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { InstallButton, InstallPrompt } from "@/components/install-app";
import { cn } from "@/lib/utils";

/**
 * THE DOOR, ON A PHONE.
 *
 * Opening the sign-in page on a phone shows the scene — the port, the lane, the
 * logo — with one small button. The form is not drawn over the picture: it
 * comes up as a card from the bottom edge when the button is pressed, and goes
 * back down again. From a computer the same card simply sits beside the scene.
 *
 * One card in the page, not two: on a phone it is a sheet that is out of sight
 * (and out of reach of the keyboard) until it is opened, on a computer it is the
 * ordinary card. A notice that must be read — a sign-in that has ended — opens
 * it at once.
 */
export function AuthSheet({
  cta,
  tagline,
  defaultOpen = false,
  children,
}: {
  cta: string;
  tagline: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (!open) return;
    /* Always opens at the top of the card. */
    document.querySelector<HTMLElement>("[data-auth-card]")?.scrollTo({ top: 0 });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* The phone's first screen: the logo, one line, one small button. */}
      <InstallPrompt />
      <div className="flex min-h-[calc(100dvh-6.5rem)] flex-col items-center justify-between py-6 text-center lg:hidden">
        <BrandMark size={72} className="flex-col gap-3 [&>span:last-child]:items-center" />
        <div className="flex flex-col items-center gap-5">
          <p className="max-w-xs text-balance text-lg font-medium leading-snug text-white/90">{tagline}</p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className="focus-ring inline-flex h-11 items-center rounded-full bg-signal px-7 text-sm font-semibold text-signal-foreground transition-colors hover:bg-signal/90"
          >
            {cta}
          </button>
          <InstallButton
            render={(openSheet) => (
              <button
                type="button"
                onClick={openSheet}
                className="focus-ring inline-flex h-9 items-center gap-1.5 text-[13px] text-white/60 underline-offset-4 transition-colors hover:text-white hover:underline"
              >
                <Smartphone className="size-3.5" />
                Get the full-screen app
              </button>
            )}
          />
        </div>
      </div>

      {open ? (
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/55 lg:hidden"
        />
      ) : null}

      <div
        role="dialog"
        data-auth-card
        aria-modal={open}
        aria-hidden={!open}
        className={cn(
          "auth-card dark site-glass rounded-[2rem] p-6 text-foreground sm:p-8",
          /* On a phone: a small see-through glass card low on the page, not a slab across it. */
          "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.75rem))] max-lg:z-50 max-lg:mx-auto max-lg:max-h-[78dvh] max-lg:w-[calc(100%-2.5rem)] max-lg:max-w-[21rem] max-lg:overflow-y-auto max-lg:rounded-2xl max-lg:p-4 max-lg:transition-[transform,visibility] max-lg:duration-300",
          "max-lg:!border-white/[0.09] max-lg:!bg-[#0a1624]/70 max-lg:!backdrop-blur-2xl max-lg:backdrop-saturate-150 max-lg:shadow-[0_18px_44px_-22px_rgba(0,0,0,0.75)]",
          open ? "max-lg:translate-y-0" : "max-lg:invisible max-lg:translate-y-[115%]"
        )}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          className="focus-ring absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <X className="size-4" />
        </button>
        {children}
      </div>
    </>
  );
}
