"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

/** A public page that failed to draw. Nothing internal is ever printed here. */
export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Site error:", error);
  }, [error]);

  return (
    <div role="alert" className="container py-32 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-7" />
      </span>
      <h1 className="mt-5 font-display text-3xl font-bold tracking-tight">
        {t(null, "Something went wrong")}
      </h1>
      <p className="mx-auto mt-3 max-w-md text-muted-foreground">
        {t(null, "Try again in a moment. You can still track cargo and reach us on WhatsApp.")}
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>
          <RotateCcw />
          {t(null, "Try again")}
        </Button>
        <Button asChild variant="outline">
          <a href="/track">{t(null, "Track cargo")}</a>
        </Button>
        <Button asChild variant="ghost">
          <a href="/">{t(null, "Home")}</a>
        </Button>
      </div>
    </div>
  );
}
