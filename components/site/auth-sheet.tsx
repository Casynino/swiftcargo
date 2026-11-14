"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Smartphone, X } from "lucide-react";

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
  alt,
  tagline,
  defaultOpen = false,
  children,
}: {
  cta: string;
  /** The other door, on the same first screen: a link to the other page (which opens its card at once). */
  alt?: { label: string; href: string };
  tagline?: React.ReactNode;
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
      {/* A phone keeps the mark at the head and the doors at the foot; a computer gathers all of it in the middle. */}
      <div
        className={cn(
          "flex min-h-[calc(100dvh-6.5rem)] flex-1 flex-col items-center justify-between py-6 text-center transition-opacity duration-300 sm:justify-center sm:gap-14",
          open && "pointer-events-none opacity-0 sm:opacity-100 sm:[&>div]:opacity-0"
        )}
      >
        <BrandMark size={72} className="flex-col gap-3 [&>span:last-child]:items-center" />
        <div className="flex flex-col items-center gap-5 sm:gap-6">
          {tagline ? (
            <p className="max-w-xs text-balance text-lg font-medium leading-snug text-white/90 [text-shadow:0_2px_16px_rgba(0,0,0,0.6)] sm:max-w-xl sm:text-2xl sm:font-semibold sm:tracking-tight">{tagline}</p>
          ) : null}
          {/* Two plain choices, no pills: the one for this page underlined, the other a quiet line under it. */}
          <div className="flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              className="focus-ring group relative inline-flex items-center gap-2 pb-1.5 text-base font-semibold text-white sm:text-lg"
            >
              {cta}
              <ArrowRight className="size-3.5 text-white/80 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[1.5px] rounded-full bg-signal" />
            </button>
            {alt ? (
              <Link href={alt.href} className="focus-ring text-[15px] text-white/70 transition-colors hover:text-white">
                {alt.label}
              </Link>
            ) : null}
          </div>
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
          className="fixed inset-0 z-40 bg-[rgba(3,10,19,0.55)] backdrop-blur-[2px]"
        />
      ) : null}

      <div
        role="dialog"
        data-auth-card
        aria-modal={open}
        aria-hidden={!open}
        className={cn(
          "auth-card dark text-foreground",
          /* A small see-through glass card low on the page, not a slab across it — on a phone and a computer alike. */
          "fixed inset-x-0 bottom-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.75rem))] z-50 mx-auto max-h-[78dvh] w-[calc(100%-2.5rem)] max-w-[21rem] overflow-y-auto rounded-xl p-5 transition-[transform,visibility] duration-300 sm:bottom-[16vh] sm:max-w-[23rem] sm:p-7",
          "border border-white/10 bg-[rgba(4,12,22,0.82)] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)] backdrop-blur-xl",
          open ? "translate-y-0" : "invisible translate-y-[calc(100%+12vh)]"
        )}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          className="focus-ring absolute right-3 top-3 grid size-8 place-items-center text-white/45 transition-colors hover:text-white"
        >
          <X className="size-4" />
        </button>
        {children}
      </div>
    </>
  );
}
