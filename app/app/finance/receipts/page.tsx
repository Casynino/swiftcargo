import { redirect } from "next/navigation";

/**
 * NOBODY GOES LOOKING FOR A LIST OF RECEIPTS.
 *
 * What a customer is handed once they have paid is the pickup note — that is
 * the document the Dar counter scans and the only one anybody asks for by name.
 *
 * Receipts are still minted the moment a payment is verified: they are the
 * record standing behind money the business says it counted, and the customer
 * holds one. They are reached from the payment and from the bill, which is
 * where the question "what was this receipt for" is always asked from.
 */
export default function ReceiptsPage() {
  redirect("/app/finance/pickup-notes");
}
