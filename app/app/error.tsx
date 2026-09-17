"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { useSmartBack } from "@/components/app/smart-back";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

/**
 * A screen that failed to draw, inside the shell so the menu still works.
 *
 * The error's own message is never shown: in production it is either Next's
 * generic line or, worse, a database error naming tables and ids. The digest is
 * what the server log is keyed by, so it is the one thing worth reading out.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const back = useSmartBack("/app/dashboard", t(null, "Home"));

  useEffect(() => {
    console.error("Staff app error:", error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto max-w-lg py-16 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-7" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        {t(null, "This screen could not load")}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {t(
          null,
          "Nothing you had not already saved was changed. Try again — if it keeps happening, tell the administrator and quote the reference below."
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
          {/* A plain anchor, not a client link: the router that just failed is
              the one a client link would ask to try again. */}
          <a href={back.href}>{back.label === "Back" ? t(null, "Go back") : back.label}</a>
        </Button>
      </div>
    </div>
  );
}
