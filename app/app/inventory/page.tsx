import Link from "next/link";
import type { Metadata } from "next";
import type { CargoStatus } from "@prisma/client";
import {
  Boxes,
  Container as ContainerIcon,
  Download,
  Package,
  Warehouse,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import { SectionLabel } from "@/components/app/section-label";
import { CargoStatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCbm, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Warehouse floor" };

/*
  THE FLOOR IS WHAT IS STILL WAITING.

  A consignment leaves this list the moment it goes into a container: from then
  on it is the container's, and the container is where anyone asks about it.
  Keeping loaded cargo here made the floor read as fuller than the building was,
  and a clerk counting shelves against the screen could never make the two
  agree.
*/
const CHINA_STATUSES: CargoStatus[] = ["RECEIVED_CHINA"];

const DAR_STATUSES: CargoStatus[] = [
  "ARRIVED_TANZANIA",
  "RECEIVED_DAR",
  "READY_FOR_RELEASE",
];

/**
 * WHAT IS ON MY FLOOR.
 *
 * Which floor depends on who is asking. A Guangzhou clerk opening this used to
 * see cargo sitting in Dar es Salaam — everything of theirs was invisible,
 * because the page only ever queried the Tanzanian statuses. The desk decides
 * the question now, and each warehouse sees its own stock.
 *
 * Cargo already loaded into a container is still listed, with its container
 * beside it. It has not left the building; it has moved from a shelf into a
 * box, and a warehouse that cannot see it any more believes it has shipped.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string }>;
}) {
  const user = await requirePermission("inventory.view");
  const { q, state } = await searchParams;
  const query = q?.trim() ?? "";

  /* Dar's own desk sees Dar. China, and management looking at the origin end,
     see Guangzhou. */
  const inChina =
    can(user.role, "receiving.china") || !can(user.role, "receiving.dar");

  const statuses = inChina ? CHINA_STATUSES : DAR_STATUSES;

  const filtered: CargoStatus[] =
    state === "waiting"
      ? [inChina ? "RECEIVED_CHINA" : "RECEIVED_DAR"]
      : statuses;

  const cargo = await prisma.cargo.findMany({
    where: {
      deletedAt: null,
      status: { in: filtered },
      ...(state === "hold" ? { operationalHold: true } : {}),
      /* The attention list on the dashboard links straight here: a warning that
         cannot be turned into the actual rows is a warning nobody acts on. */
      ...(state === "nophoto" ? { photos: { none: {} } } : {}),
      ...(query
        ? {
            OR: [
              { reference: { contains: query, mode: "insensitive" as const } },
              { shippingMark: { contains: query, mode: "insensitive" as const } },
              { paperReceiptNo: { contains: query } },
              { description: { contains: query, mode: "insensitive" as const } },
              {
                sender: {
                  OR: [
                    { fullName: { contains: query, mode: "insensitive" as const } },
                    { phone: { contains: query } },
                  ],
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "asc" },
    take: 200,
    include: {
      sender: { select: { fullName: true, phone: true } },
      chinaReceiving: {
        select: {
          cbm: true,
          packagesCount: true,
          piecesCount: true,
          weightKg: true,
          location: true,
          receivedAt: true,
        },
      },
      darReceiving: {
        select: {
          cbm: true,
          packagesCount: true,
          piecesCount: true,
          weightKg: true,
          location: true,
          receivedAt: true,
        },
      },
      packages: {
        where: { deletedAt: null },
        select: { pieces: true, cargoType: true },
      },
      /* The proof photographs, thumbnailed on the row. A clerk checking a
         consignment against a shelf should not have to open a page to see
         what the boxes looked like when they came in. */
      photos: {
        select: { id: true, url: true, caption: true },
        orderBy: { createdAt: "asc" },
        take: 3,
      },
      containerLines: {
        include: {
          container: { select: { id: true, reference: true, containerNumber: true } },
        },
      },
    },
  });

  const [waiting, loaded, held] = await Promise.all([
    prisma.cargo.count({
      where: {
        deletedAt: null,
        status: inChina ? "RECEIVED_CHINA" : "RECEIVED_DAR",
      },
    }),
    prisma.cargo.count({
      where: {
        deletedAt: null,
        status: {
          in: inChina
            ? (["ASSIGNED_TO_CONTAINER", "CONTAINER_LOADED"] as CargoStatus[])
            : (["READY_FOR_RELEASE"] as CargoStatus[]),
        },
      },
    }),
    prisma.cargo.count({
      where: { deletedAt: null, operationalHold: true, status: { in: statuses } },
    }),
  ]);

  const floorCbm = cargo.reduce((sum, item) => {
    const cbm = inChina
      ? item.chinaReceiving?.cbm
      : (item.darReceiving?.cbm ?? item.chinaReceiving?.cbm);
    return sum + Number(cbm ?? 0);
  }, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={inChina ? "Guangzhou floor" : "Dar es Salaam floor"}
        description={
          inChina
            ? "Everything received and still waiting for a container."
            : "Everything landed in Dar, oldest first."
        }
        actions={
          inChina && can(user.role, "receiving.china") ? (
            <Button asChild>
              <Link href="/app/receive/new">
                <Package />
                Receive cargo
              </Link>
            </Button>
          ) : null
        }
      />
      <SectionTabs />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          label="On the floor"
          numeric={cargo.length}
          icon={Warehouse}
          tone="brand"
          hint="Consignments physically here"
        />
        <KpiCard
          index={1}
          label={inChina ? "Waiting for a container" : "Waiting to be released"}
          numeric={waiting}
          icon={Boxes}
          tone={waiting > 0 ? "signal" : "success"}
          href={inChina ? "/app/inventory?state=waiting" : "/app/release"}
        />
        <KpiCard
          index={2}
          label={inChina ? "Gone into containers" : "Cleared to go"}
          numeric={loaded}
          icon={ContainerIcon}
          tone="marine"
          hint={inChina ? "No longer on the floor" : undefined}
          href={inChina ? "/app/containers" : undefined}
        />
        <KpiCard
          index={3}
          label="Volume on the floor"
          numeric={floorCbm}
          decimals={2}
          suffix="m³"
          icon={Package}
          tone="success"
        />
      </div>

      <form className="flex flex-wrap gap-3">
        <Input
          name="q"
          defaultValue={query}
          placeholder="Reference, mark, receipt no., customer or phone…"
          className="max-w-sm"
          aria-label="Search the floor"
        />
        <NativeSelect
          name="state"
          defaultValue={state ?? ""}
          className="w-56"
          aria-label="Filter"
        >
          <option value="">Everything here</option>
          <option value="waiting">
            {inChina ? "Waiting for a container" : "Not yet released"}
          </option>
          <option value="hold">On hold</option>
          <option value="nophoto">No photograph</option>
        </NativeSelect>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      <section>
        <SectionLabel count={held}>
          {inChina ? "Received cargo" : "Landed cargo"}
        </SectionLabel>
        <Card>
          {cargo.length === 0 ? (
            <EmptyState
              icon="Warehouse"
              title={query ? "Nothing matches" : "The floor is clear"}
              description={
                query
                  ? "Try a receipt number, or the mark written on the box."
                  : inChina
                    ? "Nothing is waiting. Everything received has gone into a container."
                    : "Nothing landed is still sitting here."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {/* THE NAME LEADS. A clerk looking for a consignment on the
                      floor is looking for a person — the tracking number is how
                      they confirm it, not how they find it. */}
                  <TableHead>Customer</TableHead>
                  <TableHead>Tracking no.</TableHead>
                  <TableHead className="hidden lg:table-cell">Goods</TableHead>
                  <TableHead className="text-right">Pkgs</TableHead>
                  {/* Weight is not what this floor is sold or planned on —
                      volume is, and a kilo figure beside a cubic metre invited
                      somebody to price on the wrong one. It is still on the
                      consignment, where a claim needs it. */}
                  <TableHead className="text-right">Pieces</TableHead>
                  <TableHead className="text-right">CBM</TableHead>
                  <TableHead>Proof</TableHead>
                  {/* "Received in China" on the Guangzhou floor is every row
                      saying the name of the page. It is the customer's sentence,
                      not the warehouse's, and the date beside it already says
                      when. Dar keeps it: there a consignment can be landed,
                      booked in or cleared to go, and those are different jobs. */}
                  {inChina ? null : <TableHead>Status</TableHead>}
                  {/* Nothing on the Guangzhou floor is in a container — that is
                      what "on the floor" means, and a column of "Not assigned"
                      was one word repeated twenty-three times. Dar keeps it:
                      there, the box it came off is how a consignment is found. */}
                  {inChina ? null : <TableHead>Container</TableHead>}
                  {/* Which warehouse it is in is the title of the page, and a
                      shelf number nobody fills in was two lines of nothing. The
                      date it came in is the fact a clerk actually wants. */}
                  <TableHead className="hidden xl:table-cell">Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cargo.map((item) => {
                  const receiving = inChina
                    ? item.chinaReceiving
                    : (item.darReceiving ?? item.chinaReceiving);
                  const container = item.containerLines.at(-1)?.container;
                  /* Counted from the goods, never typed. The receiving row's
                     own totals win when it has them — Dar recounts, and the
                     recount is the truth for the Dar floor. */
                  const pieces =
                    receiving?.piecesCount ??
                    item.packages.reduce((sum, k) => sum + (k.pieces ?? 0), 0);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm font-semibold">
                        {item.sender.fullName}
                        {item.operationalHold ? (
                          <Badge tone="bad" className="ml-1.5">
                            held
                          </Badge>
                        ) : null}
                        <span className="tnum block text-xs font-normal text-muted-foreground">
                          {item.sender.phone}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/app/cargo/${item.id}`}
                          className="tnum font-medium tracking-wide hover:underline"
                        >
                          {item.reference}
                        </Link>
                        {item.paperReceiptNo ? (
                          <span className="tnum block text-xs text-muted-foreground">
                            note {item.paperReceiptNo}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden max-w-xs truncate text-sm text-muted-foreground lg:table-cell">
                        {item.description}
                      </TableCell>
                      <TableCell className="tnum text-right text-sm">
                        {receiving?.packagesCount ?? "—"}
                      </TableCell>
                      <TableCell className="tnum text-right text-sm text-muted-foreground">
                        {pieces > 0 ? pieces.toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="tnum text-right text-sm font-medium">
                        {formatCbm(receiving?.cbm)}
                      </TableCell>
                      <TableCell>
                        {item.photos.length > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/app/cargo/${item.id}`}
                              className="flex -space-x-2"
                              aria-label={`${item.photos.length} photo(s) of ${item.reference}`}
                            >
                              {item.photos.map((photo) => (
                                /* Uploads from a warehouse phone, of unknown
                                   dimensions — the optimiser cannot help. */
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  key={photo.id}
                                  src={photo.url}
                                  alt=""
                                  className="size-9 rounded border-2 border-background object-cover"
                                />
                              ))}
                            </Link>
                            <a
                              href={item.photos[0].url}
                              download
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Download the photo of ${item.reference}`}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Download className="size-4" />
                            </a>
                          </div>
                        ) : (
                          <Badge tone="warn">No photo</Badge>
                        )}
                      </TableCell>
                      {inChina ? null : (
                        <TableCell>
                          <CargoStatusBadge status={item.status} />
                        </TableCell>
                      )}
                      {inChina ? null : (
                        <TableCell>
                          {container ? (
                            <Link
                              href={`/app/containers/${container.id}`}
                              className="tnum text-sm hover:underline"
                            >
                              {container.reference}
                            </Link>
                          ) : (
                            <Badge tone="neutral">—</Badge>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="tnum hidden text-sm text-muted-foreground xl:table-cell">
                        {formatDate(receiving?.receivedAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </section>
    </div>
  );
}
