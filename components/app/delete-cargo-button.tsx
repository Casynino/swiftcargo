"use client";

import { useActionState, useCallback, useState } from "react";
import { Trash2 } from "lucide-react";

import { deleteCargo, type ActionState } from "@/lib/actions/cargo";
import { useT } from "@/components/app/locale-provider";
import { Modal } from "@/components/app/modal";
import { SubmitButton } from "@/components/app/submit-button";
import { Tm } from "@/components/app/tx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Delete a consignment, asked once.
 *
 * Soft delete — the record, its photos and its history survive on the
 * deleted-records screen until somebody with the same authority restores it.
 * A success is never seen here: the action itself redirects the desk away
 * from a record that no longer exists at this address, so this component
 * only ever has an error to show.
 */
export function DeleteCargoButton({ cargoId }: { cargoId: string }) {
  const tx = useT();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(deleteCargo, {});
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 />
        {tx("Delete")}
      </Button>
      {open ? (
        <Modal title={tx("Delete this cargo")} onClose={close}>
          <form action={action} className="space-y-4">
            <input type="hidden" name="cargoId" value={cargoId} />
            <div className="space-y-2">
              <Label htmlFor="delete-reason">{tx("Why is it being deleted?")}</Label>
              <Input
                id="delete-reason"
                name="reason"
                placeholder={tx("Duplicate record, wrong customer, entered by mistake…")}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {tx(
                "Nothing is destroyed — the record, its photos and its history stay on the deleted-records screen until somebody restores it."
              )}
            </p>
            {state.error ? (
              <p className="text-sm font-medium text-destructive">
                <Tm>{state.error}</Tm>
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <SubmitButton variant="destructive" pendingLabel={tx("Deleting…")}>
                <Trash2 />
                {tx("Delete cargo")}
              </SubmitButton>
              <Button type="button" variant="ghost" onClick={close}>
                {tx("Cancel")}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
