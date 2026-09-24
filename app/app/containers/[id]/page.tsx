import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Prisma } from "@prisma/client";
import {
  Anchor,
  Boxes,
  CalendarClock,
  ClipboardList,
  Container as ContainerIcon,
  Layers,
  Lock,
  Package,
  PackageX,
  Scale,
  TriangleAlert,
  Users,
  Warehouse,
} from "lucide-react";

import {
  AdvancePanel,
  BoxForm,
  LoadedTable,
  LoadPanel,
  SealPanel,
  VoyageForm,
} from "@/components/app/container-controls";
import { EmptyState } from "@/components/app/empty-state";
import { Field } from "@/components/app/field";
import { PackingListButton } from "@/components/app/packing-list-button";
import { KpiCard } from "@/components/app/kpi-card";
import { ContainerMoney } from "@/components/app/container-money";
import { PageHeader } from "@/components/app/page-header";
import { ClearanceButton } from "@/components/app/clearance-button";
import { UndoArrivalButton } from "@/components/app/undo-arrival-button";
import { CloseContainerButton } from "@/components/app/close-panel";
import { SectionLabel } from "@/components/app/section-label";
import { StatStrip } from "@/components/app/stat-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CONTAINER_STATUS_LABELS,
  LOADABLE_CONTAINER_STATUSES,
  SHIPMENT_STATUS_LABELS,
} from "@/lib/constants";
import { AT_SEA_STATUSES, sailingDelay, SEA_TRANSIT_DAYS } from "@/lib/eta";
import { manifestTally } from "@/lib/manifest-tally";
import {
  formatCbm,
  formatDate,
  formatDateTime,
  formatWeight,
} from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";

import { P, primeLocale, T } from "@/lib/server-t";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const c = await prisma.container.findUnique({
    where: { id },
    select: { reference: true, containerNumber: true },
  });
  return { title: c?.reference ?? "Container" };
}

const asDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function ContainerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; floor?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("container.view");
  const { id } = await params;
  const { edit, floor } = await searchParams;
  const floorQuery = floor?.trim() ?? "";

  /* The paperwork shelf turns into the voyage form and back, so the sailing has
     one home rather than a read-only copy and an editable one somewhere else. */
  const editingVoyage = edit === "voyage" && can(user.role, "shipment.edit");
  /* The box's own particulars — capacity, deadline, note — only while the
     doors are open. The server refuses a sealed one; this only stops the form
     being offered where it would be refused. */
  const editingBox = edit === "box" && can(user.role, "container.edit");

  const container = await prisma.container.findFirst({
    where: { id, deletedAt: null },
    include: {
      shipment: true,
      packingList: true,
      cargoLines: {
        include: {
          cargo: {
            include: {
              sender: { select: { fullName: true, code: true } },
              /* Expected against received, for the arithmetic below: China's
                 count is the packing list's, Dar's is the floor's, and
                 neither is allowed to overwrite the other. */
              chinaReceiving: { select: { packagesCount: true } },
              darReceiving: { select: { packagesCount: true } },
              /* The container's totals are added up from the goods themselves.
                 Nobody types a total anywhere, and a corrected line changes the
                 box's figures the moment it is corrected. */
              packages: {
                where: { deletedAt: null },
                select: {
                  quantity: true,
                  pieces: true,
                  weightKg: true,
                  cbm: true,
                  cargoType: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      events: { include: { actor: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!container) notFound();

  const open = LOADABLE_CONTAINER_STATUSES.includes(container.status);

  /* Thirty-five days from the day it left, and late on the thirty-sixth — the
     same arithmetic the customer's tracking page does, from lib/eta.ts. */
  const delay = sailingDelay({
    eta: container.shipment?.eta ?? null,
    arrived: container.shipment?.actualArrival ?? null,
    atSea: (AT_SEA_STATUSES as readonly string[]).includes(container.status),
  });

  /* The money half appears once the box has left China. A container still
     taking cargo has nothing billed against it, so an overview of zeros would
     only be six empty cells above the loading bay's actual work. */
  const sailed = ["DEPARTED", "IN_TRANSIT", "ARRIVED", "CLOSED"].includes(
    container.status
  );
  const showMoney = sailed && can(user.role, "finance.view");

  /*
    EVERYTHING RECEIVED IN GUANGZHOU AND NOT YET ON A BOX.

    Only offered while this container can still take cargo, oldest first,
    because the oldest consignment on the floor is the one a customer is
    already asking about.

    Capped, and the cap is searchable rather than silent. A floor holding more
    than two hundred waiting consignments showed the first two hundred and said
    nothing, so a clerk looking for one that fell off the end concluded it had
    never been received — and it sat there through the next sailing.
  */
  const FLOOR_LIMIT = 200;
  const floorWhere = {
    deletedAt: null,
    status: "RECEIVED_CHINA" as const,
    ...(floorQuery
      ? {
          OR: [
            { reference: { contains: floorQuery, mode: "insensitive" as const } },
            { shippingMark: { contains: floorQuery, mode: "insensitive" as const } },
            { paperReceiptNo: { contains: floorQuery } },
            { description: { contains: floorQuery, mode: "insensitive" as const } },
            { descriptionZh: { contains: floorQuery } },
            {
              sender: {
                fullName: { contains: floorQuery, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {}),
  };

  const [waiting, floorTotal] = open
    ? await Promise.all([
        prisma.cargo.findMany({
          where: floorWhere,
          orderBy: { createdAt: "asc" },
          take: FLOOR_LIMIT,
          include: {
            sender: { select: { fullName: true } },
            packages: {
              where: { deletedAt: null },
              select: { cbm: true, quantity: true, cargoType: true },
            },
          },
        }),
        prisma.cargo.count({ where: floorWhere }),
      ])
    : [[] as never[], 0];

  /*
    NO CARD FOR A STEP THIS DESK CANNOT TAKE.

    "Move it along" rendered for everyone and, for the desk that could not take
    the next step, held a single sentence explaining that somebody else would —
    a card-sized apology sitting beside the voyage form. The step belongs to one
    end of the route; if it is not yours, the card is not there.
  */
  const nextStep =
    container.status === "SEALED"
      ? can(user.role, "container.depart")
      : container.status === "DEPARTED" || container.status === "IN_TRANSIT"
        ? can(user.role, "container.arrive")
        : /* A landed box has its close button up in the header, with the
           container's other actions. A card saying the same thing again was
           the largest thing on a page opened for everything else. */
        false;

  /*
    THE NEXT MILESTONE, WHEREVER THE READER IS STANDING.

    It used to live in the manifest column, which is hidden from anyone reading
    the money instead — and once Finance carries the box through the port, that
    was one of the two desks that record the arrival. The card is built here
    and placed on whichever half of the page the reader is looking at.
  */
  /*
    THE DAY IT IS DUE, ON THE PAGE EVERY DESK OPENS.

    "Where is my cargo" is answered with a date, and until now the date lived
    in the paperwork shelf at the foot of the page — eight rows down, beside
    the bill of lading, where nobody looking for it thought to look. It sits
    above the next milestone instead, and it is NOT gated on being able to
    press that milestone: Guangzhou cannot mark a box arrived and is still
    asked, every day, when it gets there.

    The same arithmetic and the same word the customer's tracking page uses.
  */
  /*
    A BOX THAT IS HERE IS NOT "EXPECTED".

    The container's own status is the truth about whether it has landed, and
    the date comes from the shipment or, failing that, from the arrival event
    on its timeline — a sailing whose shipment row never took the date still
    has the moment somebody pressed the button. Nothing that has landed is
    ever shown a future date: the promise stops mattering the day it is kept.
  */
  const landed = ["ARRIVED", "CLOSED"].includes(container.status);
  const arrivedAt =
    container.shipment?.actualArrival ??
    [...container.events].reverse().find((e) => e.to === "ARRIVED")?.createdAt ??
    null;
  const due = landed ? arrivedAt : (container.shipment?.eta ?? null);
  const daysToGo =
    !landed && container.shipment?.eta && !delay.late
      ? Math.ceil(
          (Date.UTC(
            container.shipment.eta.getUTCFullYear(),
            container.shipment.eta.getUTCMonth(),
            container.shipment.eta.getUTCDate()
          ) -
            Date.UTC(
              new Date().getUTCFullYear(),
              new Date().getUTCMonth(),
              new Date().getUTCDate()
            )) /
            86_400_000
        )
      : null;

  const arrival =
    sailed && due ? (
      <Card className={delay.late ? "border-warning/40" : "border-brand/20"}>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-10 items-center justify-center rounded-xl",
                delay.late ? "bg-warning/10 text-warning" : "bg-brand/10 text-brand"
              )}
            >
              {landed ? <Anchor className="size-5" /> : <CalendarClock className="size-5" />}
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {landed
                  ? T("Arrived in Dar es Salaam")
                  : T("Expected arrival in Dar es Salaam")}
              </p>
              <p className="tnum text-xl font-semibold tracking-tight">
                {formatDate(due)}
              </p>
            </div>
          </div>
          <div className="text-right">
            {delay.late ? (
              <Badge tone="warn">
                {T("Delayed")} · {delay.days}{" "}
                {delay.days === 1 ? T("day") : T("days")}
              </Badge>
            ) : daysToGo !== null && daysToGo >= 0 ? (
              <p className="text-sm font-medium">
                {daysToGo === 0
                  ? T("Arriving today")
                  : `${daysToGo} ${daysToGo === 1 ? T("day to go") : T("days to go")}`}
              </p>
            ) : null}
            {container.shipment?.departureDate ? (
              <p className="tnum mt-0.5 text-xs text-muted-foreground">
                {T("Left China")} {formatDate(container.shipment.departureDate)}
                {landed ? null : ` · ${SEA_TRANSIT_DAYS} ${T("days at sea")}`}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    ) : null;

  /*
    WHAT THE PAPER SAID, AND WHAT CAME OFF.

    Only once the box has landed and Dar has started counting: before that,
    "received 0 of 100" describes a container at sea, not a shortage. The
    figures are worked out from the consignments themselves (lib/manifest-tally
    .ts) — the same arithmetic the receiving dock shows, so the office closing
    the sailing and the floor that counted it read one set of numbers.
  */
  const counted = container.cargoLines.some(
    (l) => l.cargo.darReceiving || l.cargo.status === "MISSING_AT_DAR"
  );
  const tally = manifestTally(
    container.cargoLines.map((l) => ({
      expectedPackages:
        l.cargo.chinaReceiving?.packagesCount ?? l.cargo.declaredPackages ?? 0,
      receivedPackages: l.cargo.darReceiving?.packagesCount ?? null,
      missing: l.cargo.status === "MISSING_AT_DAR",
    }))
  );

  /*
    CLOSING ASKS ABOUT WHAT IS LEFT, BEFORE IT SHUTS ANYTHING.

    A consignment on the manifest that nobody has counted is a question with
    exactly two honest answers: it travelled on another box, or it never came
    off this one. The close panel puts both in front of whoever is shutting the
    sailing — and moving one carries it across exactly as it stands, since its
    measurements, its bill and its storage clock belong to the consignment and
    not to the container.
  */
  const remaining = container.cargoLines
    .filter((l) => !l.cargo.darReceiving && l.cargo.status !== "MISSING_AT_DAR")
    .map((l) => ({
      cargoId: l.cargoId,
      reference: l.cargo.reference,
      customer: l.cargo.sender.fullName,
      shippingMark: l.cargo.shippingMark,
      packages: l.cargo.chinaReceiving?.packagesCount ?? l.packagesCount,
      cbm: formatCbm(l.cbm),
    }));

  /* The other sailings one of them could have travelled on: a box that is shut
     — at sea or landed — because cargo cannot be moved into a container still
     taking cargo in Guangzhou. */
  const moveTargets =
    container.status === "ARRIVED" && remaining.length > 0
      ? await prisma.container.findMany({
          where: { deletedAt: null, id: { not: container.id } },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { id: true, reference: true, containerNumber: true, status: true },
        })
      : [];

  /* A box still taking cargo is the usual answer — goods that never came off
     in Dar are most often still in Guangzhou, waiting for the next sailing —
     so those are offered first. */
  const targetOrder: Record<string, number> = { OPEN: 0, LOADING: 0, LOADED: 1, SEALED: 1 };
  moveTargets.sort(
    (a, b) => (targetOrder[a.status] ?? 2) - (targetOrder[b.status] ?? 2)
  );

  const advance = nextStep ? (
    <Card className="border-brand/30">
      <CardContent className="pt-6">
        {/* EACH MILESTONE BELONGS TO A DESK THAT SEES THE THING HAPPEN.
            Guangzhou records the departure; the arrival is Dar's or Finance's,
            and Dar closes the box once everything on it is booked in. Showing
            a clerk a button their desk cannot press only teaches them the
            system is broken. */}
        <AdvancePanel
          containerId={container.id}
          status={container.status}
          canDepart={can(user.role, "container.depart")}
          canArrive={can(user.role, "container.arrive")}
          canClose={can(user.role, "container.close")}
        />
        {container.status === "CLOSED" ? (
          <p className="text-sm text-muted-foreground">
            {T("This container is closed. Everything on it has been received in Dar.")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  ) : null;

  const waitingCbm = waiting.reduce(
    (sum, w) =>
      sum.add(w.packages.reduce((n, p) => n.add(p.cbm), new Prisma.Decimal(0))),
    new Prisma.Decimal(0),
  );
  const waitingCustomers = new Set(waiting.map((w) => w.senderId)).size;

  /* Landed and still with customs: what "Mark cleared" would clear. */
  /* The company's storage terms, said in the Clearance dialog. */
  const storageTerms = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
    select: { freeStorageDays: true, storagePerDay: true, storageCurrency: true },
  });

  const inClearance = await prisma.cargo.count({
    where: {
      deletedAt: null,
      clearedAt: null,
      OR: [{ status: "ARRIVED_TANZANIA" }, { darReceiving: { isNot: null } }],
      containerLines: { some: { containerId: container.id } },
      status: { notIn: ["COLLECTED", "DELIVERED", "CANCELLED", "MISSING_AT_DAR"] },
    },
  });

  /* Cleared and not yet verified by the Dar warehouse. Their storage is
     already running from clearance; the check-in is still owed. */
  const clearedNotIn = await prisma.cargo.count({
    where: {
      deletedAt: null,
      clearedAt: { not: null },
      darReceiving: null,
      status: "ARRIVED_TANZANIA",
      containerLines: { some: { containerId: container.id } },
    },
  });

  const arrivalUndoable =
    container.status === "ARRIVED" &&
    (await prisma.cargo.count({
      where: {
        containerLines: { some: { containerId: container.id } },
        OR: [
          { darReceiving: { isNot: null } },
          { clearedAt: { not: null } },
          { status: { notIn: ["ARRIVED_TANZANIA", "CANCELLED"] } },
        ],
      },
    })) === 0;

  const loadedCbm = container.cargoLines.reduce(
    (sum, l) => sum.add(l.cbm),
    new Prisma.Decimal(0),
  );
  const customers = new Set(container.cargoLines.map((l) => l.cargo.senderId));

  const totals = container.cargoLines.reduce(
    (acc, line) => {
      const items = line.cargo.packages;
      acc.packages += items.length
        ? items.reduce((sum, k) => sum + k.quantity, 0)
        : line.packagesCount;
      acc.pieces += items.reduce((sum, k) => sum + (k.pieces ?? 0), 0);
      acc.weightKg = acc.weightKg.add(
        line.weightKg ??
          items.reduce(
            (sum, k) => sum.add(k.weightKg ?? 0),
            new Prisma.Decimal(0),
          ),
      );
      return acc;
    },
    { packages: 0, pieces: 0, weightKg: new Prisma.Decimal(0) },
  );

  /*
    THE LOADER GOES FIRST WHILE THE BOX IS EMPTY.

    An empty container opened with a large "Empty" panel at the top and the
    thing you actually came to do — pick cargo off the floor and load it —
    below the fold. The order follows the work: nothing in it yet, so the floor
    list leads; once there is something in it, what is inside leads and the
    floor list sits underneath.
  */
  const loader =
    open && can(user.role, "container.load") ? (
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <CardTitle className="text-base">{T("Waiting in Guangzhou")}</CardTitle>
          {/* The same summary the box carries, for the pile it draws from. */}
          {waiting.length > 0 ? (
            <span className="tnum shrink-0 text-right text-xs text-muted-foreground">
              <span className="block text-sm font-semibold text-foreground">
                {formatCbm(waitingCbm)}
              </span>
              {floorTotal} waiting · {waitingCustomers} customer
              {waitingCustomers === 1 ? "" : "s"}
            </span>
          ) : null}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          {/* Its own GET form, outside the loading form below it — a form
              cannot be nested in a form, and the floor has to stay searchable
              while cargo is ticked. */}
          {floorTotal > FLOOR_LIMIT || floorQuery ? (
            <form className="flex gap-2">
              <Input
                name="floor"
                defaultValue={floorQuery}
                placeholder={T("Name, reference, mark or receipt no.…")}
                aria-label={T("Search the Guangzhou floor")}
              />
              <Button type="submit" variant="outline" size="sm">
                {T("Find")}
              </Button>
            </form>
          ) : null}
          {floorTotal > waiting.length ? (
            <p className="text-xs text-muted-foreground">
              Showing the {waiting.length} oldest of {floorTotal} waiting. Search
              for the rest.
            </p>
          ) : null}
          <LoadPanel
            containerId={container.id}
            loadedCbm={Number(loadedCbm)}
            capacityCbm={
              container.capacityCbm ? Number(container.capacityCbm) : null
            }
            waiting={waiting.map((w) => ({
              id: w.id,
              reference: w.reference,
              customer: w.sender.fullName,
              shippingMark: w.shippingMark,
              description: P(w.description, w.descriptionZh),
              category:
                [
                  ...new Set(
                    w.packages.map((k) => k.cargoType).filter(Boolean),
                  ),
                ].join(", ") || null,
              packages: w.packages.reduce((n, k) => n + k.quantity, 0),
              cbm: w.packages
                .reduce((sum, p) => sum.add(p.cbm), new Prisma.Decimal(0))
                .toString(),
            }))}
          />
        </CardContent>
      </Card>
    ) : null;

  return (
    <div className="space-y-6">
      {/* OUR NUMBER IS THE CONTAINER'S NAME. It runs from one, it is the same
          on the list, the packing list and the whiteboard, and it exists the
          moment the box is opened. The line's own MSCU… number is allocated
          late, changes every sailing and belongs in the paperwork below. */}
      <PageHeader
        title={container.reference}
        description={
          container.containerNumber
            ? `${container.containerNumber} · ${container.originPort} → ${container.destinationPort}`
            : `${container.originPort} → ${container.destinationPort}`
        }
        back={{ href: "/app/containers", label: "Containers" }}
        actions={
          <>
            <Badge tone={container.status === "ARRIVED" ? "good" : "progress"}>
              {T(CONTAINER_STATUS_LABELS[container.status])}
            </Badge>
            {/* The customer reading the tracking link sees this same word on
                the same day. An office that believes a box is on time while
                its owner has been told it is late is how an argument starts. */}
            {delay.late ? (
              <Badge tone="warn">
                {T("Delayed")} · {delay.days}{" "}
                {delay.days === 1 ? T("day") : T("days")}
              </Badge>
            ) : null}
            {can(user.role, "packingList.view") ? (
              <PackingListButton
                containerId={container.id}
                existing={container.packingList}
                canIssue={
                  can(user.role, "packingList.issue") &&
                  container.cargoLines.length > 0
                }
              />
            ) : null}
            {can(user.role, "cargo.clear") && inClearance > 0 ? (
              <ClearanceButton
                containerId={container.id}
                waiting={inClearance}
                terms={{
                  freeDays: storageTerms?.freeStorageDays ?? 7,
                  perDay: storageTerms?.storagePerDay?.toString() ?? null,
                  currency: storageTerms?.storageCurrency ?? "USD",
                }}
              />
            ) : null}
            {/* Closing is one press on a box that is finished with, so it is a
                button beside the others and not a panel across the page. What
                it asks about — the cargo nobody counted — is inside it. */}
            {container.status === "ARRIVED" ? (
              <CloseContainerButton
                containerId={container.id}
                reference={container.reference}
                remaining={remaining}
                targets={moveTargets.map((c) => ({
                  id: c.id,
                  label: `${c.reference}${c.containerNumber ? ` · ${c.containerNumber}` : ""} · ${CONTAINER_STATUS_LABELS[c.status]}`,
                }))}
                canClose={can(user.role, "container.close")}
                canReportMissing={can(user.role, "receiving.dar")}
                summary={{
                  expected: tally.expected,
                  received: tally.received,
                  missing: tally.missing,
                }}
              />
            ) : null}
            {can(user.role, "container.arrive") && container.status === "ARRIVED" && arrivalUndoable ? (
              <UndoArrivalButton containerId={container.id} reference={container.reference} />
            ) : null}
            {(can(user.role, "receiving.china") || can(user.role, "receiving.dar")) &&
            container.cargoLines.length > 0 ? (
              <Link
                href={`/app/containers/${container.id}/labels`}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-secondary"
              >
                {T("Box labels")}
              </Link>
            ) : null}
          </>
        }
      />

      {/* CLEARED, NOT YET VERIFIED — said until the warehouse acts on it.
          Storage is already running from clearance. Staff only. */}
      {clearedNotIn > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/[0.08] px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warning/15">
              <Warehouse className="size-5 text-warning" />
            </span>
            <div className="text-sm">
              <p className="font-semibold">
                {clearedNotIn}{" "}
                {T(
                  clearedNotIn === 1
                    ? "consignment cleared — warehouse verification required"
                    : "consignments cleared — warehouse verification required"
                )}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {T("Storage has started from clearance.")}{" "}
                {can(user.role, "receiving.dar")
                  ? T("Verify and check them in on the Receiving dock.")
                  : T("Ask the Dar warehouse to verify and check them in.")}
              </p>
            </div>
          </div>
          {can(user.role, "receiving.dar") ? (
            <Button asChild size="sm">
              <Link href="/app/receive/dar">{T("Receiving dock")}</Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {/*
        THE BOX, IN SIX FIGURES.

        All six are added up from the consignments inside — nobody types a total
        anywhere — and the volume card carries a ring, because "4.8 CBM" means
        nothing on its own and "4.8 of 67" is the only question the loading bay
        is actually asking.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          index={0}
          label={T("Consignments")}
          numeric={container.cargoLines.length}
          icon={Package}
          tone="brand"
          hint={open ? T("Still taking cargo") : undefined}
        />
        <KpiCard
          index={1}
          label={T("Customers")}
          numeric={customers.size}
          icon={Users}
          tone="marine"
          hint={T("Sharing this box")}
        />
        <KpiCard
          index={2}
          label={T("Packages")}
          numeric={totals.packages}
          icon={Boxes}
          tone="signal"
        />
        {/* Nothing counted is not the same as none. A box whose pieces were
            never tallied says so, rather than claiming zero. */}
        <KpiCard
          index={3}
          label={T("Pieces")}
          {...(totals.pieces > 0
            ? { numeric: totals.pieces }
            : { value: "—", hint: "Not tallied" })}
          icon={Layers}
          tone="marine"
        />
        <KpiCard
          index={4}
          label={T("Weight")}
          {...(totals.weightKg.greaterThan(0)
            ? {
                numeric: Number(totals.weightKg),
                decimals: 0,
                suffix: " kg",
              }
            : { value: "—", hint: "Nothing weighed" })}
          icon={Scale}
          tone="warning"
        />
        <KpiCard
          index={5}
          label={T("Volume loaded")}
          numeric={Number(loadedCbm)}
          decimals={3}
          suffix=" CBM"
          icon={ContainerIcon}
          tone="success"
          hint={
            container.capacityCbm
              ? `of ${formatCbm(container.capacityCbm)}`
              : T("No capacity set")
          }
          ring={
            container.capacityCbm
              ? {
                  value: Number(loadedCbm),
                  total: Number(container.capacityCbm),
                }
              : undefined
          }
        />
      </div>

      {/*
        THE MONEY, ON THE SAME SCREEN AS THE BOX.

        One container, one page. The floor reads the contents and Finance reads
        the margin, and neither has to know a second address to find the other's
        half. It sits below the six figures because those describe the box, and
        a box has to be described before it can be valued.

        Renders nothing without `finance.view`: the warehouse never sees a price.
      */}
      {/*
        THE NEXT STEP, FIRST.

        Once the box is sealed the only thing left to do on this page is the
        next milestone — departure, then arrival, then closing — so it sits
        straight under the six figures, one press, for whichever desk takes
        it. It was below the manifest, and on the money view not at all.
      */}
      {/* What the packing list said against what Dar counted off. It sits with
          the next milestone because the office closing a sailing is entitled
          to see, without opening the dock, that two packages never arrived. */}
      {counted ? (
        <StatStrip
          chips={[
            { label: "Expected", value: String(tally.expected), icon: ClipboardList, hint: "On the packing list" },
            {
              label: "Received",
              value: String(tally.received),
              icon: Package,
              tone: tally.inProgress ? "neutral" : tally.missing === 0 ? "success" : "warning",
              hint: "Counted off the box",
            },
            {
              label: "Missing",
              value: String(tally.missing),
              icon: PackageX,
              tone: tally.missing > 0 ? "danger" : "neutral",
              hint: "Expected and not found",
            },
            { label: "Available", value: String(tally.available), icon: Boxes, hint: "Physically here" },
            {
              label: "Discrepancy",
              value: String(tally.discrepancy),
              icon: TriangleAlert,
              tone: tally.discrepancy > 0 ? "warning" : "neutral",
              hint: tally.over > 0 ? `${tally.over} more than the paper` : "Packing list against the floor",
            },
          ]}
        />
      ) : null}

      {!open ? (
        <div className="space-y-4">
          {arrival}
          {advance}
        </div>
      ) : null}

      {showMoney ? <ContainerMoney id={container.id} user={user} /> : null}

      {/*
        A SEALED BOX IS ONE PAGE, NOT TWO COLUMNS.

        The split exists so a loader can pick from the floor on the left and
        watch it land in the box on the right. Once the seal is on nothing goes
        in or comes out — there is no floor list to show, and half the width
        spent on an empty half is half a page wasted. The manifest takes the
        whole page, and the voyage and the next milestone sit beneath it.
      */}
      {open ? (
        <div className="grid grid-cols-1 items-stretch gap-6 xl:h-[36rem] xl:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-6">{loader}</div>

          <div className="flex min-h-0 flex-col gap-6">
            <Card className="flex min-h-0 flex-1 flex-col">
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <CardTitle className="text-base">
                  {T("What is in this container")}
                </CardTitle>
                {/* The running total, where the eye already is. It was a bar
                          under the table, which meant scrolling to read the one figure
                          a loader checks every time they add a pallet. */}
                {container.cargoLines.length > 0 ? (
                  <span className="tnum shrink-0 text-right text-xs text-muted-foreground">
                    <span className="block text-sm font-semibold text-foreground">
                      {formatCbm(loadedCbm)}
                    </span>
                    {container.cargoLines.length} consignment
                    {container.cargoLines.length === 1 ? "" : "s"} ·{" "}
                    {totals.packages} pkg · {customers.size} customer
                    {customers.size === 1 ? "" : "s"}
                  </span>
                ) : null}
              </CardHeader>
              {container.cargoLines.length === 0 ? (
                <EmptyState
                  icon="Boxes"
                  title={T("Empty")}
                  description={T("Load cargo from the Guangzhou floor to start filling it.")}
                />
              ) : (
                <CardContent className="flex min-h-0 flex-1 flex-col">
                  <LoadedTable
                    containerId={container.id}
                    canEdit={open && can(user.role, "container.load")}
                    lines={container.cargoLines.map((line) => ({
                      cargoId: line.cargoId,
                      reference: line.cargo.reference,
                      shippingMark: line.cargo.shippingMark,
                      customer: line.cargo.sender.fullName,
                      packages: line.packagesCount,
                      /* Never came off the box, or came off short. The row
                         stays on the manifest either way — a consignment is
                         not removed to make a container add up. */
                      missingLine: line.cargo.status === "MISSING_AT_DAR",
                      received: line.cargo.darReceiving?.packagesCount ?? null,
                      category:
                        [
                          ...new Set(
                            line.cargo.packages
                              .map((k) => k.cargoType)
                              .filter(Boolean),
                          ),
                        ].join(", ") || null,
                      cbm: line.cbm.toString(),
                    }))}
                  />

                  {/* The box's own action, at the foot of the box's own card —
                            where Load sits under the floor list beside it. */}
                  {open && can(user.role, "container.seal") ? (
                    <div className="mt-3">
                      <SealPanel
                        containerId={container.id}
                        containerNumber={container.containerNumber}
                        lineCount={container.cargoLines.length}
                      />
                    </div>
                  ) : null}
                </CardContent>
              )}
            </Card>
          </div>
        </div>
      ) : showMoney ? null : (
        <div className="space-y-6">
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <CardTitle className="text-base">
                {T("What is in this container")}
              </CardTitle>
              {/* The running total, where the eye already is. It was a bar
                        under the table, which meant scrolling to read the one figure
                        a loader checks every time they add a pallet. */}
              {container.cargoLines.length > 0 ? (
                <span className="tnum shrink-0 text-right text-xs text-muted-foreground">
                  <span className="block text-sm font-semibold text-foreground">
                    {formatCbm(loadedCbm)}
                  </span>
                  {container.cargoLines.length} consignment
                  {container.cargoLines.length === 1 ? "" : "s"} ·{" "}
                  {totals.packages} pkg · {customers.size} customer
                  {customers.size === 1 ? "" : "s"}
                </span>
              ) : null}
            </CardHeader>
            {container.cargoLines.length === 0 ? (
              <EmptyState
                icon="Boxes"
                title={T("Empty")}
                description={T("Load cargo from the Guangzhou floor to start filling it.")}
              />
            ) : (
              <CardContent className="flex min-h-0 flex-1 flex-col">
                <LoadedTable
                  containerId={container.id}
                  canEdit={open && can(user.role, "container.load")}
                  lines={container.cargoLines.map((line) => ({
                    cargoId: line.cargoId,
                    reference: line.cargo.reference,
                    shippingMark: line.cargo.shippingMark,
                    customer: line.cargo.sender.fullName,
                    packages: line.packagesCount,
                    missingLine: line.cargo.status === "MISSING_AT_DAR",
                    received: line.cargo.darReceiving?.packagesCount ?? null,
                    category:
                      [
                        ...new Set(
                          line.cargo.packages
                            .map((k) => k.cargoType)
                            .filter(Boolean),
                        ),
                      ].join(", ") || null,
                    cbm: line.cbm.toString(),
                  }))}
                />

                {/* The box's own action, at the foot of the box's own card —
                          where Load sits under the floor list beside it. */}
                {open && can(user.role, "container.seal") ? (
                  <div className="mt-3">
                    <SealPanel
                      containerId={container.id}
                      containerNumber={container.containerNumber}
                      lineCount={container.cargoLines.length}
                    />
                  </div>
                ) : null}
              </CardContent>
            )}
          </Card>

        </div>
      )}

      {/*
        ONE PLACE FOR THE PAPERWORK, READ OR WRITTEN.

        The voyage details had their own form on the page — eight editable
        fields over a container that may have sailed a month ago — while the
        same facts sat read-only on the shelf below. Two places for one truth.
        The shelf is now the only place: it reads at a glance, and whoever books
        the space opens it to write.
      */}
      <section>
        <SectionLabel
          action={
            editingVoyage || editingBox
              ? {
                  href: `/app/containers/${container.id}`,
                  label: "Done",
                  keepScroll: true,
                }
              : /* A box that has sailed is corrected on a page of its own:
                   the dates and the bale that went in without being written
                   down are the whole job by then, and a card wedged under the
                   loading screen was not room enough for either. */
                sailed &&
                  (can(user.role, "shipment.edit") ||
                    can(user.role, "container.amendArrived"))
                ? {
                    href: `/app/containers/${container.id}/edit`,
                    label: "Edit this sailing",
                  }
                : can(user.role, "shipment.edit") && container.shipment
                ? { href: `?edit=voyage`, label: "Edit the voyage", keepScroll: true }
                : /* While the doors are open the box's own particulars are the
                     thing worth correcting; once it has sailed, only the
                     sailing is. Whichever this desk can do is offered. */
                  open && can(user.role, "container.edit")
                  ? { href: `?edit=box`, label: "Edit the container", keepScroll: true }
                  : undefined
          }
        >
          {T("The paperwork")}
        </SectionLabel>

        {/*
        THE PAPERWORK, AT THE FOOT.

        Reference numbers, the seal, the sailing: looked up when somebody is
        filling in a customs form or answering a shipping line, and never while
        loading. They sat across the top for a while, which put ten things
        nobody was looking for above the two things everybody was.
      */}
        {editingBox ? (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">{T("Container")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {T("What the loading bar measures against and the day Guangzhou stops taking cargo for this sailing. The line's own container and seal numbers are recorded when the box is sealed.")}
              </p>
            </CardHeader>
            <CardContent>
              <BoxForm
                containerId={container.id}
                box={{
                  capacityCbm: container.capacityCbm?.toString() ?? null,
                  cargoDeadline: asDate(container.cargoDeadline),
                  notes: container.notes,
                }}
              />
            </CardContent>
          </Card>
        ) : null}

        {editingVoyage ? (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">{T("Voyage")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {T("Whoever books the space fills this in. It prints on the packing list and is what the customer is told about the sailing.")}
              </p>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent className="flex flex-wrap gap-x-8 gap-y-4 py-4">
            {[
              ["Our reference", container.reference, true],
              ["Container no.", container.containerNumber ?? "—", true],
              ["Type", container.type.replace("_", " "), false],
              ["Seal", container.sealNumber ?? "—", true],
              ["Sealed", formatDateTime(container.sealedAt) ?? "—", false],
              [
                "Cargo deadline",
                formatDate(container.cargoDeadline) ?? "—",
                false,
              ],
              ...(container.shipment
                ? ([
                    ["Shipment", container.shipment.reference, true],
                    [
                      "Voyage",
                      SHIPMENT_STATUS_LABELS[container.shipment.status],
                      false,
                    ],
                    ["ETA", formatDate(container.shipment.eta) ?? "—", false],
                    [
                      "Arrived",
                      formatDate(container.shipment.actualArrival) ?? "—",
                      false,
                    ],
                  ] as [string, string, boolean][])
                : []),
            ].map(([label, value, mono]) => (
              <div key={label as string}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {label}
                </p>
                <p className={cn("mt-0.5 text-sm", mono && "tnum font-medium")}>
                  {value}
                </p>
              </div>
            ))}
            {container.notes ? (
              <p className="w-full rounded-md bg-secondary px-3 py-2 text-sm">
                {container.notes}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      {/*
        THE BOX'S LIFE, ACROSS THE FOOT OF THE PAGE.

        A vertical list of four events sat alone at the bottom of a column and
        left half the screen empty beneath it. Laid out along the route it
        reads as what it is — a journey with dates on it — and it closes the
        page instead of trailing off.

        Hidden for anybody reading the money half, whose Timeline tab is the
        same events. One page, one copy of each fact.
      */}
      <section className={showMoney ? "hidden" : undefined}>
        <SectionLabel>{T("History")}</SectionLabel>
        <Card>
          <CardContent className="py-5">
            <ol className="flex flex-wrap gap-x-10 gap-y-5">
              {[...container.events].reverse().map((event, index) => (
                <li key={event.id} className="relative min-w-[10rem] flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-2.5 shrink-0 rounded-full",
                        index === container.events.length - 1
                          ? "bg-brand"
                          : "bg-border",
                      )}
                    />
                    <p className="text-sm font-medium">
                      {T(CONTAINER_STATUS_LABELS[event.to])}
                    </p>
                  </div>
                  <p className="mt-1 pl-[1.125rem] text-xs text-muted-foreground">
                    {formatDateTime(event.createdAt)}
                  </p>
                  {event.actor || event.note ? (
                    <p className="pl-[1.125rem] text-xs text-muted-foreground">
                      {[event.actor?.name, event.note]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
