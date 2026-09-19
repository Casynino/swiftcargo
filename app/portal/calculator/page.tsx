import type { Metadata } from "next";

import { PriceCalculator } from "@/components/site/price-calculator";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { publicRateBook } from "@/lib/public-estimate";
import { requireCustomer } from "@/lib/session";

export const metadata: Metadata = { title: "Shipping calculator" };

/**
 * The same calculator as the public site, priced by the server from the live
 * rate book and exchange rate — nothing here is a copy of a rate. "Book"
 * stays inside the portal, where the request is already the customer's.
 */
export default async function PortalCalculatorPage() {
  const locale = DEFAULT_LOCALE;
  await requireCustomer();
  const rates = await publicRateBook("LCL");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t(locale, "Shipping calculator")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(locale, "Estimated shipping cost. Final price is confirmed by Swift Cargo after cargo verification.")}
        </p>
      </header>
      <PriceCalculator cargoTypes={rates.map((r) => r.cargoType)} bookPath="/portal/book" />
    </div>
  );
}
