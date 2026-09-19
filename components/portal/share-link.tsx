"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Share this page's own address, or copy it where the phone cannot share.
 *
 * The address only opens for the signed-in customer who owns the record, so
 * a link forwarded to somebody else shows them a sign-in page, not the bill.
 */
export function ShareLink({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        const url = window.location.href.split("#")[0];
        try {
          if (navigator.share) {
            await navigator.share({ title, url });
            return;
          }
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* A cancelled share sheet is not an error worth showing. */
        }
      }}
    >
      {copied ? <Check /> : <Share2 />}
      {copied ? "Link copied" : "Share"}
    </Button>
  );
}
