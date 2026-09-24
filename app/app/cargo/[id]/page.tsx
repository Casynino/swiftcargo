import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { QrCode } from "lucide-react";

import { CargoTimeline } from "@/components/app/cargo-timeline";
import { CargoDetailsEdit } from "@/components/app/cargo-details-edit";
import { ChinaReceivePanel } from "@/components/app/china-receive-panel";
import { CopyField } from "@/components/app/copy-field";
import { DarCountCorrection } from "@/components/app/dar-count-correction";
import { DeliveryNoteButton } from "@/components/app/delivery-note-button";
import { DeleteCargoButton } from "@/components/app/delete-cargo-button";
import { Field } from "@/components/app/field";
import { HoldToggle } from "@/components/app/hold-toggle";
import { MeasurementCompare } from "@/components/app/measurement-compare";
import { PackageEditor } from "@/components/app/package-editor";
import { BoxesCard } from "@/components/app/boxes-card";
import { PageHeader } from "@/components/app/page-header";
import { bookCategories, categoryOfCargo } from "@/lib/rate-categories";
import { ClearanceButton } from "@/components/app/clearance-button";
import { PhotoPanel } from "@/components/app/photo-upload";
import { CargoStatusBadge } from "@/components/app/status-badge";
import { NotifyCustomer, type MessageOption } from "@/components/app/notify-customer";
import { CargoActions } from "@/components/app/cargo-actions";
import { StorageCard } from "@/components/app/storage-card";
import { ValuationPanel } from "@/components/app/valuation-panel";
import { WhatsAppButton } from "@/components/app/whatsapp-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cargoById } from "@/lib/cargo";
import { variance } from "@/lib/cbm";
import { CARGO_STATUS_META, INVOICE_STATUS_LABELS } from "@/lib/constants";
import {
  formatCbm,
  formatDate,
  formatDateTime,
  formatMoney,
  formatWeight,
} from "@/lib/format";
import { balanceOf, outstandingOf } from "@/lib/invoice-balance";
import { formatCurrency } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { storagePosition } from "@/lib/storage-fee";
import { receiverLockReason } from "@/lib/cargo-corrections";
import { t } from "@/lib/i18n";
import { can, canAmendCargo, cargoCustody } from "@/lib/rbac";
import { localeOf } from "@/lib/viewer-locale";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  composeMessage,
  CONTACT_KIND_LABELS,
  letterForStage,
  whatsappNumber,
  type ContactKind,
  messageStage,
  billLetter,
} from "@/lib/messages";
import { cargoTypeOptions, valueLines } from "@/lib/valuation";
import { distinctMark } from "@/lib/customer-name";
import { storageStart } from "@/lib/storage-clock";

import { P, primeLocale, T } from "@/lib/server-t";
import { Tm, Tx } from "@/components/app/tx";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const cargo = await prisma.cargo.findUnique({
    where: { id },
    select: { reference: true },
  });
  return { title: cargo?.reference ?? "Cargo" };
}

/**
 * One consignment, whole.
 *
 * Every department reads this page and each sees a different set of controls —
 * the difference is decided per-panel by permission and by custody, never by
 * rendering a different page per role. One screen means the Dar clerk and the
 * Guangzhou clerk are looking at the same facts when they disagree on the phone.
 */
