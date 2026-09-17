"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * A value that exists to be sent to somebody else.
 *
 * The shipping mark and the Guangzhou address are both read off this screen and
 * pasted into WhatsApp, and a mark retyped by hand is a mark that arrives on a
 * box one character wrong.
 */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-2 rounded-md border bg-secondary/50 p-2">
      <code className="tnum flex-1 truncate px-1 text-sm font-semibold">
        {value}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            /* A browser that refuses the clipboard leaves the text selectable,
               which is the fallback that has always worked. */
          }
        }}
      >
        {copied ? <Check className="text-emerald-600" /> : <Copy />}
      </Button>
    </div>
  );
}
