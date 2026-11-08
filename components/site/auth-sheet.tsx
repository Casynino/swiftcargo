"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
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
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* The phone's first screen: the logo, one line, one small button. */}
      <div className="flex min-h-[calc(100dvh-5rem)] flex-col items-center justify-between py-6 text-center lg:hidden">
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
        aria-modal={open}
        aria-hidden={!open}
        className={cn(
          "auth-card dark site-glass rounded-[2rem] p-6 text-foreground sm:p-8",
          "max-lg:!bg-[#0a1624] max-lg:!backdrop-blur-none max-lg:fixed max-lg:inset-x-3 max-lg:bottom-3 max-lg:z-50 max-lg:max-h-[88dvh] max-lg:overflow-y-auto max-lg:transition-[transform,visibility] max-lg:duration-300",
          open ? "max-lg:translate-y-0" : "max-lg:invisible max-lg:translate-y-[115%]"
        )}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          className="focus-ring absolute right-4 top-4 grid size-9 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <X className="size-5" />
        </button>
        {children}
      </div>
    </>
  );
}
