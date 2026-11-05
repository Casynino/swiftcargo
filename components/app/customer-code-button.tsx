"use client";

import { useActionState, useCallback, useState } from "react";
import { KeyRound } from "lucide-react";

import { issueCustomerCode, type CodeState } from "@/lib/actions/customer-access";
import { FormMessage } from "@/components/app/form-message";
import { Modal } from "@/components/app/modal";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/app/locale-provider";

/**
 * Gives a customer the six-digit code that opens their portal login, or sets a
 * new password. The code is shown here once; only its hash is kept, so it
 * cannot be read back later — press again for a fresh one.
 */
export function CustomerCodeButton({ customerId, name, hasLogin }: { customerId: string; name: string; hasLogin: boolean }) {
  const tx = useT();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<CodeState, FormData>(issueCustomerCode, {});
  const close = useCallback(() => setOpen(false), []);
  const label = hasLogin ? tx("Give a reset code") : tx("Give an activation code");

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} className="mt-1.5 gap-1.5">
        <KeyRound className="size-3.5" />
        {label}
      </Button>
      {open ? (
        <Modal title={label} onClose={close} className="max-w-md">
          {state.code ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {tx("Read this code to")} <strong className="text-foreground">{name}</strong> {tx("by phone or message it to them. It works once, for 15 minutes.")}
              </p>
              <p className="rounded-xl border bg-secondary py-5 text-center font-mono text-4xl font-bold tracking-[0.35em]">{state.code}</p>
              <p className="text-sm text-muted-foreground">
                {state.purpose === "ACTIVATE"
                  ? tx("They open the website, choose Register, enter their phone number, then this code and a password.")
                  : tx("They choose Forgot password on the sign-in page, enter their phone number, then this code and a new password.")}
              </p>
              <div className="flex justify-end">
                <Button type="button" onClick={close}>{tx("Done")}</Button>
              </div>
            </div>
          ) : (
            <form action={action} className="space-y-4">
              <input type="hidden" name="customerId" value={customerId} />
              <p className="text-sm text-muted-foreground">
                {hasLogin
                  ? tx("Only give a code after you have spoken to the customer and are sure it is them. A code lets them choose a new password.")
                  : tx("Only give a code after you have spoken to the customer and are sure it is them. It lets them open their portal login and see their cargo and bills.")}
              </p>
              <FormMessage error={state.error} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={close}>{tx("Cancel")}</Button>
                <SubmitButton pendingLabel={tx("Making…")}>{tx("Make a code")}</SubmitButton>
              </div>
            </form>
          )}
        </Modal>
      ) : null}
    </>
  );
}
