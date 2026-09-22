import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Prisma } from "@prisma/client";
import {
  Boxes,
  ClipboardList,
  Container as ContainerIcon,
  Layers,
  Lock,
  Package,
  Scale,
  Users,
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
import { SectionLabel } from "@/components/app/section-label";
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
import { AT_SEA_STATUSES, sailingDelay } from "@/lib/eta";
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

  /* Thirty days from the day it left, and late on the thirty-first — the same
     arithmetic the customer's tracking page does, from lib/eta.ts. */
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
        : container.status === "ARRIVED"
          ? can(user.role, "container.close")
          : false;

  /*
    THE NEXT MILESTONE, WHEREVER THE READER IS STANDING.

    It used to live in the manifest column, which is hidden from anyone reading
    the money instead — and once Finance carries the box through the port, that
    was one of the two desks that record the arrival. The card is built here
    and placed on whichever half of the page the reader is looking at.
  */
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
  const inClearance = await prisma.cargo.count({
    where: {
      deletedAt: null,
      clearedAt: null,
      OR: [{ status: "ARRIVED_TANZANIA" }, { darReceiving: { isNot: null } }],
      containerLines: { some: { containerId: container.id } },
      status: { notIn: ["COLLECTED", "DELIVERED", "CANCELLED", "MISSING_AT_DAR"] },
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
              <ClearanceButton containerId={container.id} waiting={inClearance} />
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
      {!open ? advance : null}

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
