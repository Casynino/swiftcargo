import Link from "next/link";
import type { Metadata } from "next";
import { Box, ClipboardList, Container, FileCheck, Truck, Weight, type LucideIcon } from "lucide-react";

import { BookingForm, PickupForm } from "@/components/site/request-forms";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SERVICE_LABEL } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { formatTzPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { publicRateBook } from "@/lib/public-estimate";
import { ARRIVAL_CAVEAT, publicSailings } from "@/lib/sailing-schedule";
import { requireCustomer } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { RequestStatus } from "@prisma/client";

export const metadata: Metadata = { title: "Book / request" };

type Choice = "SHARED_CARGO" | "FULL_CONTAINER" | "SPECIAL_CARGO" | "CUSTOMS_CLEARANCE" | "pickup";

const CHOICES: { key: Choice; label: string; hint: string; icon: LucideIcon }[] = [
  { key: "SHARED_CARGO", label: "Loose cargo", hint: "Share a container, pay by the CBM", icon: Box },
  { key: "FULL_CONTAINER", label: "Full container", hint: "A whole 20ft or 40ft box", icon: Container },
  { key: "pickup", label: "China pickup", hint: "We collect from your supplier", icon: Truck },
  { key: "SPECIAL_CARGO", label: "Special cargo", hint: "Machines, heavy or odd shapes", icon: Weight },
  { key: "CUSTOMS_CLEARANCE", label: "Customs clearance", hint: "Clearing at Dar port", icon: FileCheck },
];

/**
 * Where a request stands, in the words of the list the customer was promised.
 * A figure from Support turns "under review" into "quote ready": a request is
 * not a shipment, and the quote is the thing they are waiting for.
 */
function stateOf(status: RequestStatus, quoted: boolean): { label: string; tone: "neutral" | "progress" | "good" | "warn" | "bad" } {
  switch (status) {
    case "SUBMITTED":
      return { label: "Request submitted", tone: "neutral" };
    case "UNDER_REVIEW":
      return quoted ? { label: "Quote ready", tone: "warn" } : { label: "Under review", tone: "progress" };
    case "APPROVED":
      return { label: "Confirmed", tone: "good" };
    case "SCHEDULED":
      return { label: "In progress", tone: "progress" };
    case "COMPLETED":
      return { label: "Completed", tone: "good" };
    case "REJECTED":
      return { label: "Declined", tone: "bad" };
    default:
      return { label: "Cancelled", tone: "neutral" };
  }
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; sailing?: string; commodity?: string; cbm?: string }>;
}) {
  const locale = DEFAULT_LOCALE;
  const user = await requireCustomer();
  const params = await searchParams;

  const choice: Choice =
    params.service === "pickup"
      ? "pickup"
      : CHOICES.some((c) => c.key === params.service)
        ? (params.service as Choice)
        : "SHARED_CARGO";

  const [customer, sailings, rates, bookings, pickups] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: user.customerId },
      select: { fullName: true, phone: true, email: true },
    }),
    publicSailings({ count: 6 }),
    publicRateBook("LCL"),
    prisma.containerBooking.findMany({
      where: { customerId: user.customerId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        reference: true,
        type: true,
        status: true,
        commodity: true,
        createdAt: true,
        quotedAmount: true,
        quotedCurrency: true,
        preferredSailingDate: true,
      },
    }),
    prisma.pickupRequest.findMany({
      where: { customerId: user.customerId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        reference: true,
        status: true,
        pickupLocation: true,
        city: true,
        createdAt: true,
        scheduledDate: true,
        preferredDate: true,
      },
    }),
  ]);

  const contact = {
    name: customer?.fullName,
    phone: customer?.phone ? formatTzPhone(customer.phone) : undefined,
    email: customer?.email ?? undefined,
  };

  const options = sailings
    .filter((s) => s.bookingOpen)
    .map((s) => ({
      departure: s.departureDate.toISOString().slice(0, 10),
      label: `${t(locale, "Sails")} ${formatDate(s.departureDate)} — ${t(locale, "cargo in by")} ${formatDate(s.cargoDeadline)}`,
    }));

  const requests = [
    ...bookings.map((b) => ({
      id: b.id,
      reference: b.reference,
      what: SERVICE_LABEL[b.type],
      detail: [b.commodity, b.preferredSailingDate ? `${t(locale, "sailing")} ${formatDate(b.preferredSailingDate)}` : null]
        .filter(Boolean)
        .join(" · "),
      at: b.createdAt,
      state: stateOf(b.status, b.quotedAmount != null),
      quote: b.quotedAmount != null ? formatMoney(b.quotedAmount, b.quotedCurrency) : null,
    })),
    ...pickups.map((p) => ({
      id: p.id,
      reference: p.reference,
      what: "China pickup",
      detail: [
        p.city ?? p.pickupLocation,
        p.scheduledDate
          ? `${t(locale, "collecting")} ${formatDate(p.scheduledDate)}`
          : p.preferredDate
            ? `${t(locale, "asked for")} ${formatDate(p.preferredDate)}`
            : null,
      ]
        .filter(Boolean)
        .join(" · "),
      at: p.createdAt,
      state: stateOf(p.status, false),
      quote: null,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t(locale, "Book / request a service")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(locale, "A request is not yet a shipment — we look at it, come back to you, and confirm.")}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {CHOICES.map((c) => (
          <Link
            key={c.key}
            href={`/portal/book?service=${c.key === "pickup" ? "pickup" : c.key}`}
            scroll={false}
            aria-current={choice === c.key ? "true" : undefined}
            className={cn(
              "focus-ring flex flex-col gap-1.5 rounded-xl border bg-card p-3 transition-all",
              choice === c.key ? "border-brand ring-2 ring-brand/30" : "hover:border-brand/40"
            )}
          >
            <c.icon className={cn("size-5", choice === c.key ? "text-brand" : "text-muted-foreground")} />
            <span className="text-sm font-semibold leading-tight">{t(locale, c.label)}</span>
            <span className="text-[11px] leading-tight text-muted-foreground">{t(locale, c.hint)}</span>
          </Link>
        ))}
      </div>

      <section className="max-w-3xl">
        {choice === "pickup" ? (
          <PickupForm key="pickup" cargoTypes={rates.map((r) => r.cargoType)} contact={contact} />
        ) : (
          <>
            <BookingForm
              key={choice}
              sailings={options}
              cargoTypes={rates.map((r) => r.cargoType)}
              contact={contact}
              defaults={{
                service: choice,
                sailing: params.sailing?.slice(0, 10),
                commodity: params.commodity?.slice(0, 120),
                cbm: params.cbm?.slice(0, 20),
              }}
            />
            <p className="mt-3 text-xs text-muted-foreground">{t(locale, ARRIVAL_CAVEAT)}</p>
          </>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t(locale, "My requests")}
        </h2>
        {requests.length === 0 ? (
          <Card className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
            <ClipboardList className="size-5 shrink-0" />
            {t(locale, "No active bookings. Requests you send appear here with their status.")}
          </Card>
        ) : (
          <Card className="divide-y">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    <span className="tnum">{r.reference}</span> · {t(locale, r.what)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t(locale, "Sent")} {formatDate(r.at)}
                    {r.detail ? ` · ${r.detail}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {r.quote ? <span className="tnum text-sm font-semibold">{r.quote}</span> : null}
                  <Badge tone={r.state.tone}>{t(locale, r.state.label)}</Badge>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
