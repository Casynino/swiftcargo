import { redirect } from "next/navigation";

/**
 * THERE IS NO LIST OF BILLS OF ITS OWN.
 *
 * A bill is never looked at in the abstract — it is looked at because somebody
 * owes on it, which is Collections, or because somebody is standing at the
 * counter with the cargo, which is the cargo page. A third list showing the
 * same rows a third way is a third place to read a different number from.
 *
 * The kept route is `/app/finance/invoices/<id>`: one bill, reached from
 * whichever of those two screens the question came from.
 */
export default function InvoicesPage() {
  redirect("/app/finance/collections");
}
