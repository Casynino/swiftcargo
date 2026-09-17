import { redirect } from "next/navigation";

/*
  THERE IS NO PAYMENTS PAGE.

  Recording a payment is a dialog that opens over whatever screen the desk is
  on, and the payments themselves are read where they matter: waiting ones on
  Verify payments, counted ones on the general ledger. A third list of the same
  rows was a page somebody landed on by accident with the dialog on top of it.
*/
export default function PaymentsRedirect() {
  redirect("/app/finance/collections/verify");
}
