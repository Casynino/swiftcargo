"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { checkVersion, useStale } from "@/components/app/version-watch";
import { t } from "@/lib/i18n";

export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  /* Pending wins over the caller's own condition. A form that passes
     `disabled={false}` because its figures are valid must not switch the guard
     off, or a second tap records the same payment twice. */
  const busy = pending || Boolean(disabled);
  /* An icon button has room for the spinner and nothing else; its name is
     already on aria-label. */
  const iconOnly = props.size === "icon";

  /* STILL SPINNING AFTER TWELVE SECONDS IS A QUESTION, NOT A WAIT.
     Nearly always it is a page older than the build being served: its action
     no longer exists and nothing will answer. Asked once, then said beside the
     button, so a clerk is never left staring at "Saving…". */
  const [slow, setSlow] = useState(false);
  const stale = useStale();
  useEffect(() => {
    if (!pending) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => {
      setSlow(true);
      void checkVersion();
    }, 12_000);
    return () => clearTimeout(timer);
  }, [pending]);

  return (
    <>
      <Button type="submit" {...props} disabled={busy} aria-busy={pending || undefined}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {pending ? (iconOnly ? null : (pendingLabel ?? t(null, "Saving…"))) : children}
      </Button>
      {pending && slow ? (
        <span role="status" className="ml-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
          {stale ? t(null, "The app was updated while this page was open.") : t(null, "Still working…")}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="font-semibold text-brand underline-offset-2 hover:underline"
          >
            {t(null, "Reload")}
          </button>
        </span>
      ) : null}
    </>
  );
}
