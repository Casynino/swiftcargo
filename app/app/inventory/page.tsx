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
import { WhatsAppButton } from "@/components/app/whatsapp-button";
import { formatCbm, formatDate } from "@/lib/format";
import {
  composeMessage,
  CONTACT_KIND_LABELS,
  letterForStage,
  whatsappNumber,
  type ContactKind,
} from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { cargoTypeOptions } from "@/lib/valuation";
import { requirePermission } from "@/lib/session";

import { P, primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "Warehouse floor" };

/*
  THE FLOOR IS WHAT IS STILL WAITING.

  A consignment leaves this list the moment it goes into a container: from then
  on it is the container's, and the container is where anyone asks about it.
  Keeping loaded cargo here made the floor read as fuller than the building was,
  and a clerk counting shelves against the screen could never make the two
  agree.

  It is still REACHABLE from here, because "where is SC0041" is asked of the
  floor whether or not the answer is "in a box by the door". The `loaded` filter
  is that question, and it is the only view in which Guangzhou is shown cargo it
  has already put into a container.
*/
const CHINA_STATUSES: CargoStatus[] = ["RECEIVED_CHINA"];

/** In a box in Guangzhou, not yet at sea. */
const CHINA_LOADED_STATUSES: CargoStatus[] = [
  "ASSIGNED_TO_CONTAINER",
  "CONTAINER_LOADED",
];

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
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    state?: string;
    type?: string;
    from?: string;
    to?: string;
  }>;
}) {
  await primeLocale();
  const user = await requirePermission("inventory.view");
  const { q, state, type, from, to } = await searchParams;
  const query = q?.trim() ?? "";
  const category = type?.trim() ?? "";

  /* Dar's own desk sees Dar. China, and management looking at the origin end,
     see Guangzhou. */
  const inChina =
    can(user.role, "receiving.china") || !can(user.role, "receiving.dar");

  const statuses = inChina ? CHINA_STATUSES : DAR_STATUSES;

  /* A day typed into a date box means the whole of that day. Read as a bare
     timestamp, "to 3 March" excluded everything received on 3 March. */
  const day = (value: string | undefined, endOfDay = false) => {
    if (!value?.trim()) return null;
    const parsed = new Date(`${value.trim()}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const since = day(from);
  const until = day(to, true);

  /* The floor a Guangzhou clerk is standing on is the unassigned pile; asking
     after a consignment already in a box is a different question with its own
     view, and mixing the two made the volume on the floor read as double the
     building. */
  const loadedView = inChina && state === "loaded";

  const filtered: CargoStatus[] = loadedView
    ? CHINA_LOADED_STATUSES
    : state === "waiting"
      ? [inChina ? "RECEIVED_CHINA" : "RECEIVED_DAR"]
      : statuses;

  const receivingFilter =
    since || until
      ? { receivedAt: { ...(since ? { gte: since } : {}), ...(until ? { lte: until } : {}) } }
      : null;

  const cargo = await prisma.cargo.findMany({
    where: {
      deletedAt: null,
      status: { in: filtered },
      ...(state === "hold" ? { operationalHold: true } : {}),
      /* The attention list on the dashboard links straight here: a warning that
         cannot be turned into the actual rows is a warning nobody acts on. */
      ...(state === "nophoto" ? { photos: { none: {} } } : {}),
      /* The rate band, as the floor named it on the line. One consignment can
         carry several, so a match on any line is a match. */
      ...(category
        ? { packages: { some: { deletedAt: null, cargoType: category } } }
        : {}),
      /* Two independent questions, each of which wants an OR of its own — the
         date can match either receiving row, and the search box matches any of
         six columns. Side by side as `OR` they would be one key overwriting the
         other, and the filter that lost would silently do nothing. */
      AND: [
        ...(receivingFilter
          ? [
              inChina
                ? { chinaReceiving: receivingFilter }
                : {
                    OR: [
                      { darReceiving: receivingFilter },
                      { chinaReceiving: receivingFilter },
                    ],
                  },
            ]
          : []),
        ...(query
          ? [
              {
                OR: [
                  { reference: { contains: query, mode: "insensitive" as const } },
                  { shippingMark: { contains: query, mode: "insensitive" as const } },
                  { paperReceiptNo: { contains: query } },
                  { description: { contains: query, mode: "insensitive" as const } },
                  { descriptionZh: { contains: query } },
                  {
                    sender: {
                      OR: [
                        { fullName: { contains: query, mode: "insensitive" as const } },
                        { phone: { contains: query } },
                      ],
                    },
                  },
                ],
              },
            ]
          : []),
      ],
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
          container: {
            select: {
              id: true,
              reference: true,
              containerNumber: true,
              /* The sailing the letter quotes: the vessel, and the day it is
                 due — the same date the customer's tracking page shows. */
              shipment: { select: { vessel: true, eta: true } },
            },
          },
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

  /* The categories the rate book actually prices, so the filter offers what the
     counter was offered rather than a free-text box nobody spells the same. */
  const categories = await cargoTypeOptions();

  /*
    HAS THIS CUSTOMER BEEN TOLD?

    The office desks answer the phone about cargo they cannot see, so the one
    fact the list has to carry is whether the message went out and who sent it.
    Two people looking at the same row must not send the same message twice, and
    a row nobody has touched must be obvious at a glance.

    The floor in Guangzhou does not get this column: it measures, and the desks
    that talk to customers talk to customers — see lib/rbac.ts.
  */
  const canNotify =
    inChina &&
    (can(user.role, "conversation.reply") || can(user.role, "payment.submit"));

  /* Which letter each row is due, read from where its boxes actually are. */
  const letterKind = (item: { status: CargoStatus; clearedAt: Date | null }): ContactKind =>
    letterForStage({ status: item.status, clearedAt: item.clearedAt });

  /* The storage terms a customer is quoted are the company's own, never a
     figure typed into a message. */
  const money = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
    select: { freeStorageDays: true, storagePerDay: true, storageCurrency: true },
  });
  const storage = {
    freeDays: money?.freeStorageDays ?? 7,
    perDay: money?.storagePerDay?.toString() ?? null,
    currency: money?.storageCurrency ?? "USD",
  };

  /* WHAT they were last told, not merely that they were told something. A
     consignment messaged about its arrival in China a month ago and nothing
     since is not "told" about the sailing it is now on. */
  const told = new Map<string, { when: string; by: string; what: string }>();
  if (canNotify && cargo.length > 0) {
    const contacts = await prisma.customerContact.findMany({
      where: { cargoId: { in: cargo.map((item) => item.id) } },
      orderBy: { createdAt: "desc" },
      select: {
        cargoId: true,
        kind: true,
        createdAt: true,
        sentBy: { select: { name: true } },
      },
    });
    /* Newest first, so the first one seen for a consignment is the last one
       sent. */
    for (const contact of contacts) {
      if (!contact.cargoId || told.has(contact.cargoId)) continue;
      told.set(contact.cargoId, {
        when: formatDate(contact.createdAt),
        by: contact.sentBy?.name ?? "somebody",
        what:
          CONTACT_KIND_LABELS[contact.kind as ContactKind] ?? contact.kind,
      });
    }
  }

  const floorCbm = cargo.reduce((sum, item) => {
    const cbm = inChina
      ? item.chinaReceiving?.cbm
      : (item.darReceiving?.cbm ?? item.chinaReceiving?.cbm);
    return sum + Number(cbm ?? 0);
  }, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={inChina ? T("Guangzhou floor") : T("Dar es Salaam floor")}
        description={
          inChina
            ? loadedView
              ? T("Received in Guangzhou and already in a container, with the box it went into.")
              : T("Everything received and still waiting for a container.")
            : T("Everything landed in Dar, oldest first.")
        }
        actions={
          inChina && can(user.role, "receiving.china") ? (
            <Button asChild>
              <Link href="/app/receive/new">
                <Package />
                {T("Receive cargo")}
              </Link>
            </Button>
          ) : null
        }
      />
      <SectionTabs />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          label={loadedView ? T("Shown here") : T("On the floor")}
          numeric={cargo.length}
          icon={Warehouse}
          tone="brand"
          hint={loadedView ? T("Consignments in a box") : T("Consignments physically here")}
        />
        <KpiCard
          index={1}
          label={inChina ? T("Waiting for a container") : T("Waiting to be released")}
          numeric={waiting}
          icon={Boxes}
          tone={waiting > 0 ? "signal" : "success"}
          href={inChina ? "/app/inventory?state=waiting" : "/app/release"}
        />
        <KpiCard
          index={2}
          label={inChina ? T("Gone into containers") : T("Cleared to go")}
          numeric={loaded}
          icon={ContainerIcon}
          tone="marine"
          hint={inChina ? T("Still in Guangzhou, in a box") : undefined}
          href={inChina ? "/app/inventory?state=loaded" : undefined}
        />
        <KpiCard
          index={3}
          label={loadedView ? T("Volume shown") : T("Volume on the floor")}
          numeric={floorCbm}
          decimals={2}
          suffix="CBM"
          icon={Package}
          tone="success"
        />
      </div>

      <form className="flex flex-wrap gap-3">
        <Input
          name="q"
          defaultValue={query}
          placeholder={T("Reference, mark, receipt no., customer or phone…")}
          className="max-w-sm"
          aria-label={T("Search the floor")}
        />
        <NativeSelect
          name="state"
          defaultValue={state ?? ""}
          className="w-56"
          aria-label={T("Filter")}
        >
          <option value="">{T("Everything here")}</option>
          <option value="waiting">
            {inChina ? "Waiting for a container" : "Not yet released"}
          </option>
          {/* The other half of the building's stock. Not mixed into the default
              view, where it would double the volume on the floor, but reachable
              — "where is SC0041" is asked of the floor either way. */}
          {inChina ? <option value="loaded">{T("In a container")}</option> : null}
          <option value="hold">{T("On hold")}</option>
          <option value="nophoto">{T("No photograph")}</option>
        </NativeSelect>
        {categories.length > 0 ? (
          <NativeSelect
            name="type"
            defaultValue={category}
            className="w-48"
            aria-label={T("Cargo type")}
          >
            <option value="">{T("Any cargo type")}</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        {/* Received between two dates. The floor is asked this every time
            somebody reconciles a week of the paper book against the screen. */}
        <Input
          type="date"
          name="from"
          defaultValue={from ?? ""}
          min="2000-01-01"
          max="2099-12-31"
          className="w-40"
          aria-label={T("Received from")}
        />
        <Input
          type="date"
          name="to"
          defaultValue={to ?? ""}
          min="2000-01-01"
          max="2099-12-31"
          className="w-40"
          aria-label={T("Received up to")}
        />
        <Button type="submit" variant="outline">
          {T("Filter")}
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
              title={query ? T("Nothing matches") : T("The floor is clear")}
              description={
                query
                  ? T("Try a receipt number, or the mark written on the box.")
                  : loadedView
                    ? T("Nothing received in Guangzhou is sitting in a container.")
                    : inChina
                      ? T("Nothing is waiting. Everything received has gone into a container.")
                      : T("Nothing landed is still sitting here.")
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {/* THE NAME LEADS. A clerk looking for a consignment on the
                      floor is looking for a person — the tracking number is how
                      they confirm it, not how they find it. */}
                  <TableHead>{T("Customer")}</TableHead>
                  <TableHead>{T("Tracking no.")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{T("Goods")}</TableHead>
                  <TableHead className="text-right">{T("Pkgs")}</TableHead>
                  {/* Weight is not what this floor is sold or planned on —
                      volume is, and a kilo figure beside a cubic metre invited
                      somebody to price on the wrong one. It is still on the
                      consignment, where a claim needs it. */}
                  <TableHead className="text-right">{T("Pieces")}</TableHead>
                  <TableHead className="text-right">CBM</TableHead>
                  <TableHead>{T("Proof")}</TableHead>
                  {/* "Received in China" on the Guangzhou floor is every row
                      saying the name of the page. It is the customer's sentence,
                      not the warehouse's, and the date beside it already says
                      when. Dar keeps it: there a consignment can be landed,
                      booked in or cleared to go, and those are different jobs. */}
                  {inChina ? null : <TableHead>{T("Status")}</TableHead>}
                  {/* Nothing in the default Guangzhou view is in a container —
                      that is what "on the floor" means, and a column of "Not
                      assigned" was one word repeated twenty-three times. It
                      comes back for the loaded view, where the box it went into
                      is the whole reason somebody opened the list, and Dar keeps
                      it always: there, the box it came off is how a consignment
                      is found. */}
                  {!inChina || loadedView ? <TableHead>{T("Container")}</TableHead> : null}
                  {/* Which warehouse it is in is the title of the page, and a
                      shelf number nobody fills in was two lines of nothing. The
                      date it came in is the fact a clerk actually wants. */}
                  <TableHead className="hidden xl:table-cell">{T("Received")}</TableHead>
                  {canNotify ? <TableHead>{T("Customer told")}</TableHead> : null}
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
                        {P(item.description, item.descriptionZh)}
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
                          <Badge tone="warn">{T("No photo")}</Badge>
                        )}
                      </TableCell>
                      {inChina ? null : (
                        <TableCell>
                          <CargoStatusBadge status={item.status} />
                        </TableCell>
                      )}
                      {!inChina || loadedView ? (
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
                      ) : null}
                      <TableCell className="tnum hidden text-sm text-muted-foreground xl:table-cell">
                        {formatDate(receiving?.receivedAt)}
                      </TableCell>
                      {canNotify ? (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {/* THE LETTER THIS CONSIGNMENT IS ACTUALLY DUE.

                                One button, and what it says follows the boxes:
                                received in China, then on the way with the day
                                it is expected, then at the port in clearance,
                                then come and collect. Sending "received in
                                China" about cargo already at sea is how a
                                customer learns to ignore our messages. */}
                            <WhatsAppButton
                              cargoId={item.id}
                              phone={whatsappNumber(item.sender.phone)}
                              kind={letterKind(item)}
                              label={T("Notify")}
                              /* Written here, on the server, from the row the
                                 clerk is looking at — a figure retyped into a
                                 phone is a figure that can be typed wrong. */
                              message={composeMessage(letterKind(item), {
                                customerName: item.sender.fullName,
                                reference: item.reference,
                                description: item.description,
                                shippingMark: item.shippingMark,
                                packages: receiving?.packagesCount ?? null,
                                pieces: pieces > 0 ? pieces : null,
                                weightKg: receiving?.weightKg?.toString() ?? null,
                                cbm: receiving?.cbm ? Number(receiving.cbm).toFixed(3) : null,
                                receiptNumber: item.paperReceiptNo,
                                containerNumber:
                                  container?.containerNumber ?? container?.reference ?? null,
                                vessel: item.containerLines.at(-1)?.container.shipment?.vessel ?? null,
                                eta: item.containerLines.at(-1)?.container.shipment?.eta ?? null,
                                freeStorageDays: storage.freeDays,
                                storagePerDay: storage.perDay,
                                storageCurrency: storage.currency,
                              })}
                            />
                            {told.get(item.id) ? (
                              <span className="text-xs text-muted-foreground">
                                {told.get(item.id)!.what}
                                <span className="tnum block">
                                  {told.get(item.id)!.when} · {told.get(item.id)!.by}
                                </span>
                              </span>
                            ) : (
                              <Badge tone="warn">{T("Not told")}</Badge>
                            )}
                          </div>
                        </TableCell>
                      ) : null}
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