export default async function CargoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ box?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("cargo.view");
  const { id } = await params;
  const { box: scannedBox } = await searchParams;

  /* The rate book's readers get the valuation; the floors never receive it at
     all. See cargoById — this is a strip, not a hidden div. */
  /* The storage line on the message reads from settings, so changing the rate
     changes every message without anybody editing wording. */
  const money = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
    select: { freeStorageDays: true, storagePerDay: true, storageCurrency: true },
  });

  const accounts = await prisma.bankAccount.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, bankName: true, currency: true, branch: true, kind: true },
  });

  const cargo = await cargoById(id, can(user.role, "rate.view"));
  if (!cargo) notFound();

  const warehouses = await prisma.warehouse.findMany({
    where: { active: true, kind: "CHINA" },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const amend = canAmendCargo(user.role, cargo.status);
  const locale = await localeOf(user.id);
  /* The lines belong to whichever floor holds the cargo, Dar included once it
     has booked the boxes in. The actions apply the same custody — see
     lib/cargo-corrections.ts. */
  const chinaHolds = cargoCustody(cargo.status) === "CHINA";
  const canEditDetails = can(user.role, "cargo.edit") && amend;

  const cargoTypes = await cargoTypeOptions();

  /*
    THE COUNTER, ON THE CARGO RECORD.

    Money is taken by the person the customer is standing in front of, looking
    at the consignment they came for — not by hunting for an invoice number on
    another screen. The customer's other open bills come with it, because
    somebody with four consignments hands over one lot of money.
  */
  const line = cargo.containerLines.at(-1);
  const container = line?.container;

  /*
    WHAT SUPPORT WOULD SAY TO THIS CUSTOMER RIGHT NOW.

    Composed on the server from the consignment itself, so nobody retypes a
    reference or a volume into WhatsApp. The stage the cargo has actually
    reached is marked as suggested; the rest stay available, because a customer
    ringing about last month's container still needs an answer.
  */
  const canNotify = can(user.role, "conversation.reply");
  const messageContext = {
    customerName: cargo.sender.fullName,
    reference: cargo.reference,
    description: cargo.description,
    shippingMark: cargo.shippingMark,
    packages:
      cargo.darReceiving?.packagesCount ?? cargo.chinaReceiving?.packagesCount ?? null,
    pieces: cargo.darReceiving?.piecesCount ?? cargo.chinaReceiving?.piecesCount ?? null,
    weightKg:
      (cargo.darReceiving?.weightKg ?? cargo.chinaReceiving?.weightKg)?.toString() ?? null,
    /* The number in the counter's paper book — what a customer in Guangzhou is
       holding when they ring. */
    receiptNumber: cargo.paperReceiptNo,
    cbm: (cargo.darReceiving?.cbm ?? cargo.chinaReceiving?.cbm)?.toString() ?? null,
    containerNumber: container?.containerNumber ?? container?.reference ?? null,
    vessel: container?.shipment?.vessel ?? null,
    eta: container?.shipment?.eta ?? null,
    freeStorageDays: money?.freeStorageDays ?? 7,
    storagePerDay: money?.storagePerDay?.toString() ?? null,
    storageCurrency: money?.storageCurrency ?? "USD",
    storageFrom: storageStart(cargo.darReceiving?.receivedAt, cargo.clearedAt),
    stage: messageStage({
      status: cargo.status,
      hasDarReceiving: Boolean(cargo.darReceiving),
      clearedAt: cargo.clearedAt,
    }),
    statusLine:
      cargo.status === "READY_FOR_RELEASE"
        ? "Ready for pickup"
        : cargo.darReceiving || cargo.status === "ARRIVED_TANZANIA"
          ? cargo.clearedAt
            ? "Cleared"
            : "Clearance in Progress"
          : null,
  };

  /* One rule for which letter is due, shared with the floor list so the two
     screens never offer a customer two different sentences about the same
     boxes — see letterForStage in lib/messages.ts. */
  const suggestedKind: ContactKind = letterForStage({
    status: cargo.status,
    clearedAt: cargo.clearedAt,
    hasDarReceiving: Boolean(cargo.darReceiving),
  });

  const lastContact = canNotify
    ? await prisma.customerContact.findFirst({
        where: { cargoId: cargo.id },
        orderBy: { createdAt: "desc" },
        include: { sentBy: { select: { name: true } } },
      })
    : null;

  const takePayment = can(user.role, "payment.submit");
  const payableHere = takePayment
    ? cargo.invoices.find((i) =>
        ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(i.status)
      )
    : null;

  /* The bill this page acts on: the open one, else the latest that is not
     cancelled — a draft still has a door to it, and a settled one still has
     its corrections and its download. */
  const billHere =
    payableHere ??
    [...cargo.invoices].reverse().find((i) => i.status !== "CANCELLED") ??
    null;

  /* The price dialog changes category and volume only on a bill with one
     freight line; one with several is changed line by line on the bill. */
  const freightLines = billHere
    ? await prisma.invoiceItem.count({ where: { invoiceId: billHere.id, unit: "CBM" } })
    : 0;
  const categories = can(user.role, "invoice.discount") ? await bookCategories() : [];

  const pickupNote = can(user.role, "finance.view")
    ? await prisma.pickupNote.findUnique({
        where: { cargoId: cargo.id },
        select: { id: true, noteNumber: true, status: true, onCredit: true },
      })
    : null;

  const [otherBills, liveRate] = takePayment
    ? await Promise.all([
        prisma.invoice.findMany({
          where: {
            customerId: cargo.receiverId,
            cargoId: { not: cargo.id },
            status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
          },
          orderBy: { issuedAt: "asc" },
          include: {
            payments: true,
            cargo: { select: { reference: true } },
          },
        }),
        prisma.exchangeRate.findFirst({
          where: { active: true },
          orderBy: { effectiveFrom: "desc" },
          select: { rate: true },
        }),
      ])
    : [[], null];

  /*
    Priced on the server for the desks that may see the rate book, and never
    sent to a browser that has no business with it. The check is here rather
    than around the JSX because a component that is not rendered has still had
    its props serialised into the page — a warehouse clerk reading the page
    source would find every figure in it.

    The gate is `rate.view`, not `finance.view`. This panel is the price list
    applied to somebody's goods, and neither floor may see it. Reading a bill
    that already exists is a different question and stays with `finance.view`
    further down, because a customer at the Dar counter does ask whether they
    are paid up.
  */
  const valuation = can(user.role, "rate.view")
    ? await valueLines(cargo.packages, {
        service: cargo.service,
        customerId: cargo.senderId,
      })
    : null;
  const china = cargo.chinaReceiving;
  const dar = cargo.darReceiving;

  /* What the floor space has cost, against what is actually on the bill. The
     two are deliberately different figures — a clerk who waived half of it last
     week needs to see both, or they will waive it again. */
  const storage = storagePosition({
    receivedAt: storageStart(dar?.receivedAt, cargo.clearedAt),
    collectedAt: cargo.release?.releasedAt ?? null,
    freeDays: money?.freeStorageDays ?? 7,
    perDay: money?.storagePerDay ?? 0,
    currency: money?.storageCurrency ?? "USD",
  });
  /* Read separately rather than joined onto the invoice: the cargo query is
     shared with screens that must never see a money figure. */
  const storageOnBill = billHere
    ? Number(
        (
          await prisma.invoiceItem.aggregate({
            where: { invoiceId: billHere.id, category: "Storage" },
            _sum: { amount: true },
          })
        )._sum.amount ?? 0
      )
    : 0;

  const otherUnpaid = otherBills.filter((i) => !balanceOf(i).settled).length;

  const pickupNoteState = canEditDetails
    ? await prisma.pickupNote.findUnique({
        where: { cargoId: cargo.id },
        select: { status: true },
      })
    : null;
  /* Open for as long as Dar holds the record, hand-over included: a weight
     can be corrected after release, a count cannot be lowered — the action
     says so rather than the button disappearing. */
  const canCorrectDar =
    !!dar && !chinaHolds && can(user.role, "cargo.edit") && amend;

  const weightDelta = variance(china?.weightKg, dar?.weightKg);
  const piecesDelta = variance(china?.piecesCount, dar?.piecesCount);
  const cbmDelta = variance(china?.cbm, dar?.cbm);
  const packageDelta = variance(china?.packagesCount, dar?.packagesCount);

  const liveBills = cargo.invoices.filter(
    (i) => i.status !== "DRAFT" && i.status !== "CANCELLED"
  );
  const owing = liveBills.reduce((sum, i) => sum + Number(outstandingOf(i)), 0);
  const notifyKind: ContactKind =
    messageContext.stage === "ready" && owing <= 0
      ? "cargo.ready"
      : billLetter(messageContext.stage, owing > 0);
  /* The shilling balance, summed in shillings. One rate is named only when
     every bill shares it. */
  const owingTzs = liveBills.reduce(
    (sum, i) => sum + (balanceOf(i).outstandingTzs?.toNumber() ?? 0),
    0
  );
  const billRates = [...new Set(liveBills.map((i) => balanceOf(i).rate?.toString()).filter(Boolean))];

  /*
    PAID OR NOT, WITHOUT SAYING HOW MUCH.

    This is the answer a warehouse needs when somebody scans a box at the
    counter and asks whether it can go, and it is not the same thing as a price.
    The rule the floor is kept behind is rates and amounts — what a customer was
    charged is Finance's business — but "settled" or "still owing" is a yes or a
    no, and withholding it means a clerk rings the office for every collection.

    Only the word, never the figure. Finance sees the money below, on its own
    permission, and the amount never reaches this page for anybody else.
  */
  const billed = cargo.invoices.some(
    (i) => i.status !== "DRAFT" && i.status !== "CANCELLED"
  );
  const settled = billed && owing <= 0;

  /* What the Dar bench wrote on the condition. GOOD says nothing worth a tag;
     anything else is the fact about these boxes, whatever else is true. */
  const damageTag =
    dar && dar.condition !== "GOOD"
      ? T(CONDITION_LABEL[dar.condition] ?? "Damaged")
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={cargo.reference}
        description={`${cargo.receiver.fullName} · ${T(CARGO_STATUS_META[cargo.status].publicLabel)}`}
        back={
          user.role === "FINANCE"
            ? { href: "/app/finance/collections", label: "Payment follow-up" }
            : { href: "/app/cargo", label: "All cargo" }
        }
        actions={
          <>
            <CargoStatusBadge status={cargo.status} />
            {/* Arrived is not cleared: said beside the status, never inside it. */}
            {(dar || cargo.status === "ARRIVED_TANZANIA") &&
            !["COLLECTED", "DELIVERED", "CANCELLED", "MISSING_AT_DAR"].includes(cargo.status) ? (
              cargo.clearedAt ? (
                <Badge tone="good">{T("Cleared")} {formatDate(cargo.clearedAt)}</Badge>
              ) : (
                <Badge tone="warn">{T("In customs clearance")}</Badge>
              )
            ) : null}
            {(dar || cargo.status === "ARRIVED_TANZANIA") && !cargo.clearedAt && can(user.role, "cargo.clear") &&
            !["COLLECTED", "DELIVERED", "CANCELLED", "MISSING_AT_DAR"].includes(cargo.status) ? (
              <ClearanceButton cargoId={cargo.id} waiting={1} />
            ) : null}
            {/* Printed at the counter while the boxes are still on the floor —
                one sticker per carton, each with its own code. */}
            {can(user.role, "receiving.china") && cargo.packages.length > 0 ? (
              <Button asChild variant="outline">
                <Link href={`/app/cargo/${cargo.id}/label`}>
                  <QrCode />
                  {T("Print labels")}
                </Link>
              </Button>
            ) : null}
            {can(user.role, "deliveryNote.view") ? (
              <DeliveryNoteButton
                cargoId={cargo.id}
                existing={cargo.deliveryNote}
                canIssue={
                  can(user.role, "deliveryNote.issue") && !!china && amend
                }
              />
            ) : null}
          </>
        }
      />

      {/* CLEARED, NOT CHECKED IN. Storage starts only when the Dar warehouse
          books the goods in, so whoever pressed Cleared — and whoever opens
          this afterwards — is told who has to act next, until they do. */}
      {cargo.clearedAt && !dar && cargo.status === "ARRIVED_TANZANIA" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-l-4 border-l-warning bg-warning/[0.06] px-4 py-3">
          <p className="text-sm">
            <span className="font-medium">{T("Cleared — waiting to be checked in.")}</span>{" "}
            <span className="text-muted-foreground">
              {can(user.role, "receiving.dar")
                ? T("Check it in on the Receiving dock. Storage starts counting from check-in.")
                : T("Ask the Dar warehouse to check it in. Storage starts counting from check-in.")}
            </span>
          </p>
          {can(user.role, "receiving.dar") ? (
            <Button asChild size="sm">
              <Link href="/app/receive/dar">{T("Receiving dock")}</Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {cargo.operationalHold && can(user.role, "cargo.hold") ? (
        <HoldToggle
          cargoId={cargo.id}
          held
          reason={cargo.operationalHoldReason}
        />
      ) : cargo.operationalHold ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Held: {cargo.operationalHoldReason}
        </p>
      ) : null}

      {cargo.operationalHold ||
      damageTag ||
      cargo.exceptions.some((e) => e.status !== "RESOLVED" && e.status !== "CLOSED") ? (
        <div className="flex flex-wrap items-center gap-2">
          {cargo.operationalHold ? <Badge tone="bad">{T("On hold")}</Badge> : null}
          {/* THE TAG TRAVELS WITH THE CARGO. The bale that came off wet is
              tagged on the check-in row, on the container's list and on the
              price list Finance reads; this page was the one place it was not,
              so a clerk opening the record saw a clean consignment. */}
          {damageTag ? <Badge tone="bad">{damageTag}</Badge> : null}
          {cargo.exceptions.some((e) => e.status !== "RESOLVED" && e.status !== "CLOSED") ? (
            <Badge tone="warn">{T("Open case")}</Badge>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/*
            ONE CARD OF FACTS, IN A GRID.

            What it is, how much of it, where it is and whose it is — read at a
            glance, each fact in its own cell, rather than spread over separate
            cards for the consignment, the tracking code and the container.
          */}
          <Card className="overflow-hidden">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">{t(locale, "Cargo")}</CardTitle>
                {canEditDetails ? (
                  <CargoDetailsEdit
                    locale={locale}
                    cargoTypes={cargoTypes}
                    receiverLocked={receiverLockReason({
                      invoices: cargo.invoices,
                      release: cargo.release,
                      pickupNote: pickupNoteState,
                    })}
                    cargo={{
                      id: cargo.id,
                      reference: cargo.reference,
                      receiver: {
                        id: cargo.receiver.id,
                        code: cargo.receiver.code,
                        fullName: cargo.receiver.fullName,
                        businessName: cargo.receiver.businessName,
                        phone: cargo.receiver.phone,
                        shippingMark: cargo.receiver.shippingMark,
                      },
                      sender: {
                        id: cargo.sender.id,
                        code: cargo.sender.code,
                        fullName: cargo.sender.fullName,
                        businessName: cargo.sender.businessName,
                        phone: cargo.sender.phone,
                        shippingMark: cargo.sender.shippingMark,
                      },
                      shippingMark: cargo.shippingMark,
                      description: cargo.description,
                      commodity: cargo.commodity,
                      paperReceiptNo: cargo.paperReceiptNo,
                      notes: cargo.notes,
                      internalNotes: can(user.role, "cargo.viewInternal")
                        ? cargo.internalNotes
                        : undefined,
                      lines: cargo.packages.map((p) => ({
                        id: p.id,
                        reference: p.reference,
                        description: p.description,
                        cargoType: p.cargoType,
                      })),
                    }}
                  />
                ) : null}
              </div>
            </CardHeader>
            <dl className="grid grid-cols-1 border-t sm:grid-cols-3">
              {(
                [
                  ["Goods type", [...new Set(cargo.packages.map((p) => p.cargoType).filter(Boolean))].map((type) => T(String(type))).join(", ") || cargo.commodity || "—"],
                  [
                    "Counted as",
                    dar || china
                      ? <Tm>{`${dar?.packagesCount ?? china?.packagesCount} package(s)`}</Tm>
                      : cargo.declaredPackages
                        ? <Tm>{`${cargo.declaredPackages} declared`}</Tm>
                        : "—",
                  ],
                  ["Volume", dar?.cbm ? formatCbm(dar.cbm) : china?.cbm ? formatCbm(china.cbm) : "—"],
                  ["Weight", dar?.weightKg ? formatWeight(dar.weightKg) : china?.weightKg ? formatWeight(china.weightKg) : "—"],
                  ["Origin", china?.warehouse?.name ?? "Guangzhou"],
                  [
                    "Container",
                    container ? (
                      <Link href={`/app/containers/${container.id}`} className="tnum hover:underline">
                        {container.containerNumber ?? container.reference}
                      </Link>
                    ) : (
                      T("Waiting in China")
                    ),
                  ],
                  [
                    "Name / shipping mark",
                    <span key="c">
                      <Link href={`/app/customers/${cargo.receiverId}`} className="hover:underline">
                        {cargo.receiver.fullName}
                      </Link>
                      {distinctMark(cargo.receiver.fullName, cargo.shippingMark) ? (
                        <span className="block text-sm text-muted-foreground">
                          Mark: {cargo.shippingMark}
                        </span>
                      ) : null}
                    </span>,
                  ],
                  ["Phone", <span key="p" className="tnum">{cargo.receiver.phone}</span>],
                  [
                    "Customer code",
                    <span key="k" className="tnum inline-flex rounded-md border px-2 py-0.5 text-sm">
                      {cargo.receiver.code}
                    </span>,
                  ],
                  ["Booked", formatDate(cargo.createdAt)],
                  ["Vessel", container?.shipment?.vessel ?? T("Not recorded")],
                  [
                    container?.shipment?.actualArrival ? "Arrived" : "ETA",
                    formatDate(container?.shipment?.actualArrival ?? container?.shipment?.eta),
                  ],
                ] as [string, React.ReactNode][]
              ).map(([label, value], index) => (
                <div
                  key={label}
                  className={cn(
                    "min-w-0 border-b px-6 py-4",
                    /* A line between columns, never after the last one. */
                    index % 3 !== 2 && "sm:border-r"
                  )}
                >
                  <dt className="text-sm text-muted-foreground"><Tx>{label}</Tx></dt>
                  <dd className="mt-1 break-words font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="px-6 py-4">
              <p className="text-sm text-muted-foreground">{T("Description")}</p>
              <p className="mt-1">{P(cargo.description, cargo.descriptionZh)}</p>
              {cargo.receiverId !== cargo.senderId ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {T("Sent by")}{" "}
                  <Link href={`/app/customers/${cargo.senderId}`} className="hover:underline">
                    {cargo.sender.fullName}
                  </Link>
                </p>
              ) : null}
              {cargo.notes ? <p className="mt-3 rounded-md bg-secondary px-3 py-2 text-sm">{cargo.notes}</p> : null}
            </div>
          </Card>

          {/*
            BOTH MEASUREMENTS, WHENEVER DAR HAS ONE.

            Shown from the moment Dar books the boxes in, not only when the two
            disagree: a Dar correction is made against China's figure, and a
            clerk who cannot see the column they are not changing cannot tell
            what their correction did to the gap.
          */}
          {dar ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t(locale, "What each warehouse counted")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <MeasurementCompare
                  rows={[
                    {
                      label: t(locale, "Packages"),
                      china: china ? String(china.packagesCount) : "—",
                      dar: String(dar.packagesCount),
                      delta: packageDelta
                        ? (packageDelta.difference.greaterThan(0) ? "+" : "") +
                          packageDelta.difference.toString()
                        : null,
                      differs: !!packageDelta && !packageDelta.difference.isZero(),
                    },
                    {
                      label: t(locale, "Pieces"),
                      china: china?.piecesCount != null ? String(china.piecesCount) : "—",
                      dar: dar.piecesCount != null ? String(dar.piecesCount) : "—",
                      delta: piecesDelta
                        ? (piecesDelta.difference.greaterThan(0) ? "+" : "") +
                          piecesDelta.difference.toString()
                        : null,
                      differs: !!piecesDelta && !piecesDelta.difference.isZero(),
                    },
                    {
                      label: t(locale, "Weight"),
                      china: china?.weightKg ? formatWeight(china.weightKg) : "—",
                      dar: dar.weightKg ? formatWeight(dar.weightKg) : "—",
                      delta: weightDelta
                        ? `${weightDelta.difference.greaterThan(0) ? "+" : ""}${weightDelta.difference.toFixed(2)} kg`
                        : null,
                      differs: !!weightDelta && !weightDelta.difference.isZero(),
                    },
                    {
                      label: t(locale, "Volume"),
                      china: china ? formatCbm(china.cbm) : "—",
                      dar: dar.cbm ? formatCbm(dar.cbm) : "—",
                      delta: cbmDelta
                        ? `${cbmDelta.difference.greaterThan(0) ? "+" : ""}${cbmDelta.difference.toFixed(3)} CBM`
                        : null,
                      differs: !!cbmDelta && !cbmDelta.difference.isZero(),
                    },
                  ]}
                />
                <p className="text-xs text-muted-foreground">
                  {t(
                    locale,
                    "Neither column corrects the other. Both are true statements about different moments, and the gap between them is the record of what happened on the water."
                  )}
                </p>
                {canCorrectDar ? (
                  <DarCountCorrection
                    cargoId={cargo.id}
                    locale={locale}
                    current={{
                      packagesCount: dar.packagesCount,
                      piecesCount: dar.piecesCount,
                      weightKg: dar.weightKg?.toString() ?? null,
                      cbm: dar.cbm?.toString() ?? null,
                    }}
                  />
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {valuation && !cargo.invoices.some((i) => i.status !== "CANCELLED") ? (
            <ValuationPanel
              valuation={valuation}
              invoiced={cargo.invoices.some((i) => i.status !== "CANCELLED")}
              atReceiving={
                cargo.estimatedValue && cargo.estimatedAt
                  ? {
                      total: cargo.estimatedValue.toString(),
                      currency: cargo.estimatedCurrency ?? "USD",
                      on: cargo.estimatedAt,
                    }
                  : null
              }
            />
          ) : null}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">{T("Packages")}</CardTitle>
                <span className="text-sm text-muted-foreground">
                  <Tm>{`${cargo.packages.length} line(s)`}</Tm>
                  {dar ? ` · ${T("checked in at Dar")}` : china ? ` · ${T("received in China")}` : ""}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {!chinaHolds && dar && cargo.packages.length > 0 ? (
                <p className="mb-3 text-xs text-muted-foreground">
                  {t(
                    locale,
                    "Dar corrects these lines now. Every change is kept with the old figure, and China's own totals stay as China measured them."
                  )}
                </p>
              ) : null}
              <PackageEditor
                cargoId={cargo.id}
                checkedInAtDar={!chinaHolds && !!dar}
                canEdit={can(user.role, "cargo.edit") && amend}
                canOverride={can(user.role, "cbm.override") && amend}
                cargoTypes={cargoTypes}
                lines={cargo.packages.map((p) => ({
                  id: p.id,
                  reference: p.reference,
                  packageType: p.packageType,
                  cargoType: p.cargoType,
                  description: p.description,
                  quantity: p.quantity,
                  unit: p.unit,
                  length: p.length?.toString() ?? null,
                  width: p.width?.toString() ?? null,
                  height: p.height?.toString() ?? null,
                  weightKg: p.weightKg?.toString() ?? null,
                  cbm: p.cbm.toString(),
                  cbmOverridden: p.cbmOverridden,
                  balerNumber: p.balerNumber,
                  paperReceiptNo: p.paperReceiptNo,
                  descriptionZh: p.descriptionZh,
                  pieces: p.pieces,
                  netWeightKg: p.netWeightKg?.toString() ?? null,
                  modelNo: p.modelNo,
                  declaredUnitValue: p.declaredUnitValue?.toString() ?? null,
                }))}
              />
            </CardContent>
          </Card>

          <BoxesCard
            cargoId={cargo.id}
            highlight={scannedBox ?? null}
            canReport={can(user.role, "receiving.dar") || can(user.role, "receiving.china")}
            canMissing={can(user.role, "receiving.dar")}
            canPrint={can(user.role, "receiving.dar") || can(user.role, "receiving.china")}
          />

          {/* READING WHAT CHINA WROTE IS NOT RECEIVING.

              The card was gated on `receiving.china`, which is the right to
              put boxes on the system — so the Dar clerk holding the cargo
              could not read the measurement they are supposed to be checking
              theirs against, and the rule that both figures are kept and the
              difference shown had nobody to show it to. The staff note, the
              shelf and the clerk's name are internal, so the card asks for
              `cargo.viewInternal`; the form that writes the row still asks
              for the right to write it. */}
          {can(user.role, "receiving.china") ||
          can(user.role, "cargo.viewInternal") ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{T("China receiving")}</CardTitle>
              </CardHeader>
              <CardContent>
                {china ? (
                  <dl className="mb-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
                    <Field
                      label="Received"
                      value={formatDateTime(china.receivedAt)}
                    />
                    <Field label="By" value={china.receivedBy?.name} />
                    <Field label="Warehouse" value={china.warehouse.name} />
                    <Field
                      label="Condition"
                      value={T(CONDITION_LABEL[china.condition] ?? "Good")}
                    />
                    <Field label="Location" value={china.location} />
                    <Field label="Notes" value={china.notes} />
                  </dl>
                ) : null}
                {/* Custody says whose record it is; the permission says who may
                    write a receiving row at all. A desk holding one without the
                    other gets no form rather than a form the action refuses. */}
                {can(user.role, "receiving.china") ? (
                  amend ? (
                    <ChinaReceivePanel
                      cargoId={cargo.id}
                      warehouses={warehouses}
                      defaultWarehouseId={user.warehouseId}
                      existing={
                        china
                          ? {
                              packagesCount: china.packagesCount,
                              piecesCount: china.piecesCount,
                              weightKg: china.weightKg?.toString() ?? null,
                              condition: china.condition,
                              location: china.location,
                              notes: china.notes,
                              warehouseId: china.warehouseId,
                            }
                          : null
                      }
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {T("This consignment has left China. Dar holds the record now.")}
                    </p>
                  )
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{T("Photos")}</CardTitle>
            </CardHeader>
            <CardContent>
              <PhotoPanel
                cargoId={cargo.id}
                canUpload={can(user.role, "cargo.photo")}
                photos={cargo.photos.map((p) => ({
                  id: p.id,
                  url: p.url,
                  kind: p.kind,
                  caption: p.caption,
                  takenAt: formatDateTime(p.takenAt),
                  uploadedBy: p.uploadedBy?.name ?? null,
                }))}
              />
            </CardContent>
          </Card>
          {/*
            THE HISTORY GOES UNDER THE RECORD, NOT BESIDE IT.

            The right column is four short cards — storage, the merge hint, the
            payment form, the bill — and the timeline is twenty. Standing them
            side by side left half a screen of nothing under the left column
            while the right one ran on. The journey belongs at the foot of the
            record it describes, which is where a person reads it anyway.
          */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{T("Status history")}</CardTitle>
            </CardHeader>
            <CardContent>
              <CargoTimeline
                status={cargo.status}
                history={cargo.history.map((h) => ({
                  to: h.to,
                  at: formatDateTime(h.createdAt),
                  by: h.actor?.name ?? null,
                  reason: h.reason,
                }))}
              />
            </CardContent>
          </Card>

        </div>

        <div className="space-y-6">
          {/*
            THE MONEY FIRST.

            Somebody is standing at the counter with cash in their hand. Taking
            it is the reason this page is open, and it was four cards down —
            under the timeline, under the tracking code, under the container —
            so a clerk scrolled past everything they did not need to reach the
            one thing they did. The journey is history; history can wait.
          */}
          {/* It is the only thing on this column that gets worse while nobody
              looks at it, so it is read before the payment form. */}
          {/* Whenever the cargo is on the Dar floor and billed — a paid bill still
              has a storage clock running until the cargo is collected. */}
          {billHere && storage.configured && dar && can(user.role, "finance.view") ? (
            <StorageCard
              invoiceId={billHere.id}
              currency={storage.currency}
              daysHeld={storage.daysHeld}
              freeDays={storage.freeDays}
              chargeableDays={storage.chargeableDays}
              calculated={formatMoney(storage.amount, storage.currency)}
              onTheBill={
                storageOnBill > 0
                  ? formatMoney(storageOnBill, billHere.currency)
                  : null
              }
              since={formatDate(dar.receivedAt)}
            />
          ) : null}

          {/* Paying for several at once is a different act with its own
              screen — every open bill of this customer, ticked and settled in
              one transfer — so this is a door to it, not a mode of the form. */}
          {otherUnpaid > 0 && can(user.role, "payment.submit") ? (
            <Link
              href={`/app/finance/payments/new/${cargo.receiverId}`}
              className="block rounded-xl border border-brand/40 bg-brand/5 p-4 text-sm transition-colors hover:bg-brand/10"
            >
              <span className="font-medium">
                {cargo.receiver.fullName} has {otherUnpaid} other unpaid consignment
                {otherUnpaid === 1 ? "" : "s"}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Paying for several at once? Take it as one payment.
              </span>
            </Link>
          ) : null}

          {can(user.role, "finance.view") ? (
            <CargoActions
              cargoId={cargo.id}
              cargoReference={cargo.reference}
              customerId={cargo.receiverId}
              customerName={cargo.receiver.fullName}
              notify={
                billHere && billHere.status !== "DRAFT" ? (
                  <WhatsAppButton
                    solid
                    cargoId={cargo.id}
                    invoiceId={billHere.id}
                    phone={whatsappNumber(cargo.receiver.phone)}
                    /* The same letter as every other Notify button: the
                       clearance one at the port, the come-and-collect one in
                       our warehouse, the bill's own before the ship is in. */
                    kind={notifyKind}
                    label="Notify on WhatsApp"
                    message={composeMessage(notifyKind, {
                      stage: messageContext.stage,
                      storageFrom: messageContext.storageFrom,
                      customerName: cargo.receiver.fullName,
                      reference: cargo.reference,
                      description: cargo.description,
                      packages: dar?.packagesCount ?? china?.packagesCount ?? null,
                      currency: billHere.currency,
                      amount: Number(outstandingOf(billHere)).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }),
                      amountTzs: balanceOf(billHere).outstandingTzs?.toNumber().toLocaleString("en-US") ?? null,
                      cbm: billHere.billableCbm ? Number(billHere.billableCbm).toFixed(3) : null,
                      ratePerCbm: billHere.appliedRate ? Number(billHere.appliedRate).toFixed(2) : null,
                      fxRate: billHere.fxRate ? Number(billHere.fxRate).toLocaleString("en-US") : null,
                      freeStorageDays: money?.freeStorageDays ?? null,
                      storagePerDay:
                        money && Number(money.storagePerDay) > 0 ? Number(money.storagePerDay).toString() : null,
                      storageCurrency: money?.storageCurrency ?? "USD",
                    })}
                  />
                ) : null
              }
              bill={
                billHere
                  ? {
                      id: billHere.id,
                      number: billHere.number,
                      status: billHere.status,
                      total: Number(billHere.total),
                      outstanding: Number(balanceOf(billHere).outstanding),
                      outstandingTzs: balanceOf(billHere).outstandingTzs?.toNumber() ?? null,
                      rate: balanceOf(billHere).rate?.toNumber() ?? null,
                      standardRate: billHere.standardRate ? Number(billHere.standardRate) : null,
                      appliedRate: billHere.appliedRate ? Number(billHere.appliedRate) : null,
                      cbm: billHere.billableCbm ? Number(billHere.billableCbm) : null,
                      category:
                        freightLines > 0
                          ? categoryOfCargo({ commodity: cargo.commodity, packages: cargo.packages })
                          : undefined,
                      pending: billHere.payments.some((p) => p.status === "PENDING"),
                      pendingPaymentId: billHere.payments.find((p) => p.status === "PENDING")?.id ?? null,
                      /* A write-off Support asked for rides on that payment. */
                      pendingClearing: (() => {
                        const asked = billHere.payments.find((p) => p.status === "PENDING")?.clearShortfallTzs;
                        return asked && asked.greaterThan(0) ? formatCurrency(asked, "TZS") : null;
                      })(),
                    }
                  : null
              }
              storageLine={
                !storage.configured || !dar
                  ? null
                  : storage.chargeableDays > 0
                    ? `Storage ${formatMoney(storage.amount, storage.currency)} so far${storageOnBill > 0 ? ` · ${formatMoney(storageOnBill, billHere?.currency ?? "USD")} on the bill` : " · not on the bill yet"}`
                    : `No storage fee · ${Math.max(0, storage.freeDays - storage.daysHeld + 1)} free day${storage.freeDays - storage.daysHeld + 1 === 1 ? "" : "s"} left`
              }
              accounts={accounts.map((a) => ({
                id: a.id,
                name: `${a.bankName} (${a.currency})`,
                currency: a.currency,
                kind: a.kind,
              }))}
              canPay={can(user.role, "payment.submit")}
              canDecide={can(user.role, "payment.verify")}
              canChangeBill={can(user.role, "invoice.discount")}
              canChangeRate={can(user.role, "invoice.edit")}
              categories={categories}
              canOpenBill={can(user.role, "finance.view")}
              atDar={Boolean(dar) && ["RECEIVED_DAR", "READY_FOR_RELEASE"].includes(cargo.status)}
              raiseBill={
                Boolean(dar) &&
                !billHere &&
                cargo.containerLines.length === 0 &&
                can(user.role, "invoice.create")
              }
              pickupNote={
                pickupNote
                  ? {
                      id: pickupNote.id,
                      number: pickupNote.noteNumber,
                      status: pickupNote.status,
                      onCredit: pickupNote.onCredit,
                    }
                  : null
              }
            />
          ) : null}

          {canNotify ? (
            <NotifyCustomer
              cargoId={cargo.id}
              phone={whatsappNumber(cargo.sender.phone)}
              customerName={cargo.sender.fullName}
              lastContact={
                lastContact
                  ? {
                      label:
                        CONTACT_KIND_LABELS[lastContact.kind as ContactKind] ??
                        lastContact.kind,
                      when: formatDate(lastContact.createdAt),
                      by: lastContact.sentBy?.name ?? "somebody",
                    }
                  : null
              }
              options={(
                [
                  "cargo.received_china",
                  "cargo.loaded",
                  "cargo.departed",
                  "cargo.arrived",
                  "cargo.received_dar",
                  "cargo.cleared_unpaid",
                  "cargo.ready",
                  "payment.reminder",
                  "storage.expired",
                  "general",
                ] as ContactKind[]
              ).map(
                (kind): MessageOption => ({
                  kind,
                  label: CONTACT_KIND_LABELS[kind],
                  suggested: kind === suggestedKind,
                  body: composeMessage(kind, {
                    ...messageContext,
                    amount: owing > 0 ? owing.toFixed(2) : null,
                    currency: cargo.invoices[0]?.currency ?? "USD",
                    amountTzs: owingTzs > 0 ? owingTzs.toLocaleString("en-US") : null,
                    fxRate: billRates.length === 1 ? Number(billRates[0]).toLocaleString("en-US") : null,
                    /* The rate beside the figure: half of the sum a customer
                       can check against what they agreed. */
                    ratePerCbm: cargo.invoices[0]?.appliedRate
                      ? Number(cargo.invoices[0].appliedRate).toFixed(2)
                      : null,
                  }),
                })
              )}
            />
          ) : null}

          {!cargo.operationalHold && can(user.role, "cargo.hold") ? (
            <HoldToggle cargoId={cargo.id} held={false} reason={null} />
          ) : null}

          {can(user.role, "cargo.delete") && amend ? (
            <DeleteCargoButton cargoId={cargo.id} />
          ) : null}

          {cargo.internalNotes && can(user.role, "cargo.viewInternal") ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{T("Internal notes")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{cargo.internalNotes}</p>
                <Badge tone="warn" className="mt-3">
                  {T("Never shown to the customer")}
                </Badge>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** What the Dar floor wrote on the receiving row, said in words. */
const CONDITION_LABEL: Record<string, string> = {
  MINOR_DAMAGE: "Minor damage",
  DAMAGED: "Damaged",
  WET: "Arrived wet",
  REPACKED: "Repacked",
};
