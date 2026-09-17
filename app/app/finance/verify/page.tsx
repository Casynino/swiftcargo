import { redirect } from "next/navigation";

/* Verifying lives under Collections now, beside the call list and what was
   sent back — one job seen from three sides. Old links still land. */
export default function VerifyRedirect() {
  redirect("/app/finance/collections/verify");
}
