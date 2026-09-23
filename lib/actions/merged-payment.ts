"use server";

import { canAny } from "@/lib/rbac";
import { requireStaff } from "@/lib/session";
import { composeMergedMessage, mergedGroupByInvoiceIds } from "@/lib/merged-payment";

export type MergedNotifyResult =
  | { ok: true; message: string; phone: string | null; invoiceId: string }
  | { ok: false; error: string };

/**
 * WHAT "NOTIFY ON WHATSAPP" NEEDS BEFORE IT CAN OPEN THE CHAT.
 *
 * `WhatsAppButton`'s own trick — open the chat from the click itself, before
 * any `await` — does not fit here: the message has to reflect whatever is
 * ticked *right now*, which only exists once the clerk has actually ticked
 * it. The caller opens a blank tab synchronously on the click, then points it
 * here once this resolves, so a popup blocker never sees the gap.
 */
export async function getMergedNotifyMessage(
  invoiceIds: string[]
): Promise<MergedNotifyResult> {
  const actor = await requireStaff();
  if (!canAny(actor.role, ["payment.submit", "finance.view"])) {
    return { ok: false, error: "Not your desk." };
  }

  const group = await mergedGroupByInvoiceIds(invoiceIds);
  if (!group) return { ok: false, error: "Tick at least two bills first." };

  return {
    ok: true,
    message: composeMergedMessage(group),
    phone: group.customerPhone,
    invoiceId: group.lines[0]!.invoiceId,
  };
}
