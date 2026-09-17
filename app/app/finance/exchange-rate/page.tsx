import { redirect } from "next/navigation";

/* The exchange rate is part of the rate book: it is one of the figures every
   bill is priced from, and it is set in the same place as the rest. */
export default function ExchangeRateRedirect() {
  redirect("/app/finance/rates#exchange-rate");
}
