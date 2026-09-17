"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, PackageSearch, Search } from "lucide-react";

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
}: {
  dark?: boolean;
  value?: string;
  pill?: boolean;
}) {
  const locale = DEFAULT_LOCALE;
  const router = useRouter();
  const [code, setCode] = useState(value ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const clean = normaliseCode(code);
        if (!clean || pending) return;
        startTransition(() => router.push(`/track/${encodeURIComponent(clean)}`));
      }}
      className={cn("flex gap-2", pill && "flex-col gap-2.5 sm:flex-row")}
    >
      <div className={cn("relative min-w-0 flex-1", !pill && "contents")}>
        {pill ? (
          <PackageSearch
            aria-hidden
            className={cn(
              "pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2",
              dark ? "text-white/40" : "text-muted-foreground"
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
            pill &&
              "h-14 w-full rounded-xl pl-12 text-base uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal",
            dark &&
              "border-white/20 bg-white/10 text-white placeholder:text-white/40"
          )}
        />
      </div>
      <Button
        type="submit"
        size="lg"
        variant={dark ? "accent" : "default"}
        disabled={pending}
        aria-label={t(locale, "Track")}
        className={cn(pill && "h-14 rounded-xl px-8 text-base")}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Search />}
        <span className={cn(pill ? "inline" : "hidden sm:inline")}>
          {t(locale, "Track")}
        </span>
      </Button>
    </form>
  );
}
