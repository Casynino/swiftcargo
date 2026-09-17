import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import { RequestControls } from "@/components/app/request-controls";
import { SectionLabel } from "@/components/app/section-label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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

/**
 * What came in off the website.
 *
 * None of it is cargo, a container or a confirmed pickup. Each row is somebody
 * asking, and a member of staff turns it into a real record — or does not.
 */
export default async function RequestsPage() {
  await requirePermission("request.view");

  const [quotes, pickups, bookings] = await Promise.all([
    prisma.quoteRequest.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.pickupRequest.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.containerBooking.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  const openCount =
    quotes.filter((q) => q.status === "SUBMITTED").length +
    pickups.filter((p) => p.status === "SUBMITTED").length +
    bookings.filter((b) => b.status === "SUBMITTED").length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Website requests"
        description="Quotes, pickups and booking enquiries. Nothing here is confirmed until somebody here confirms it."
      />
      <SectionTabs />

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
                        {quote.estimatedCbm
                          ? ` · ${formatCbm(quote.estimatedCbm)}`
                          : ""}
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

      <section>
        <SectionLabel count={pickups.filter((p) => p.status === "SUBMITTED").length}>
          Pickup requests
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
                    <div>
                      <p className="flex items-center gap-2">
                        <span className="tnum font-medium">{pickup.reference}</span>
                        <Badge tone={TONE[pickup.status]}>
                          {pickup.status.replace(/_/g, " ").toLowerCase()}
                        </Badge>
                      </p>
                      <p className="mt-1 text-sm">
                        {pickup.contactName} · {pickup.contactPhone}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {pickup.pickupLocation}
                      </p>
                      {pickup.preferredDate ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Wants {formatDate(pickup.preferredDate)}
                          {pickup.preferredTime ? ` · ${pickup.preferredTime}` : ""}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatRelative(pickup.createdAt)}
                    </p>
                  </div>
                  <div className="mt-4 border-t pt-4">
                    <RequestControls
                      kind="pickup"
                      id={pickup.id}
                      status={pickup.status}
                      notes={pickup.staffNotes}
                    />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionLabel count={bookings.filter((b) => b.status === "SUBMITTED").length}>
          Booking requests
        </SectionLabel>
        {bookings.length === 0 ? (
          <Card>
            <EmptyState icon="Container" title="No booking requests" />
          </Card>
        ) : (
          <ul className="space-y-3">
            {bookings.map((booking) => (
              <li key={booking.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2">
                        <span className="tnum font-medium">{booking.reference}</span>
                        <Badge tone={TONE[booking.status]}>
                          {booking.status.replace(/_/g, " ").toLowerCase()}
                        </Badge>
                        <Badge tone="neutral">
                          {booking.type.replace("_", " ").toLowerCase()}
                        </Badge>
                      </p>
                      <p className="mt-1 text-sm">
                        {booking.contactName} · {booking.contactPhone}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {booking.commodity ?? "unspecified"}
                        {booking.estimatedCbm
                          ? ` · ${formatCbm(booking.estimatedCbm)}`
                          : ""}
                        {booking.dangerousGoods ? " · dangerous goods" : ""}
                      </p>
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
                  <div className="mt-4 border-t pt-4">
                    <RequestControls
                      kind="booking"
                      id={booking.id}
                      status={booking.status}
                      notes={booking.staffNotes}
                    />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
