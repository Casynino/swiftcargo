"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { deleteCustomer, type ActionState } from "@/lib/actions/customers";
import { FormMessage } from "@/components/app/form-message";
import { useT } from "@/components/app/locale-provider";
import { Modal } from "@/components/app/modal";
import { SubmitButton } from "@/components/app/submit-button";
import { Tm } from "@/components/app/tx";
import { Button } from "@/components/ui/button";

/**
 * Delete a customer, asked once.
 *
 * The server refuses a customer with cargo or bills and says so in the
 * dialog; one with neither is archived and the desk is taken back to the list.
 */
export function DeleteCustomerButton({ customerId, name }: { customerId: string; name: string }) {
  const tx = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(deleteCustomer, {});
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (state.ok) router.push("/app/customers");
  }, [state, router]);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="text-destructive hover:text-destructive">
        <Trash2 />
        {tx("Delete")}
      </Button>
      {open ? (
        <Modal title={tx("Delete this customer?")} onClose={close}>
          <form action={action} className="space-y-4">
            <input type="hidden" name="customerId" value={customerId} />
            <p className="text-sm">
              <span className="font-semibold">{name}</span>{" "}
              {tx("will be removed from the customer list and search, and their portal sign-in will stop working.")}
            </p>
            <p className="text-xs text-muted-foreground">
              {tx("A customer with cargo or bills cannot be deleted — edit their details instead.")}
            </p>
            {state.error ? <p className="text-sm font-medium text-destructive"><Tm>{state.error}</Tm></p> : null}
            <FormMessage ok={state.ok} />
            <div className="flex flex-wrap gap-2">
              <SubmitButton variant="destructive" pendingLabel={tx("Deleting…")}>
                <Trash2 />
                {tx("Delete customer")}
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
