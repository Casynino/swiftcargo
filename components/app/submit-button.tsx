"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
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
  return (
    <Button type="submit" {...props} disabled={busy} aria-busy={pending || undefined}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? (iconOnly ? null : (pendingLabel ?? t(null, "Saving…"))) : children}
    </Button>
  );
}
