"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { Ban, Paperclip, Pencil } from "lucide-react";

import { cancelTransfer, type ActionState } from "@/lib/actions/accounts";
import { cancelExpense } from "@/lib/actions/expenses";
import { reversePayment } from "@/lib/actions/payments";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useT } from "@/components/app/locale-provider";
import { Tx } from "@/components/app/tx";
export type LedgerKind = "payment" | "expense" | "transfer";

const CANCEL = {
  payment: {
    action: reversePayment,
    field: "paymentId",
    verb: "Reverse",
    /* The customer holds a receipt saying this money was counted. Reversing it
       is telling them it was not, so the reason is the whole record. */
    ask: "Why is this payment being reversed? The customer has a receipt for it.",
  },
  expense: {
    action: cancelExpense,
    field: "expenseId",
    verb: "Cancel",
    ask: "Why is this cost being cancelled? It has been in a profit report.",
  },
  transfer: {
    action: cancelTransfer,
    field: "transferId",
    verb: "Cancel",
    ask: "Why is this movement being cancelled? Both balances moved when it was written.",
  },
} as const;

/**
 * FIX A ROW ON THE REGISTER.
 *
 * Nothing here deletes. Open the record to change it, or cancel it with a
 * reason — the row stays, struck through and no longer counted, because a
 * movement that vanishes is a movement nobody can ask about afterwards.
 */
export function LedgerRowActions({
  kind,
  id,
  editHref,
  proofHref,
  cancelled,
  mayCancel,
  showProof = true,
  editSlot,
}: {
  kind: LedgerKind;
  id: string;
  editHref: string;
  proofHref?: string | null;
  cancelled: boolean;
  mayCancel: boolean;
  /** The ledger gives proof its own column, so it asks for the buttons alone. */
  showProof?: boolean;
  /** The record's own correction control, where it has one. A link back to
      the list the row is on opens nothing. */
  editSlot?: ReactNode;
}) {
  const tx = useT();
  const spec = CANCEL[kind];
  const [state, action] = useActionState<ActionState, FormData>(
    spec.action,
    {}
  );
  const [asking, setAsking] = useState(false);

  if (asking) {
    return (
      <form action={action} className="min-w-[15rem] space-y-2">
        <input type="hidden" name={spec.field} value={id} />
        <p className="text-xs text-muted-foreground"><Tx>{spec.ask}</Tx></p>
        <Input name="reason" placeholder={tx("The reason")} />
        <FormMessage error={state.error} ok={state.ok} />
        <div className="flex gap-2">
          <SubmitButton size="sm" variant="destructive">
            {spec.verb}
          </SubmitButton>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setAsking(false)}
          >
            {tx("Keep it")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {!showProof ? null : proofHref ? (
        <Button asChild size="sm" variant="ghost" className="h-7 px-2">
          <Link href={proofHref} target="_blank" rel="noreferrer">
            <Paperclip className="mr-1 size-3" />
            {tx("View")}
          </Link>
        </Button>
      ) : (
        <span className="px-2 text-xs text-muted-foreground">—</span>
      )}
      {cancelled ? null : (
        <>
          {editSlot ? (
            <span className="contents">{editSlot}</span>
          ) : (
            <Button asChild size="sm" variant="outline" className="h-7 px-2">
              <Link href={editHref}>
                <Pencil className="mr-1 size-3" />
                {tx("Edit")}
              </Link>
            </Button>
          )}
          {mayCancel ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              onClick={() => setAsking(true)}
            >
              <Ban className="mr-1 size-3" />
              {spec.verb}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
