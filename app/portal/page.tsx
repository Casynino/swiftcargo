import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, MapPin, Package, Ship } from "lucide-react";

import { CopyField } from "@/components/app/copy-field";
import { EmptyState } from "@/components/app/empty-state";
import { KpiCard } from "@/components/app/kpi-card";
import { SectionLabel } from "@/components/app/section-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTE } from "@/lib/constants";
import { formatCbm, formatDate } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { owedAcross } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";
import { JOURNEY_INCLUDE, journeyOf } from "@/lib/tracking";

export const metadata: Metadata = { title: "My cargo" };

/**
 * The customer's own screen.
 *
 * Every query here is scoped by the customerId on the session — never by
 * anything that arrived in the request. That is the whole defence against
 * somebody changing a number in the address bar, and it works precisely because
 * the number is never read.
 */
export default async function PortalPage() {
  const locale = DEFAULT_LOCALE;
  const user = await requireCustomer();

  const [customer, cargo, company] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: user.customerId },
      select: {
        shippingMark: true,
        /* Their own bills only. On a consignment they sent to somebody else,
           the invoice is the receiver's business, not theirs. */
        invoices: {
          where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
          select: {
            cargoId: true,
            status: true,
            total: true,
            currency: true,
            fxRate: true,
            totalTzs: true,
            payments: {
              select: { status: true, amount: true, currency: true, fxRate: true, baseCurrencyAmount: true, creditedAmount: true },
            },
          },
        },
      },
    }),
    prisma.cargo.findMany({
      where: {
        deletedAt: null,
        OR: [{ senderId: user.customerId }, { receiverId: user.customerId }],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        ...JOURNEY_INCLUDE,
        chinaReceiving: { select: { packagesCount: true, cbm: true } },
      },
    }),
    prisma.companySetting.findUnique({
      where: { id: "singleton" },
      select: { chinaAddress: true },
    }),
  ]);

  const ownInvoices = customer?.invoices ?? [];
  const owed = owedAcross(ownInvoices);

  const now = new Date();
  const rows = cargo.map((item) => ({
    item,
    journey: journeyOf(item, now),
    owed: owedAcross(ownInvoices.filter((invoice) => invoice.cargoId === item.id)),
  }));

  const onTheWay = rows.filter(
    (r) =>
      !["COLLECTED", "DELIVERED", "CANCELLED"].includes(r.item.status) &&
      !r.journey.ready
  );
  const ready = rows.filter(
    (r) =>
      r.journey.ready &&
      r.item.receiverId === user.customerId
  );

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow text-marine">
          {ROUTE.originCity} → {ROUTE.destinationCity}
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">
          {t(locale, "Hello,")} {user.name.split(" ")[0]}
        </h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          label={t(locale, "Cargo on the way")}
          numeric={onTheWay.length}
          icon={Package}
          tone="brand"
          hint={t(locale, "Booked or moving, not yet ready to collect")}
        />
        <KpiCard
          index={1}
          label={t(locale, "Ready to collect")}
          numeric={ready.length}
          icon={Ship}
          tone={ready.length > 0 ? "success" : "marine"}
          hint={ready.length > 0 ? t(locale, "Everything settled") : t(locale, "Nothing waiting")}
        />
        <KpiCard
          index={2}
          label={t(locale, "Outstanding")}
          value={owed.primary}
          tone={owed.owes ? "warning" : "success"}
          hint={
            owed.equivalent
              ? `${owed.equivalent} · ${t(locale, "across all your invoices")}`
              : t(locale, "Across all your invoices")
          }
          href="/portal/invoices"
        />
        <KpiCard
          index={3}
          label={t(locale, "Consignments in total")}
          numeric={cargo.length}
          icon={Package}
          tone="marine"
        />
      </div>

      {/* The most useful thing on the page for a new customer. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t(locale, "Send this to your supplier")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t(locale, "Your shipping mark")}
            </p>
            <div className="mt-2">
              <CopyField value={customer?.shippingMark ?? "—"} label="shipping mark" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t(locale, "This must be written on every box. Without it we cannot tell whose cargo has arrived.")}
            </p>
          </div>

          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <MapPin className="size-3.5" />
              {t(locale, "Our Guangzhou warehouse")}
            </p>
            <div className="mt-2">
              <CopyField
                value={company?.chinaAddress ?? t(locale, "Ask us for the address")}
                label="warehouse address"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t(locale, "Your supplier delivers here.")}
            </p>
          </div>
        </CardContent>
      </Card>

      <section>
        <SectionLabel count={ready.length}>{t(locale, "Your cargo")}</SectionLabel>

        {cargo.length === 0 ? (
          <Card>
            <EmptyState
              icon="Package"
              title={t(locale, "Nothing yet")}
              description={t(locale, "Once your supplier delivers to our Guangzhou warehouse, your cargo appears here.")}
              action={
                <Button asChild>
                  <Link href="/quote">
                    {t(locale, "Get a quote")}
                    <ArrowRight />
                  </Link>
                </Button>
              }
            />
          </Card>
        ) : (
          <ul className="grid gap-4">
            {rows.map(({ item, journey, owed: itemOwed }) => {
              const container = item.containerLines.at(-1)?.container;
              const arrivedAt = journey.steps.find((s) => s.key === "ARRIVED_DAR")?.at ?? null;

              return (
                <li key={item.id}>
                  <Link
                    href={`/portal/cargo/${encodeURIComponent(item.reference)}`}
                    className="focus-ring block rounded-xl"
                  >
                    <Card className="p-5 transition-all hover:-translate-y-0.5 hover:shadow-raised">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="tnum font-semibold">{item.reference}</p>
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">
                            {item.description}
                          </p>
                        </div>
                        <Badge tone={journey.tone}>{t(locale, journey.headline)}</Badge>
                      </div>

                      <dl className="mt-4 grid grid-cols-2 gap-4 border-t pt-4 text-sm sm:grid-cols-4">
                        {(
                          [
                            [
                              "Packages",
                              String(
                                item.darReceiving?.packagesCount ??
                                  item.chinaReceiving?.packagesCount ??
                                  "—"
                              ),
                            ],
                            ["Volume", item.chinaReceiving ? formatCbm(item.chinaReceiving.cbm) : "—"],
                            ["Container", container?.reference ?? "—"],
                            journey.eta
                              ? ["Expected", formatDate(journey.eta)]
                              : ["Arrived", formatDate(arrivedAt)],
                          ] as const
                        ).map(([label, value]) => (
                          <div key={label} className="min-w-0">
                            <dt className="text-xs text-muted-foreground">{t(locale, label)}</dt>
                            <dd className="tnum mt-0.5 truncate font-medium">{value}</dd>
                          </div>
                        ))}
                      </dl>

                      {itemOwed.owes ? (
                        <p className="tnum mt-4 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
                          {itemOwed.primary} {t(locale, "due")}
                          {itemOwed.equivalent ? ` (${itemOwed.equivalent})` : ""}
                        </p>
                      ) : null}
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
