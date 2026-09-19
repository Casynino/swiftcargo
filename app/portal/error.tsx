"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

/**
 * A customer's screen that failed to draw.
 *
 * Their cargo is not the thing that broke, and the first sentence says so —
 * somebody watching a shipment worth more than their month does not need a
 * stack trace or a silence. The error itself is never printed; the digest is
 * what the server log is keyed by.
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Portal error:", error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto max-w-lg py-16 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-7" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        {t(null, "This page could not load")}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {t(
          null,
          "Your cargo and your invoices are safe — this is only the screen. Try again, and if it keeps happening send us a message and quote the reference below."
        )}
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-muted-foreground">{error.digest}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>
          <RotateCcw />
          {t(null, "Try again")}
        </Button>
        <Button asChild variant="outline">
          <a href="/portal">{t(null, "My dashboard")}</a>
        </Button>
        <Button asChild variant="ghost">
          <a href="/portal/messages">{t(null, "Message us")}</a>
        </Button>
      </div>
    </div>
  );
}
