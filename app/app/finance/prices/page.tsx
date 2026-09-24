import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { FinanceTabs } from "@/components/app/finance-tabs";
import { PageHeader } from "@/components/app/page-header";
import { PriceList } from "@/components/app/price-list";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import {
  priceListForContainer,
  priceListWaitingInChina,
  priceListWaitingInDar,
} from "@/lib/price-list";
import { requirePermission } from "@/lib/session";
import { cargoTypeOptions } from "@/lib/valuation";
import { localeOf } from "@/lib/viewer-locale";
import { t } from "@/lib/i18n";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "Confirm prices" };

/**
 * WHAT GUANGZHOU HAS MEASURED AND NOBODY HAS BILLED.
 *
 * A consignment does not need to sail to be priced — the rate book works it
 * out the moment either floor measures it. So this page holds everything
 * waiting that no sailing's list will ever show: cargo with no container, and
 * cargo in a box that is still in Guangzhou. A container that has left is
 * priced from Arrived containers instead; the two pages never repeat a row.
 */
const STILL_IN_GUANGZHOU = ["OPEN", "LOADING", "LOADED", "SEALED"] as const;

export default async function ConfirmPricesPage() {
  await primeLocale();
  const user = await requirePermission("finance.view");
  const mayConfirm = can(user.role, "invoice.priceConfirm");

  const loadingBoxes = await prisma.container.findMany({
    where: { deletedAt: null, status: { in: [...STILL_IN_GUANGZHOU] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, reference: true },
  });

  const [locale, cargoTypes, waitingInChina, waitingInDar, perContainer] = await Promise.all([
    localeOf(user.id),
    mayConfirm ? cargoTypeOptions() : Promise.resolve([] as string[]),
    priceListWaitingInChina(),
    priceListWaitingInDar(),
    Promise.all(
      loadingBoxes.map(async (box) => ({ box, list: await priceListForContainer(box.id) }))
    ),
  ]);

  const nothingWaiting =
    waitingInChina.rows.length === 0 &&
    waitingInDar.rows.length === 0 &&
    perContainer.every(({ list }) => list.rows.length === 0);

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
              "Cargo appears here as soon as it is measured — in China or at Dar — until its container sails."
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
          {perContainer.map(({ box, list }) => (
            <PriceList
              key={box.id}
              heading={
                <span className="text-foreground">
                  {t(locale, "In a container still in Guangzhou")} ·{" "}
                  <Link
                    href={`/app/containers/${box.id}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {box.reference}
                  </Link>
                </span>
              }
              containerId={box.id}
              list={list}
              cargoTypes={cargoTypes}
              canConfirm={mayConfirm}
              locale={locale}
            />
          ))}
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
        {t(locale, "Cargo on a container that has sailed is priced from")}{" "}
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
