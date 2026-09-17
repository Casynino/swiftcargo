"use client";

import { useActionState } from "react";
import { MessageCircle } from "lucide-react";

import { SubmitButton } from "@/components/app/submit-button";
import { logCustomerContact, type ActionState } from "@/lib/actions/messages";

/**
 * ONE PRESS: LOG IT, THEN OPEN WHATSAPP WITH IT TYPED.
 *
 * The wording is composed on the server from the consignment, so nobody retypes
 * a figure into a phone and nobody copies a reference by eye. Pressing this
 * records the contact against the cargo and opens WhatsApp; a PERSON presses
 * send. That distinction is why the log says "contacted" rather than "notified"
 * — it is the difference between what this system knows and what it would like
 * to claim.
 */
export function WhatsAppButton({
  cargoId,
  invoiceId,
  phone,
  message,
  kind,
  label = "WhatsApp",
  iconOnly = false,
  solid = false,
}: {
  cargoId?: string;
  invoiceId?: string;
  /** Digits only, country code, no plus. Null when there is no usable number. */
  phone: string | null;
  message: string;
  kind: string;
  label?: string;
  /** A square in a row of squares, when it sits in a table's action column. */
  iconOnly?: boolean;
  /** The small green button in a panel heading. */
  solid?: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    logCustomerContact,
    {}
  );

  if (!phone) return null;

  return (
    <form
      action={action}
      onSubmit={() => {
        /* Opened from the click itself, not from the action's result: a popup
           blocker kills a window opened after an await. */
        window.open(
          `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
          "_blank",
          "noopener"
        );
      }}
    >
      {cargoId ? <input type="hidden" name="cargoId" value={cargoId} /> : null}
      {invoiceId ? (
        <input type="hidden" name="invoiceId" value={invoiceId} />
      ) : null}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="channel" value="WHATSAPP" />
      <input type="hidden" name="body" value={message} />
      <SubmitButton
        size={iconOnly ? "icon" : "sm"}
        variant="outline"
        title={state.error ?? label}
        className={
          iconOnly
            ? "relative size-9 border-success/40 text-success hover:bg-success/10"
            : solid
              ? "h-7 gap-1.5 border-0 bg-success px-2.5 text-xs font-semibold text-white hover:bg-success/90 hover:text-white"
              : undefined
        }
      >
        <MessageCircle />
        {iconOnly ? <span className="sr-only">{label}</span> : label}
      </SubmitButton>
    </form>
  );
}
