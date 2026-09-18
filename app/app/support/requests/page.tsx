import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import { RequestControls } from "@/components/app/request-controls";
import {
  AssignControl,
  ConvertControl,
  LinkCargoControl,
  QuoteControl,
  RequestFiles,
  ScheduleControl,
} from "@/components/app/request-desk";
import { SectionLabel } from "@/components/app/section-label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ROLE_LABELS, SERVICE_LABEL } from "@/lib/constants";
import { formatCurrency } from "@/lib/currency";
import { formatCbm, formatDate, formatRelative } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Website requests" };

const TONE: Record<string, "neutral" | "progress" | "good" | "warn" | "bad"> = {
  SUBMITTED: "warn",
  UNDER_REVIEW: "progress",
  APPROVED: "progress",
  SCHEDULED: "progress",
  COMPLETED: "good",
  REJECTED: "bad",
  CANCELLED: "neutral",
};

const iso = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

/** A line of "label: value", skipping everything nobody filled in. */
function Facts({ items }: { items: [string, string | null | undefined][] }) {
  const shown = items.filter(([, value]) => value);
  if (shown.length === 0) return null;
  return (
    <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
      {shown.map(([label, value]) => (
        <div key={label} className="flex gap-1.5">
          <dt className="shrink-0">{label}:</dt>
          <dd className="tnum text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * WHAT CAME IN OFF THE WEBSITE.
 *
 * None of it is cargo, a container or a confirmed pickup. Each row is somebody
 * asking, and a member of staff turns it into a real record — or does not. The
 * two things that make one operational are on the row: attaching a service
 * request to a customer, and attaching a collection to the consignment the
 * counter raised when the boxes actually arrived.
 *
 * Guangzhou reads this screen too, because the van goes from there. It carries
 * no money for that reason — a quotation shows against a service request, which
 * is Support's and the office's work, and the collections China works do not
 * have one.
 */
export default async function RequestsPage() {
  const viewer = await requirePermission("request.view");
  const china = viewer.role === "CHINA_WAREHOUSE";

  const [quotes, pickups, bookings, staff] = await Promise.all([
    prisma.quoteRequest.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.pickupRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        assignedTo: { select: { name: true } },
        cargo: { select: { reference: true } },
        documents: {
          orderBy: { createdAt: "asc" },
          select: { id: true, url: true, kind: true, label: true },
        },
      },
    }),
    prisma.containerBooking.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        assignedTo: { select: { name: true } },
        convertedCustomer: { select: { code: true, fullName: true } },
        documents: {
          orderBy: { createdAt: "asc" },
          select: { id: true, url: true, kind: true, label: true },
        },
      },
    }),
    prisma.user.findMany({
      where: { active: true, status: "ACTIVE", role: { not: "CUSTOMER" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
      take: 100,
    }),
  ]);

  const staffOptions = staff.map((person) => ({
    id: person.id,
    name: person.name,
    role: ROLE_LABELS[person.role],
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Website requests"
        description="Collections, service enquiries and quotes. Nothing here is confirmed until somebody here confirms it, and nothing here is cargo until a counter takes the goods in."
      />
      <SectionTabs />

      <section>
        <SectionLabel count={pickups.filter((p) => p.status === "SUBMITTED").length}>
          China pickup requests
        </SectionLabel>
        {pickups.length === 0 ? (
          <Card>
            <EmptyState icon="Truck" title="No pickup requests" />
          </Card>
        ) : (
          <ul className="space-y-3">
            {pickups.map((pickup) => (
              <li key={pickup.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="tnum font-medium">{pickup.reference}</span>
                        <Badge tone={TONE[pickup.status]}>
                          {pickup.status.replace(/_/g, " ").toLowerCase()}
                        </Badge>
                        {pickup.assignedTo ? (
                          <Badge tone="neutral">{pickup.assignedTo.name}</Badge>
                        ) : null}
                      </p>
                      <p className="mt-1 text-sm">
                        {pickup.contactName} · {pickup.contactPhone}
                        {pickup.contactWhatsapp ? ` · WhatsApp ${pickup.contactWhatsapp}` : ""}
                        {pickup.contactEmail ? ` · ${pickup.contactEmail}` : ""}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {pickup.supplierName ? `${pickup.supplierName} — ` : ""}
                        {pickup.pickupLocation}
                        {pickup.city ? `, ${pickup.city}` : ""}
                      </p>
                      <Facts
                        items={[
                          ["Ask for", pickup.supplierContact],
                          ["Goods", pickup.commodity],
                          ["Mark", pickup.shippingMark],
                          ["Packages", pickup.packages ? String(pickup.packages) : null],
                          ["Est. volume", pickup.estimatedCbm ? formatCbm(pickup.estimatedCbm) : null],
                          [
                            "Est. weight",
                            pickup.estimatedWeightKg ? `${pickup.estimatedWeightKg} kg` : null,
                          ],
                          [
                            "Wants",
                            pickup.preferredDate
                              ? `${formatDate(pickup.preferredDate)}${pickup.preferredTime ? ` · ${pickup.preferredTime}` : ""}`
                              : null,
                          ],
                          [
                            "We go",
                            pickup.scheduledDate ? formatDate(pickup.scheduledDate) : null,
                          ],
                        ]}
                      />
                      {pickup.cargoDescription ? (
                        <p className="mt-2 rounded-md bg-secondary px-3 py-2 text-xs">
                          {pickup.cargoDescription}
                        </p>
                      ) : null}
                      {pickup.notes ? (
                        <p className="mt-2 rounded-md bg-secondary px-3 py-2 text-xs">
                          {pickup.notes}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatRelative(pickup.createdAt)}
                    </p>
                  </div>
                  <div className="mt-4 space-y-3 border-t pt-4">
                    <RequestControls
                      kind="pickup"
                      id={pickup.id}
                      status={pickup.status}
                      notes={pickup.staffNotes}
                    />
                    <AssignControl
                      kind="pickup"
                      id={pickup.id}
                      assignedToId={pickup.assignedToId}
                      staff={staffOptions}
                    />
                    <ScheduleControl
                      id={pickup.id}
                      scheduledDate={iso(pickup.scheduledDate)}
                    />
                    <LinkCargoControl
                      id={pickup.id}
                      cargoReference={pickup.cargo?.reference ?? null}
                    />
                    <RequestFiles pickupRequestId={pickup.id} files={pickup.documents} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionLabel count={bookings.filter((b) => b.status === "SUBMITTED").length}>
          Service requests
        </SectionLabel>
        {bookings.length === 0 ? (
          <Card>
            <EmptyState icon="Container" title="No service requests" />
          </Card>
        ) : (
          <ul className="space-y-3">
            {bookings.map((booking) => (
              <li key={booking.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="tnum font-medium">{booking.reference}</span>
                        <Badge tone={TONE[booking.status]}>
                          {booking.status.replace(/_/g, " ").toLowerCase()}
                        </Badge>
                        <Badge tone="neutral">{SERVICE_LABEL[booking.type]}</Badge>
                        {booking.assignedTo ? (
                          <Badge tone="neutral">{booking.assignedTo.name}</Badge>
                        ) : null}
                      </p>
                      <p className="mt-1 text-sm">
                        {booking.contactName} · {booking.contactPhone}
                        {booking.contactEmail ? ` · ${booking.contactEmail}` : ""}
                      </p>
                      <Facts
                        items={[
                          ["Cargo", booking.commodity],
                          ["From", booking.originCity ?? booking.pickupAddress],
                          ["To", booking.destination],
                          [
                            "Ready",
                            booking.readinessDate ? formatDate(booking.readinessDate) : null,
                          ],
                          ["Supplier", booking.supplierName],
                          ["Container", booking.containerType?.replace("_", " ")],
                          ["Packages", booking.packages ? String(booking.packages) : null],
                          ["Units", booking.quantity ? String(booking.quantity) : null],
                          [
                            "Est. volume",
                            booking.estimatedCbm ? formatCbm(booking.estimatedCbm) : null,
                          ],
                          [
                            "Est. weight",
                            booking.estimatedWeightKg ? `${booking.estimatedWeightKg} kg` : null,
                          ],
                          ["Dimensions", booking.dimensions],
                          [
                            "Sailing",
                            booking.preferredSailingWeek
                              ? formatDate(booking.preferredSailingWeek)
                              : booking.preferredShipment,
                          ],
                          ["Port", booking.portOfDischarge],
                          ["Shipment ref", booking.shipmentRef],
                          [
                            "Declared value",
                            booking.declaredValue
                              ? formatCurrency(booking.declaredValue, booking.declaredValueCurrency)
                              : null,
                          ],
                          [
                            "Conditions",
                            [
                              booking.dangerousGoods ? "hazardous" : null,
                              booking.fragile ? "fragile" : null,
                              booking.perishable ? "perishable" : null,
                            ]
                              .filter(Boolean)
                              .join(", ") || null,
                          ],
                          [
                            "Quoted",
                            booking.quotedAmount
                              ? formatCurrency(booking.quotedAmount, booking.quotedCurrency)
                              : null,
                          ],
                        ]}
                      />
                      {booking.handling ? (
                        <p className="mt-2 rounded-md bg-secondary px-3 py-2 text-xs">
                          Handling: {booking.handling}
                        </p>
                      ) : null}
                      {booking.requirements ? (
                        <p className="mt-2 rounded-md bg-secondary px-3 py-2 text-xs">
                          {booking.requirements}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatRelative(booking.createdAt)}
                    </p>
                  </div>
                  <div className="mt-4 space-y-3 border-t pt-4">
                    <RequestControls
                      kind="booking"
                      id={booking.id}
                      status={booking.status}
                      notes={booking.staffNotes}
                    />
                    <AssignControl
                      kind="booking"
                      id={booking.id}
                      assignedToId={booking.assignedToId}
                      staff={staffOptions}
                    />
                    <RequestFiles bookingId={booking.id} files={booking.documents} />
                    {china ? null : (
                      <>
                        <QuoteControl
                          id={booking.id}
                          quotedAmount={
                            booking.quotedAmount ? booking.quotedAmount.toString() : null
                          }
                          quotedCurrency={booking.quotedCurrency}
                        />
                        <ConvertControl
                          id={booking.id}
                          status={booking.status}
                          convertedTo={
                            booking.convertedCustomer
                              ? {
                                  code: booking.convertedCustomer.code,
                                  name: booking.convertedCustomer.fullName,
                                }
                              : null
                          }
                        />
                      </>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionLabel count={quotes.filter((q) => q.status === "SUBMITTED").length}>
          Quote requests
        </SectionLabel>
        {quotes.length === 0 ? (
          <Card>
            <EmptyState icon="FileQuestion" title="No quote requests" />
          </Card>
        ) : (
          <ul className="space-y-3">
            {quotes.map((quote) => (
              <li key={quote.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2">
                        <span className="tnum font-medium">{quote.reference}</span>
                        <Badge tone={TONE[quote.status]}>
                          {quote.status.replace(/_/g, " ").toLowerCase()}
                        </Badge>
                      </p>
                      <p className="mt-1 text-sm">
                        {quote.contactName} · {quote.contactPhone}
                        {quote.contactEmail ? ` · ${quote.contactEmail}` : ""}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {quote.service} · {quote.commodity ?? "unspecified goods"}
                        {quote.estimatedCbm ? ` · ${formatCbm(quote.estimatedCbm)}` : ""}
                        {quote.hazardous ? " · hazardous" : ""}
                        {quote.fragile ? " · fragile" : ""}
                      </p>
                      {quote.notes ? (
                        <p className="mt-2 rounded-md bg-secondary px-3 py-2 text-xs">
                          {quote.notes}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatRelative(quote.createdAt)}
                    </p>
                  </div>
                  <div className="mt-4 border-t pt-4">
                    <RequestControls
                      kind="quote"
                      id={quote.id}
                      status={quote.status}
                      notes={quote.responseNotes}
                    />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        A pickup request is never cargo. When the goods are physically on the
        Guangzhou floor, take them in at the{" "}
        <Link href="/app/receive/new" className="underline">
          receiving counter
        </Link>{" "}
        and link the consignment back to the request.
      </p>
    </div>
  );
}
