"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normaliseCode } from "@/lib/format";

import { useT } from "@/components/app/locale-provider";
/**
 * The warehouse lookup.
 *
 * A plain input rather than a camera library: every phone's keyboard has a
 * barcode-scanner app behind it, most warehouse scanners emulate a keyboard, and
 * a clerk holding a box can always read the number. Adding a camera dependency
 * to a screen that works without one is a dependency that breaks on a phone
 * nobody can update.
 */
export function ScanLookup() {
  const tx = useT();
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const value = code.trim();
        if (!value) return;

        /*
          A SCANNER IS A KEYBOARD.

          Whatever the label said lands in this box: our label URL, a bare
          token, or — when somebody types instead of scanning — a tracking
          number or a shipping mark. A scanned code goes straight to the box it
          names; anything else goes to search, which is what a half-remembered
          number needs.
        */
        const link = value.match(/\/t\/([A-Za-z0-9_\-%]+)\/?$/);
        const token = link ? link[1] : /^swq[a-z0-9_-]{12,}$/i.test(value) ? value : null;
        if (token) {
          router.push(`/t/${token}`);
          return;
        }

        const clean = normaliseCode(value);
        if (clean) router.push(`/app/search?q=${encodeURIComponent(clean)}`);
      }}
      className="flex gap-2"
    >
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoFocus
        inputMode="text"
        placeholder={tx("Scan a label, or type SC0125 or a name")}
        aria-label={tx("Cargo reference")}
        className="tnum h-11"
      />
      <Button type="submit" size="lg">
        <Search />
        {tx("Find")}
      </Button>
    </form>
  );
}
