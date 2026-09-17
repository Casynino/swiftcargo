import { redirect } from "next/navigation";

/* The rate book is one thing, and Finance owns it. The admin menu points here
   because that is where people look for it; there is no second copy to drift. */
export default function AdminRatesPage() {
  redirect("/app/finance/rates");
}
