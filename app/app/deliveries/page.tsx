import Link from "next/link";
import type { Metadata } from "next";

import { DeliveryControls } from "@/components/app/delivery-controls";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

import { primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "Deliveries" };

const TONE: Record<string, "neutral" | "progress" | "good" | "warn" | "bad"> = {
  REQUESTED: "warn",
  CONFIRMED: "progress",
  ASSIGNED: "progress",
  OUT_FOR_DELIVERY: "progress",
  DELIVERED: "good",
  FAILED: "bad",
  CANCELLED: "neutral",
};

export default async function DeliveriesPage() {
  await primeLocale();
  await requirePermission("delivery.manage");

  const requests = await prisma.deliveryRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: {
      cargo: { select: { id: true, reference: true, description: true } },
      customer: { select: { fullName: true, phone: true } },
    },
  });

  const open = requests.filter(
    (r) => !["DELIVERED", "CANCELLED"].includes(r.status)
  );
  const done = requests.filter((r) =>
    ["DELIVERED", "CANCELLED"].includes(r.status)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={T("Deliveries")}
        description={T("Customers who asked us to bring their cargo to them instead of collecting.")}
      />
      <SectionTabs />

      {open.length === 0 ? (
        <Card>
          <EmptyState
            icon="Truck"
            title={T("No deliveries to arrange")}
            description={T("Customers request delivery from their own portal once their cargo clears.")}
          />
        </Card>
      ) : (
        <ul className="space-y-4">
          {open.map((request) => (
            <li key={request.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2">
                      <Link
                        href={`/app/cargo/${request.cargo.id}`}
                        className="tnum font-medium hover:underline"
                      >
                        {request.cargo.reference}
                      </Link>
                      <Badge tone={TONE[request.status]}>
                        {request.status.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {request.customer.fullName} · {request.contactPhone}
                    </p>
                    <p className="mt-2 text-sm">{request.address}</p>
                    {request.preferredDate ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Preferred: {formatDate(request.preferredDate)}
                      </p>
                    ) : null}
                    {request.notes ? (
                      <p className="mt-2 rounded-md bg-secondary px-3 py-2 text-xs">
                        {request.notes}
                      </p>
                    ) : null}
                  </div>
                  <p className="tnum text-sm font-medium">
                    {request.charge
                      ? formatMoney(request.charge, request.currency)
                      : "No charge set"}
                  </p>
                </div>

                <div className="mt-4 border-t pt-4">
                  <DeliveryControls
                    requestId={request.id}
                    status={request.status}
                    charge={request.charge?.toString() ?? null}
                    driverName={request.driverName}
                    driverPhone={request.driverPhone}
                    failedReason={request.failedReason}
                  />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 ? (
        <Card>
          <div className="border-b p-5">
            <p className="font-medium">{T("Finished")}</p>
          </div>
          <ul className="divide-y">
            {done.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
              >
                <span>
                  <Link
                    href={`/app/cargo/${request.cargo.id}`}
                    className="tnum font-medium hover:underline"
                  >
                    {request.cargo.reference}
                  </Link>
                  <span className="ml-2 text-muted-foreground">
                    {request.customer.fullName}
                  </span>
                </span>
                <Badge tone={TONE[request.status]}>
                  {request.status.toLowerCase()}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
