"use client";

import { useActionState, useState } from "react";
import { Lock, Unlock } from "lucide-react";

import { setOperationalHold, type ActionState } from "@/lib/actions/cargo";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useT } from "@/components/app/locale-provider";
export function HoldToggle({
  cargoId,
  held,
  reason,
}: {
  cargoId: string;
  held: boolean;
  reason: string | null;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    setOperationalHold,
    {}
  );
  const [open, setOpen] = useState(false);

  if (held) {
    return (
      <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
          <Lock className="size-4" />
          {tx("Held — this cargo cannot be released")}
        </p>
        {reason ? <p className="text-sm text-amber-900/80">{reason}</p> : null}
        <form action={action}>
          <input type="hidden" name="cargoId" value={cargoId} />
          <input type="hidden" name="hold" value="off" />
          <FormMessage error={state.error} />
          <SubmitButton variant="outline" size="sm">
            <Unlock />
            {tx("Lift the hold")}
          </SubmitButton>
        </form>
      </div>
    );
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Lock />
        {tx("Hold this cargo")}
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-lg border p-4">
      <input type="hidden" name="cargoId" value={cargoId} />
      <input type="hidden" name="hold" value="on" />
      <div className="space-y-2">
        <Label htmlFor="reason">{tx("Why is it being held?")}</Label>
        <Input
          id="reason"
          name="reason"
          placeholder={tx("Customs query, dispute, open case…")}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {tx("A hold stops release regardless of whether the bill is paid. Money and operations are answered by different desks, and clearing one must not clear the other.")}
      </p>
      <FormMessage error={state.error} ok={state.ok} />
      <div className="flex gap-2">
        <SubmitButton variant="destructive" size="sm">
          {tx("Hold")}
        </SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {tx("Cancel")}
        </Button>
      </div>
    </form>
  );
}
