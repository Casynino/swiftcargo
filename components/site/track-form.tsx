"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Loader2, PackageSearch, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { normaliseCode } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The tracking box.
 *
 * Codes get typed with spaces and in lower case; normalising before navigating
 * means a customer reading the number off a WhatsApp message lands on the same
 * URL as one who typed it carefully. Everything else about what counts as a
 * reference is decided on the server, in lib/tracking.ts.
 */
export function TrackForm({
  dark = false,
  /**
   * The reference already on the screen, when there is one. The result page
   * carries the same box as the landing page and a customer who has just
   * looked something up should see what they looked up, not an empty field
   * asking them to remember it.
   */
  value,
  /**
   * The big version, for the tracking hero: one tall pill with the icon inside
   * the field. It is the only control on that screen and it is the thing
   * everybody came for, so it is sized to be hit with a thumb on a phone held
   * one-handed rather than to sit politely inside a card.
   */
  pill = false,
  /**
   * The quiet version, for a hero over footage: one underlined line and the word Track, no box and no block of
   * colour (Nino, 14 Nov 2026: the boxes broke the clean look).
   */
  line = false,
}: {
  dark?: boolean;
  value?: string;
  pill?: boolean;
  line?: boolean;
}) {
  const locale = DEFAULT_LOCALE;
  const router = useRouter();
  const [code, setCode] = useState(value ?? "");
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = normaliseCode(code);
    if (!clean || pending) return;
    startTransition(() => router.push(`/track/${encodeURIComponent(clean)}`));
  };

  if (line) {
    return (
      <form
        role="search"
        onSubmit={submit}
        className="group flex h-12 items-center gap-2.5 rounded-lg border border-white/15 bg-[rgba(3,10,19,0.45)] pl-3.5 pr-1.5 backdrop-blur-md transition-colors focus-within:border-signal/70"
      >
        <PackageSearch aria-hidden className="size-4 shrink-0 text-white/50" />
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t(locale, "Track cargo: SC0125")}
          aria-label={t(locale, "Cargo reference")}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          required
          className="tnum h-full min-w-0 flex-1 bg-transparent text-sm uppercase tracking-wide text-white outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-white/50"
        />
        <button
          type="submit"
          disabled={pending}
          className="focus-ring inline-flex h-9 shrink-0 items-center gap-1 rounded-md border-l border-white/15 pl-3.5 pr-2.5 text-[13px] font-semibold text-white transition-colors hover:text-signal disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {t(locale, "Track")}
          {pending ? null : <ArrowRight className="size-3.5 transition-transform group-focus-within:translate-x-0.5" />}
        </button>
      </form>
    );
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const clean = normaliseCode(code);
        if (!clean || pending) return;
        startTransition(() => router.push(`/track/${encodeURIComponent(clean)}`));
      }}
      /* One control rather than two. The shell carries the border, the glass
         and the focus ring; the field and the button live inside it, so at
         every width — stacked on a phone, side by side from `sm` — this still
         reads as a single thing to press rather than a form. */
      className={cn(
        "flex gap-2",
        pill && "track-shell flex-col gap-2 rounded-2xl p-2 sm:flex-row sm:items-center"
      )}
    >
      <div className={cn("relative min-w-0 flex-1", !pill && "contents")}>
        {pill ? (
          <PackageSearch
            aria-hidden
            className={cn(
              "pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2",
              dark ? "text-white/45" : "text-muted-foreground"
            )}
          />
        ) : null}
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="SC0125"
          aria-label={t(locale, "Cargo reference")}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          required
          className={cn(
            "tnum h-11 min-w-0 flex-1",
            /* The shell owns the focus ring. Two rings, one inside the other,
               is the look of a component nobody finished. */
            pill &&
              "h-12 w-full rounded-xl border-0 bg-transparent pl-11 text-base uppercase tracking-wide shadow-none ring-offset-0 placeholder:normal-case placeholder:tracking-normal focus-visible:ring-0 focus-visible:ring-offset-0",
            dark && "text-white placeholder:text-white/40",
            dark && !pill && "border-white/20 bg-white/10"
          )}
        />
      </div>
      <Button
        type="submit"
        size="lg"
        variant={dark ? "accent" : "default"}
        disabled={pending}
        aria-label={t(locale, "Track")}
        className={cn(pill && "track-go h-12 w-full rounded-xl px-7 text-base sm:w-auto")}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Search />}
        <span className={cn(pill ? "inline" : "hidden sm:inline")}>
          {t(locale, "Track")}
        </span>
      </Button>
    </form>
  );
}
