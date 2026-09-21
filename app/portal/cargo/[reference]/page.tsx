import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Check, ChevronLeft, Circle, CircleDot, Ship, TriangleAlert, Truck } from "lucide-react";

import { DeliveryRequestForm } from "@/components/portal/delivery-request-form";
import { CargoPhotos } from "@/components/site/cargo-photos";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CUSTOMER_PHOTO_KINDS } from "@/lib/file-access";
import { formatCbm, formatDate, formatDateTime, formatWeight } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { owedAcross } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";
import { JOURNEY_INCLUDE, journeyOf } from "@/lib/tracking";
import { storageStart, storageState } from "@/lib/storage-clock";
import { CargoStatusStrip, StorageCard } from "@/components/portal/cargo-status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Cargo" };

export default async function PortalCargoPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const locale = DEFAULT_LOCALE;
  const user = await requireCustomer();
  const { reference } = await params;

  let wanted: string;
  try {
    wanted = decodeURIComponent(reference);
  } catch {
    notFound();
  }

  const cargo = await prisma.cargo.findFirst({
    where: {
      reference: wanted,
      deletedAt: null,
      OR: [{ senderId: user.customerId }, { receiverId: user.customerId }],
    },
    include: {
      ...JOURNEY_INCLUDE,
      chinaReceiving: { select: { packagesCount: true, cbm: true, weightKg: true } },
      photos: {
        where: { kind: { in: CUSTOMER_PHOTO_KINDS } },
        orderBy: { takenAt: "desc" },
        take: 12,
        select: { id: true, url: true, caption: true },
      },
      deliveryNote: { select: { number: true, issuedAt: true } },
      deliveryRequest: { select: { status: true, customerId: true } },
    },
  });
  if (!cargo) notFound();

  /*
    THE BILL IS THE RECEIVER'S.

    A sender sees their consignment move, but the invoice is addressed to the
    receiver and only the receiver may pay it, collect it or ask for it to be
    delivered. The amounts on this page are read from invoices on this
    customer's own account, never from every invoice on the cargo.
  */
  const isReceiver = cargo.receiverId === user.customerId;
  const invoices = await prisma.invoice.findMany({
    where: {
      cargoId: cargo.id,
      customerId: user.customerId,
      status: { notIn: ["DRAFT", "CANCELLED"] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      currency: true,
      fxRate: true,
      totalTzs: true,
      payments: {
        select: { status: true, amount: true, currency: true, fxRate: true, baseCurrencyAmount: true, creditedAmount: true },
      },
    },
  });

  const journey = journeyOf(cargo);
  const settings = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
    select: { freeStorageDays: true, storagePerDay: true, storageCurrency: true },
  });
  /* The clock runs from the day Dar booked the boxes in, until they leave. */
  const clockFrom = storageStart(cargo.darReceiving?.receivedAt, cargo.clearedAt);
  const storage =
    clockFrom && !["COLLECTED", "DELIVERED", "CANCELLED"].includes(cargo.status)
      ? storageState({
          arrivedAt: clockFrom,
          freeDays: settings?.freeStorageDays ?? 7,
          perDay: settings?.storagePerDay ?? null,
          currency: settings?.storageCurrency ?? "USD",
          now: new Date(),
        })
      : null;
  const container = cargo.containerLines.at(-1)?.container ?? null;
  const owed = owedAcross(invoices);
  const firstUnpaid = invoices.find((invoice) => owedAcross([invoice]).owes) ?? invoices[0];
  const ready = journey.ready;
  const arrivedAt = journey.steps.find((s) => s.key === "CLEARANCE")?.at ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/portal"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {t(locale, "My cargo")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="tnum text-2xl font-semibold tracking-tight">
            {cargo.reference}
          </h1>
          <p className="mt-1 break-words text-muted-foreground">{cargo.description}</p>
          {!isReceiver ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t(locale, "You sent this consignment. It is addressed to somebody else, who pays for it and collects it.")}
            </p>
          ) : null}
        </div>
        <Badge tone={journey.tone}>{t(locale, journey.headline)}</Badge>
      </div>

      <CargoStatusStrip journey={journey} />
      {storage ? <StorageCard storage={storage} /> : null}

      {journey.stage === "IN_CLEARANCE" || journey.stage === "WAREHOUSE_CLEARANCE" ? (
        <Card className="border-brand/30 bg-brand/5 p-5">
          <p className="font-medium text-brand">{t(locale, journey.headline)}</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {t(
              locale,
              "Your goods have arrived in Dar es Salaam and are going through customs clearance. They are not ready to collect yet — we will tell you as soon as clearance is complete."
            )}
          </p>
        </Card>
      ) : null}

      {journey.notice ? (
        <Card className="border-warning/30 bg-warning/5 p-5">
          <p className="flex items-center gap-2 font-medium text-warning">
            <TriangleAlert className="size-4" />
            {t(locale, journey.headline)}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">{t(locale, journey.notice)}</p>
        </Card>
      ) : ready && isReceiver ? (
        <Card className="border-success/30 bg-success/5 p-5">
          <p className="flex items-center gap-2 font-medium text-success">
            <Check className="size-4" />
            {t(locale, "Ready for pickup")}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {t(
              locale,
              "Cleared and paid. Bring your pickup note and ID to our Dar es Salaam warehouse, or ask us to deliver it below."
            )}
          </p>
        </Card>
      ) : owed.owes && firstUnpaid ? (
        <Card className="border-warning/30 bg-warning/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="tnum font-medium text-warning">
                {t(locale, "Amount due")}: {owed.primary}
                {owed.equivalent ? (
                  <span className="ml-1 text-sm font-normal text-muted-foreground">({owed.equivalent})</span>
                ) : null}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {!cargo.darReceiving || !cargo.clearedAt
                  ? t(locale, "You can pay now. Your cargo is ready to collect once it has cleared customs and your payment is confirmed.")
                  : t(locale, "Cleared — payment is required before pickup.")}
              </p>
            </div>
            <Link
              href={`/portal/invoices/${firstUnpaid.id}`}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90"
            >
              {t(locale, "See invoice and pay")}
            </Link>
          </div>
        </Card>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            [
              "Packages",
              String(
                cargo.darReceiving?.packagesCount ??
                  cargo.chinaReceiving?.packagesCount ??
                  "—"
              ),
            ],
            ["Volume", cargo.chinaReceiving ? formatCbm(cargo.chinaReceiving.cbm) : "—"],
            ["Weight", cargo.chinaReceiving?.weightKg ? formatWeight(cargo.chinaReceiving.weightKg) : "—"],
            ["Container", container?.reference ?? "—"],
          ] as const
        ).map(([label, value]) => (
          <Card key={label} className="min-w-0 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t(locale, label)}
            </dt>
            <dd className="tnum mt-1.5 truncate text-sm font-semibold" title={value}>
              {value}
            </dd>
          </Card>
        ))}
      </dl>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t(locale, "Journey")}</CardTitle>
          {journey.eta ? (
            <p className="tnum mt-1 text-sm text-muted-foreground">
              {journey.etaPassed
                ? t(locale, "Running later than planned — we will update the date")
                : `${t(locale, "Expected in Dar es Salaam")} ${formatDate(journey.eta)}`}
            </p>
          ) : arrivedAt ? (
            <p className="tnum mt-1 text-sm text-muted-foreground">
              {t(locale, "Arrived in Dar es Salaam")} {formatDate(arrivedAt)}
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          <ol>
            {journey.steps.map((step, i) => (
              <li key={step.key} className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full border-2",
                      step.state === "done" && "border-brand bg-brand text-brand-foreground",
                      step.state === "current" && "border-signal bg-signal text-signal-foreground",
                      step.state === "upcoming" && "border-border bg-background"
                    )}
                  >
                    {step.state === "done" ? (
                      <Check className="size-3.5" />
                    ) : step.state === "current" ? (
                      <CircleDot className="size-3.5" />
                    ) : (
                      <Circle className="size-2 text-muted-foreground" />
                    )}
                  </span>
                  {i < journey.steps.length - 1 ? (
                    <span
                      className={cn("w-0.5 flex-1", step.state === "done" ? "bg-brand" : "bg-border")}
                      style={{ minHeight: 22 }}
                    />
                  ) : null}
                </div>
                <div className="min-w-0 pb-5">
                  <p
                    className={cn(
                      "text-sm",
                      step.state === "current"
                        ? "font-semibold"
                        : step.state === "done"
                          ? "font-medium"
                          : "text-muted-foreground"
                    )}
                  >
                    {t(locale, step.label)}
                  </p>
                  {/* Every date says what it is the date of. */}
                  {step.at ? (
                    <p className="tnum text-xs text-muted-foreground">
                      {t(locale, step.atLabel)}{" "}
                      {step.key === "AT_SEA" ? formatDate(step.at) : formatDateTime(step.at)}
                    </p>
                  ) : null}
                  {step.detail ? (
                    <p className="text-xs font-medium text-brand">{t(locale, step.detail)}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          {container?.shipment?.vessel ? (
            <p className="flex items-center gap-2 border-t pt-5 text-sm text-muted-foreground">
              <Ship className="size-4 shrink-0 text-marine" />
              {container.shipment.vessel}
              {container.shipment.voyage ? ` · ${container.shipment.voyage}` : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {cargo.photos.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t(locale, "Photos of your cargo")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="-mt-2 mb-3 text-xs text-muted-foreground">
              {t(locale, "Tap to view and download.")}
            </p>
            <CargoPhotos
              reference={cargo.reference}
              photos={cargo.photos.map((photo) => ({
                ...photo,
                url: `${photo.url}?ref=${encodeURIComponent(cargo.reference)}`,
              }))}
            />
          </CardContent>
        </Card>
      ) : null}

      {ready && isReceiver ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <span className="inline-flex items-center gap-2">
                <Truck className="size-4 text-marine" />
                {t(locale, "Would you like it delivered?")}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargo.deliveryRequest ? (
              <p className="text-sm text-muted-foreground">
                {t(locale, "Requested — status:")}{" "}
                <span className="font-medium">
                  {cargo.deliveryRequest.status.replace(/_/g, " ").toLowerCase()}
                </span>
                . {t(locale, "We will call you to confirm the time and charge.")}
              </p>
            ) : (
              <DeliveryRequestForm cargoId={cargo.id} />
            )}
          </CardContent>
        </Card>
      ) : null}

      {cargo.deliveryNote ? (
        <p className="tnum text-sm text-muted-foreground">
          {t(locale, "Delivery note")} {cargo.deliveryNote.number}, {t(locale, "issued")}{" "}
          {formatDate(cargo.deliveryNote.issuedAt)}.
        </p>
      ) : null}
    </div>
  );
}
