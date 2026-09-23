"use server";

import { canAny } from "@/lib/rbac";
import { requireStaff } from "@/lib/session";
import { composeMergedMessage, mergedPaymentByRef } from "@/lib/merged-payment";

export type MergedNotifyResult =
  | { ok: true; message: string; phone: string | null; invoiceId: string }
  | { ok: false; error: string };

/**
 * WHAT "NOTIFY CUSTOMER" NEEDS BEFORE IT CAN OPEN WHATSAPP.
 *
 * `WhatsAppButton` opens the chat the instant it is clicked, with the text
 * already typed — a window opened after an `await` is a window every popup
 * blocker kills. So the message is fetched once the merge succeeds, while the
 * result panel is still on screen, and handed to the same button every other
 * Notify press on this app already uses.
 */
export async function getMergedNotifyMessage(
  transactionRef: string
): Promise<MergedNotifyResult> {
  const actor = await requireStaff();
  if (!canAny(actor.role, ["payment.submit", "finance.view"])) {
    return { ok: false, error: "Not your desk." };
  }

  const group = await mergedPaymentByRef(transactionRef);
  if (!group) return { ok: false, error: "That payment covers only one bill." };

  return {
    ok: true,
    message: composeMergedMessage(group),
    phone: group.customerPhone,
    invoiceId: group.lines[0].invoiceId,
  };
}
