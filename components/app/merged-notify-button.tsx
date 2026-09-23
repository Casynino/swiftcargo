"use client";

import { useState, useTransition } from "react";
import { MessageCircle } from "lucide-react";

import { getMergedNotifyMessage } from "@/lib/actions/merged-payment";
import { logCustomerContact } from "@/lib/actions/messages";

/**
 * "NOTIFY ON WHATSAPP", FOR WHATEVER IS CURRENTLY TICKED.
 *
 * Sent before the money moves — every ticked bill, the combined total, and
 * "Haijalipwa" until it is not. The message has to reflect what is ticked at
 * the moment of the click, so unlike the ordinary `WhatsAppButton` this cannot
 * open the chat from the click itself: it opens a blank tab synchronously
 * (still inside the click, so no popup blocker touches it) and points that tab
 * at WhatsApp once the message comes back.
 */
export function MergedNotifyButton({ invoiceIds }: { invoiceIds: string[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    const win = window.open("", "_blank");
    startTransition(async () => {
      const result = await getMergedNotifyMessage(invoiceIds);
      if (!result.ok) {
        win?.close();
        setError(result.error);
        return;
      }
      if (!result.phone) {
        win?.close();
        setError("This customer has no WhatsApp number on file.");
        return;
      }
      if (win) {
        win.location.href = `https://wa.me/${result.phone}?text=${encodeURIComponent(result.message)}`;
      }
      const body = new FormData();
      body.set("invoiceId", result.invoiceId);
      body.set("kind", "payment.reminder");
      body.set("channel", "WHATSAPP");
      body.set("body", result.message);
      await logCustomerContact({}, body);
    });
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold hover:bg-secondary disabled:opacity-50"
      >
        <MessageCircle className="size-3.5" />
        {pending ? "Preparing…" : "Notify on WhatsApp"}
      </button>
      {error ? <span className="text-[11px] text-destructive">{error}</span> : null}
    </span>
  );
}
