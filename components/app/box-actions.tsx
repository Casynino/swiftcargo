"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, SearchX } from "lucide-react";

import { markBoxDamaged, markBoxMissing, type BoxScanState } from "@/lib/actions/boxes";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";

import { useT } from "@/components/app/locale-provider";
/** Damage and missing, on one box, from the consignment page. */
export function BoxActions({
  boxId,
  canMissing,
  alreadyMissing,
  received,
}: {
  boxId: string;
  canMissing: boolean;
  alreadyMissing: boolean;
  received: boolean;
}) {
  const tx = useT();
  const [open, setOpen] = useState(false);
  const [damage, damageAction] = useActionState<BoxScanState, FormData>(markBoxDamaged, {});
  const [missing, missingAction] = useActionState<BoxScanState, FormData>(markBoxMissing, {});

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-500/10"
        >
          <AlertTriangle className="size-3.5" />
          {tx("Report damage")}
        </button>
        {canMissing && !alreadyMissing && !received ? (
          <form action={missingAction}>
            <input type="hidden" name="boxId" value={boxId} />
            <SubmitButton size="sm" variant="outline" className="h-7 px-2 text-xs" pendingLabel="…">
              <SearchX className="size-3.5" />
              {tx("Missing")}
            </SubmitButton>
          </form>
        ) : null}
      </div>
      <FormMessage error={missing.error} ok={missing.ok} />
      {open ? (
        <form action={damageAction} className="space-y-2 rounded-md border bg-secondary/40 p-2">
          <input type="hidden" name="boxId" value={boxId} />
          <Input name="note" placeholder={tx("What is wrong — crushed, wet, opened…")} />
          <Input name="photo" type="file" accept="image/*" capture="environment" multiple />
          <SubmitButton size="sm" pendingLabel="Saving…">{tx("Save damage report")}</SubmitButton>
          <FormMessage error={damage.error} ok={damage.ok} />
        </form>
      ) : null}
    </div>
  );
}
