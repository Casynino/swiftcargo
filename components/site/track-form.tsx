"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";

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
export function TrackForm({ dark = false }: { dark?: boolean }) {
  const locale = DEFAULT_LOCALE;
  const router = useRouter();
  const [code, setCode] = useState("");
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
      className="flex gap-2"
    >
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
          "h-11 min-w-0 flex-1 tnum",
          dark &&
            "border-white/20 bg-white/10 text-white placeholder:text-white/40"
        )}
      />
      <Button
        type="submit"
        size="lg"
        variant={dark ? "accent" : "default"}
        disabled={pending}
        aria-label={t(locale, "Track")}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Search />}
        <span className="hidden sm:inline">{t(locale, "Track")}</span>
      </Button>
    </form>
  );
}
