import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { FinanceTabs } from "@/components/app/finance-tabs";
import { PageHeader } from "@/components/app/page-header";
import { PriceList } from "@/components/app/price-list";
import { Card } from "@/components/ui/card";
import { can } from "@/lib/rbac";
import { priceListWaitingInChina, priceListWaitingInDar } from "@/lib/price-list";
import { requirePermission } from "@/lib/session";
import { cargoTypeOptions } from "@/lib/valuation";
import { localeOf } from "@/lib/viewer-locale";
import { t } from "@/lib/i18n";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "Confirm prices" };

/**
 * WHAT GUANGZHOU HAS MEASURED AND NOBODY HAS BILLED.
 *
 * A consignment does not need a container to be priced — the rate book works
 * it out the moment either floor measures it — so this list is not a stage of
 * a sailing, it is the door to every price nobody has confirmed yet that a
 * container page would never show. What has already gone onto a container is
 * priced from that container's own page instead: the two lists never repeat a
 * row.
 */
export default async function ConfirmPricesPage() {
  await primeLocale();
  const user = await requirePermission("finance.view");
  const mayConfirm = can(user.role, "invoice.priceConfirm");

  const [locale, cargoTypes, waitingInChina, waitingInDar] = await Promise.all([
    localeOf(user.id),
    mayConfirm ? cargoTypeOptions() : Promise.resolve([] as string[]),
    priceListWaitingInChina(),
    priceListWaitingInDar(),
  ]);

  const nothingWaiting =
    waitingInChina.rows.length === 0 && waitingInDar.rows.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Confirm prices"
        description="What Guangzhou has measured and nobody has billed. The rate book has already worked each one out; correct anything wrong on its row, then confirm the rest in one press."
      />
      <FinanceTabs />

      {nothingWaiting ? (
        <Card>
          <EmptyState
            icon="ClipboardCheck"
            title={t(locale, "Nothing is waiting for a price")}
            description={t(
              locale,
              "Cargo appears here as soon as it is measured — in China or at Dar — and has not yet gone onto a container."
            )}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <PriceList
            heading={
              <span className="font-medium text-foreground">
                {t(locale, "Still in China, not yet on a container")}
              </span>
            }
            containerId={null}
            list={waitingInChina}
            cargoTypes={cargoTypes}
            canConfirm={mayConfirm}
            locale={locale}
          />
          <PriceList
            heading={
              <span className="font-medium text-foreground">
                {t(locale, "In Dar with no container on record")}
              </span>
            }
            containerId={null}
            list={waitingInDar}
            cargoTypes={cargoTypes}
            canConfirm={mayConfirm}
            locale={locale}
          />
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {t(locale, "Cargo already on a container is priced from")}{" "}
        <Link
          href="/app/containers/arrived?view=pricing"
          className="font-medium text-brand hover:underline"
        >
          {t(locale, "Arrived containers")}
        </Link>
        .
      </p>
    </div>
  );
}
