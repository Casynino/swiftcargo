import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { VoyageForm } from "@/components/app/container-controls";
import { AddToContainer } from "@/components/app/move-cargo";
import { PageHeader } from "@/components/app/page-header";
import { SectionLabel } from "@/components/app/section-label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CONTAINER_STATUS_LABELS } from "@/lib/constants";
import { AT_SEA_STATUSES, expectedArrival, sailingDelay, SEA_TRANSIT_DAYS } from "@/lib/eta";
import { formatCbm, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

import { P, primeLocale, T } from "@/lib/server-t";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const c = await prisma.container.findUnique({
    where: { id },
    select: { reference: true },
  });
  return { title: c ? `Edit ${c.reference}` : "Edit container" };
}

const asDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * A BOX THAT HAS SAILED, PUT RIGHT.
 *
 * Two things change about a container after it leaves Guangzhou, and both of
 * them arrive by telephone a week later: the line moved the dates, and a
 * consignment that physically went in the box was never written on the
 * manifest. Both used to be done on a card wedged under the loading screen —
 * or, for the second, not at all, which left a bale sitting on the Guangzhou
 * floor list while it was halfway across the Indian Ocean.
 *
 * They get a page of their own, because they are the whole job: the dates at
 * the top, what is on the box beneath, and one line to add what was missed.
 * Nothing here loads cargo — loading ended at the seal. Adding asks why, keeps
 * the old value, opens a case and leaves the packing list exactly as the box
 * sailed with it.
 */
export default async function ContainerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("container.view");
  const { id } = await params;

  const container = await prisma.container.findFirst({
    where: { id, deletedAt: null },
    include: {
      shipment: true,
      cargoLines: {
        include: {
          cargo: {
            select: {
              id: true,
              reference: true,
              description: true,
              descriptionZh: true,
              shippingMark: true,
              sender: { select: { fullName: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!container) notFound();

  const sailed = ["SEALED", "DEPARTED", "IN_TRANSIT", "ARRIVED", "CLOSED"].includes(
    container.status
  );
  const mayEditVoyage = can(user.role, "shipment.edit");
  const mayAmend = can(user.role, "container.amendArrived") && sailed;

  const delay = sailingDelay({
    eta: container.shipment?.eta ?? null,
    arrived: container.shipment?.actualArrival ?? null,
    atSea: (AT_SEA_STATUSES as readonly string[]).includes(container.status),
  });

  /* What the rule would say, so whoever is typing a date can see the figure
     they are departing from rather than counting on their fingers. */
  const byTheRule = container.shipment?.departureDate
    ? expectedArrival(container.shipment.departureDate)
    : null;

  /*
    WHAT COULD STILL BE ADDED.

    Cargo Guangzhou took in that is not already on a box somebody has shut.
    A consignment with a live bill is not here: the bill names the sailing, and
    moving it underneath a customer is Finance's to unpick first.
  */
  const addable = mayAmend
    ? await prisma.cargo.findMany({
        where: {
          deletedAt: null,
          status: {
            in: ["RECEIVED_CHINA", "ASSIGNED_TO_CONTAINER", "CONTAINER_LOADED"],
          },
          containerLines: { none: { containerId: container.id } },
          invoices: { none: { status: { notIn: ["DRAFT", "CANCELLED"] } } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          reference: true,
          description: true,
          shippingMark: true,
          sender: { select: { fullName: true } },
        },
      })
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${T("Edit")} ${container.reference}`}
        description={T("The sailing dates, and anything that went in the box without reaching the manifest.")}
        back={{ href: `/app/containers/${container.id}`, label: container.reference }}
        actions={
          <>
            <Badge tone={container.status === "ARRIVED" ? "good" : "progress"}>
              {T(CONTAINER_STATUS_LABELS[container.status])}
            </Badge>
            {delay.late ? (
              <Badge tone="warn">
                {T("Delayed")} · {delay.days}{" "}
                {delay.days === 1 ? T("day") : T("days")}
              </Badge>
            ) : null}
          </>
        }
      />

      <section>
        <SectionLabel>{T("The dates")}</SectionLabel>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{T("Voyage")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {T("The departure is what everything else is counted from; the expected arrival is what the customer reads on the tracking link.")}{" "}
              {byTheRule ? (
                <>
                  {T("By the rule of")} {SEA_TRANSIT_DAYS} {T("days at sea, this box is due")}{" "}
                  <span className="tnum font-medium text-foreground">
                    {formatDate(byTheRule)}
                  </span>
                </>
              ) : null}
            </p>
          </CardHeader>
          <CardContent>
            {mayEditVoyage ? (
              <VoyageForm
                containerId={container.id}
                sailed={sailed}
                shipment={
                  container.shipment
                    ? {
                        shippingLine: container.shipment.shippingLine,
                        vessel: container.shipment.vessel,
                        voyage: container.shipment.voyage,
                        billOfLading: container.shipment.billOfLading,
                        departureDate: asDate(container.shipment.departureDate),
                        eta: asDate(container.shipment.eta),
                        notes: container.shipment.notes,
                      }
                    : null
                }
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {T("Changing a sailing is Guangzhou's and the office's to do.")}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {mayAmend ? (
        <section>
          <SectionLabel>{T("Cargo that went with this box")}</SectionLabel>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{T("Add to the manifest")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {T("For a consignment that physically travelled in this container and is not on the list. It asks why, keeps who added it, and opens a case so whoever prices the sailing can see it was found rather than loaded. The packing list the box sailed with is not rewritten.")}
              </p>
            </CardHeader>
            <CardContent>
              <AddToContainer
                containerId={container.id}
                candidates={addable.map((c) => ({
                  id: c.id,
                  label: `${c.reference} · ${c.shippingMark ?? c.sender.fullName} · ${c.description ?? ""}`,
                }))}
              />
              {addable.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {T("Nothing on the Guangzhou floor can be added to this sailing.")}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section>
        <SectionLabel count={container.cargoLines.length}>
          {T("On the manifest")}
        </SectionLabel>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T("Tracking no.")}</TableHead>
                <TableHead>{T("Customer")}</TableHead>
                <TableHead className="hidden lg:table-cell">{T("Goods")}</TableHead>
                <TableHead className="text-right">{T("Pkgs")}</TableHead>
                <TableHead className="text-right">CBM</TableHead>
                <TableHead className="hidden xl:table-cell">{T("Added")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {container.cargoLines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <Link
                      href={`/app/cargo/${line.cargo.id}`}
                      className="tnum font-medium tracking-wide hover:underline"
                    >
                      {line.cargo.reference}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    {line.cargo.sender.fullName}
                    {line.cargo.shippingMark ? (
                      <span className="block text-xs text-muted-foreground">
                        {line.cargo.shippingMark}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden max-w-xs truncate text-sm text-muted-foreground lg:table-cell">
                    {P(line.cargo.description, line.cargo.descriptionZh)}
                  </TableCell>
                  <TableCell className="tnum text-right text-sm">
                    {line.packagesCount}
                  </TableCell>
                  <TableCell className="tnum text-right text-sm font-medium">
                    {formatCbm(line.cbm)}
                  </TableCell>
                  <TableCell className="tnum hidden text-sm text-muted-foreground xl:table-cell">
                    {formatDate(line.loadedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}
