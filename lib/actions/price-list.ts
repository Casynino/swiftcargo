"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type RateBasis } from "@prisma/client";

import { recordAudit, recordFieldChange } from "@/lib/audit";
import { nextExceptionReference } from "@/lib/ids";
import { notifyStaff, staffInDepartment } from "@/lib/notify";
import {
  confirmContext,
  confirmPriceList,
  PriceListRefused,
  setWaitingCargoType,
  setWaitingPrice,
  setWaitingRate,
} from "@/lib/price-confirmation";
import { WAITING_ON_CONTAINER } from "@/lib/price-list";
import { refreshInvoiceStatus } from "@/lib/invoice-status";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";
import { UNSAILED_TO_PRICE } from "@/lib/unsailed-pricing";
import { cargoTypeOptions } from "@/lib/valuation";

export type PriceListState = { error?: string; ok?: string };

function refreshPriceViews(containerId?: string | null, cargoId?: string | null) {
  revalidatePath("/app/containers/arrived");
  revalidatePath("/app/finance/invoices");
  revalidatePath("/app/finance/collections");
  if (containerId) revalidatePath(`/app/containers/${containerId}`);
  if (cargoId) revalidatePath(`/app/cargo/${cargoId}`);
}

/**
 * CONFIRM ALL THE PRICES ON ONE LIST.
 *
 * A container's waiting consignments, or the group that reached Dar with no
 * container on record. Whatever has no draft yet is priced first, every draft
 * is brought up to the book (a rate somebody agreed is kept), and each is
 * issued at today's exchange rate with the collection accounts written onto it.
 * A consignment the book cannot price is left waiting and named; the rest go.
 */
export async function confirmPrices(
  _prev: PriceListState,
  formData: FormData
): Promise<PriceListState> {
  const actor = await authorize("invoice.priceConfirm");

  const containerId = String(formData.get("containerId") ?? "").trim() || null;
  const where: Prisma.CargoWhereInput = containerId
    ? WAITING_ON_CONTAINER(containerId)
    : UNSAILED_TO_PRICE;

  let reference = "cargo in Dar with no container";
  if (containerId) {
    const container = await prisma.container.findFirst({
      where: { id: containerId, deletedAt: null },
      select: { reference: true },
    });
    if (!container) return { error: "That container no longer exists." };
    reference = container.reference;
  }

  /* An explicit selection narrows the list; it can never widen it past what is
     actually waiting on this container. */
  const picked = formData.getAll("cargoIds").map(String).filter(Boolean);
  const waiting = await prisma.cargo.findMany({
    where: picked.length ? { AND: [where, { id: { in: picked } }] } : where,
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (waiting.length === 0) {
    return { ok: "Every price on this list has already been confirmed." };
  }

  const ctx = await confirmContext();
  if (!ctx) {
    return { error: "There is no exchange rate published. Set one in the Rate book first." };
  }

  const summary = await confirmPriceList(
    actor,
    waiting.map((c) => c.id),
    ctx
  );

  await recordAudit({
    actor,
    action: "invoice.confirmPrices",
    entity: containerId ? "Container" : "Cargo",
    entityId: containerId ?? undefined,
    summary: `Confirmed ${summary.issued} price(s) on ${reference}${
      summary.blocked.length ? `, ${summary.blocked.length} could not be priced` : ""
    }`,
    metadata: {
      issued: summary.numbers,
      blocked: summary.blocked,
      skipped: summary.skipped,
      fxRate: ctx.fx.rate.toString(),
    },
  });

  refreshPriceViews(containerId);

  const left = summary.blocked.length
    ? ` ${summary.blocked.length} could not be priced: ${summary.blocked
        .slice(0, 3)
        .map((b) => `${b.reference} (${b.reason})`)
        .join("; ")}${summary.blocked.length > 3 ? " and others" : ""}.`
    : "";
  if (summary.issued === 0) {
    return summary.blocked.length
      ? { error: `Nothing was confirmed.${left}` }
      : { ok: "Every price on this list has already been confirmed." };
  }
  return {
    ok: `${summary.issued} invoice(s) confirmed and sent to the customers.${left}`,
  };
}

/*
  WHAT A DESK QUERYING A MEASUREMENT IS ACTUALLY QUERYING.

  The case is named for the figure, because that is what the floor has to go
  and look at. A case called "wrong" sends somebody to the shelf with nothing
  to check.
*/
const QUERY_KINDS = {
  CBM_DIFFERENCE: "the volume",
  WEIGHT_DIFFERENCE: "the weight",
  PACKAGE_MISMATCH: "the package count",
  OTHER: "the measurement",
} as const;
type QueryKind = keyof typeof QUERY_KINDS;

/**
 * THE FIGURE IS WRONG, AND IT IS NOT FINANCE'S FIGURE TO CHANGE.
 *
 * A price list is read against boxes standing in a warehouse, and sometimes the
 * two disagree: a volume that cannot be right for four cartons, a customer on
 * the phone saying they shipped half of that. The tempting fix is to let
 * whoever is looking at the money type a better number — which is the one thing
 * that must not happen, because then the bill and the warehouse record disagree
 * and only one of them was ever anywhere near the cargo.
 *
 * So this sends it back instead. It takes Dar's signature off the count and
 * opens a case addressed to the Dar floor naming the consignment and the
 * figure. The consignment leaves the press at once, because an unsigned count
 * is what the price list waits for; Dar re-measures, confirms again, and it
 * comes back at the figure the floor now stands behind.
 *
 * It does NOT set the warehouse difference flag. That flag is the floor's own
 * statement about what came off a container and it clears itself when a case
 * closes; borrowing it for a question from the office would let a clerk answer
 * Finance's query by resolving somebody else's case.
 *
 * It refuses once a bill has gone out. A figure the customer is holding is
 * moved by Finance, with a reason, on the bill.
 */
export async function queryCountWithDar(
  _prev: PriceListState,
  formData: FormData
): Promise<PriceListState> {
  const actor = await authorize("invoice.priceConfirm");

  const cargoId = String(formData.get("cargoId") ?? "");
  const raw = String(formData.get("kind") ?? "OTHER");
  const kind: QueryKind = raw in QUERY_KINDS ? (raw as QueryKind) : "OTHER";
  const reason = String(formData.get("reason") ?? "").trim() || "No reason given";

  const cargo = await prisma.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    select: {
      id: true,
      reference: true,
      senderId: true,
      darReceiving: { select: { id: true, verified: true, discrepancy: true } },
      release: { select: { id: true } },
      containerLines: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { containerId: true },
      },
      invoices: {
        where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
        select: { number: true },
      },
    },
  });
  if (!cargo) return { error: "That cargo no longer exists." };
  if (!cargo.darReceiving) {
    return { error: `${cargo.reference} has not been counted in Dar yet.` };
  }
  if (cargo.release) {
    return { error: `${cargo.reference} has already been collected.` };
  }
  if (cargo.invoices.length > 0) {
    return {
      error: `${cargo.reference} is already billed on ${cargo.invoices[0].number}. Correct the bill instead — the customer is holding that figure.`,
    };
  }

  const containerId = cargo.containerLines[0]?.containerId ?? null;
  const figure = QUERY_KINDS[kind];
  const title = `${cargo.reference}: ${figure} is queried`;

  const opened = await prisma.$transaction(async (tx) => {
    /* The signature comes off before anything else: from this moment the
       consignment is out of the price list's press and back on Dar's floor. */
    if (cargo.darReceiving!.verified) {
      await recordFieldChange(
        {
          actor,
          entity: "DarReceiving",
          entityId: cargo.darReceiving!.id,
          field: "verified",
          oldValue: "true",
          newValue: "false",
          reason,
        },
        tx
      );
    }
    await tx.darReceiving.update({
      where: { id: cargo.darReceiving!.id },
      data: { verified: false, verifiedAt: null },
    });

    const reference = await nextExceptionReference(tx);
    const item = await tx.exceptionCase.create({
      data: {
        reference,
        type: kind,
        priority: "NORMAL",
        department: "DAR_WAREHOUSE",
        cargoId: cargo.id,
        customerId: cargo.senderId,
        containerId,
        title,
        description: `${actor.name} queried ${figure} recorded for ${cargo.reference} before it was priced: ${reason}`,
        raisedById: actor.id,
      },
    });
    await tx.exceptionEvent.create({
      data: { caseId: item.id, to: "OPEN", note: reason, actorId: actor.id },
    });

    await notifyStaff(
      [
        ...(await staffInDepartment("DAR_WAREHOUSE", tx)),
        ...(await staffInDepartment("MANAGEMENT", tx)),
      ],
      {
        kind: "exception.raised",
        title: `${reference}: ${title}`,
        body: reason.slice(0, 160),
        href: `/app/exceptions/${item.id}`,
      },
      tx
    );

    return item;
  });

  await recordAudit({
    actor,
    action: "cargo.queryCount",
    entity: "Cargo",
    entityId: cargo.id,
    summary: `Sent ${cargo.reference} back to Dar over ${figure} — case ${opened.reference}: ${reason}`,
    metadata: { caseId: opened.id, kind, reason },
  });

  refreshPriceViews(containerId, cargo.id);
  revalidatePath("/app/exceptions");
  revalidatePath("/app/receive/dar");
  return {
    ok: `${cargo.reference} is back with Dar. Case ${opened.reference} opened on ${figure}.`,
  };
}

/** The cargo type of one waiting consignment, chosen on the price list. */
export async function setPriceListCargoType(
  _prev: PriceListState,
  formData: FormData
): Promise<PriceListState> {
  const actor = await authorize("invoice.priceConfirm");

  const cargoId = String(formData.get("cargoId") ?? "");
  const cargoType = String(formData.get("cargoType") ?? "");
  const reason = String(formData.get("reason") ?? "");

  try {
    const allowedTypes = await cargoTypeOptions();
    const result = await prisma.$transaction(
      (tx) => setWaitingCargoType(tx, actor, { cargoId, cargoType, allowedTypes, reason }),
      { timeout: 20_000 }
    );
    const line = await prisma.containerCargo.findFirst({
      where: { cargoId },
      orderBy: { createdAt: "desc" },
      select: { containerId: true },
    });
    refreshPriceViews(line?.containerId, cargoId);
    if (result.outcome.kind === "blocked") {
      return { error: `Type saved, but it cannot be priced: ${result.outcome.reason}` };
    }
    return { ok: result.changed ? `Now ${cargoType}.` : `Already ${cargoType}.` };
  } catch (error) {
    if (error instanceof PriceListRefused) return { error: error.message };
    throw error;
  }
}

/** A rate per CBM agreed for one waiting consignment. */
export async function setPriceListRate(
  _prev: PriceListState,
  formData: FormData
): Promise<PriceListState> {
  const actor = await authorize("invoice.priceConfirm");

  const cargoId = String(formData.get("cargoId") ?? "");
  const raw = String(formData.get("rate") ?? "").replace(/,/g, "").trim();
  const reason = String(formData.get("reason") ?? "");
  if (!/^\d+(\.\d{1,4})?$/.test(raw) || Number(raw) <= 0) {
    return { error: "Enter the rate per CBM, e.g. 380." };
  }

  try {
    const result = await prisma.$transaction(
      (tx) =>
        setWaitingRate(tx, actor, {
          cargoId,
          rate: new Prisma.Decimal(raw),
          reason,
        }),
      { timeout: 20_000 }
    );
    const line = await prisma.containerCargo.findFirst({
      where: { cargoId },
      orderBy: { createdAt: "desc" },
      select: { containerId: true },
    });
    refreshPriceViews(line?.containerId, cargoId);
    return { ok: `${result.invoiceNumber} now USD ${result.total.toFixed(2)}.` };
  } catch (error) {
    if (error instanceof PriceListRefused) return { error: error.message };
    throw error;
  }
}

/** An empty box is not zero: it is "leave this to the rate book". */
function money(formData: FormData, key: string): Prisma.Decimal | null {
  const raw = String(formData.get(key) ?? "").replace(/,/g, "").trim();
  if (raw === "") return null;
  if (!/^\d+(\.\d{1,4})?$/.test(raw)) {
    throw new PriceListRefused(`${raw} is not a figure. Type it like 380 or 380.50.`);
  }
  return new Prisma.Decimal(raw);
}

/**
 * THE WHOLE PRICE OF ONE ROW, FROM THE DIALOG THAT OPENS ON IT.
 *
 * The rate, the unit it is charged in, a freight total typed instead, an extra
 * and a discount — the four figures the air side's per-cargo dialog asks for,
 * saved together so the desk reads one total before pressing once. Anything
 * left empty is left alone; a rate and a freight both empty put the row back on
 * the rate book.
 */
export async function savePriceListPrice(
  _prev: PriceListState,
  formData: FormData
): Promise<PriceListState> {
  const actor = await authorize("invoice.priceConfirm");

  const cargoId = String(formData.get("cargoId") ?? "");
  /*
    A BILL THE CUSTOMER IS HOLDING IS A SECOND AUTHORITY.

    Confirming a price turns the rate book's figure into a demand for money.
    Changing one afterwards is a different act — it is moving a figure somebody
    has already been given — and it is Finance's, held as `invoice.discount`.
    Asked here rather than inside the transaction so the refusal is the plain
    one the permission system writes.
  */
  const billed = await prisma.invoice.findFirst({
    where: { cargoId, status: { notIn: ["DRAFT", "CANCELLED"] } },
    select: { id: true },
  });
  if (billed) await authorize("invoice.discount");

  const basisRaw = String(formData.get("basis") ?? "PER_CBM");
  const basis: RateBasis = basisRaw === "PER_KG" ? "PER_KG" : "PER_CBM";
  const reason = String(formData.get("reason") ?? "");

  try {
    const input = {
      cargoId,
      basis,
      rate: money(formData, "rate"),
      freight: money(formData, "freight"),
      extra: money(formData, "extra"),
      discount: money(formData, "discount"),
      reason,
    };
    const result = await prisma.$transaction(
      (tx) => setWaitingPrice(tx, actor, input),
      { timeout: 20_000 }
    );
    /* A bill a discount has settled is not left reading ISSUED. */
    if (result.issued) await refreshInvoiceStatus(billed!.id);
    const line = await prisma.containerCargo.findFirst({
      where: { cargoId },
      orderBy: { createdAt: "desc" },
      select: { containerId: true },
    });
    refreshPriceViews(line?.containerId, cargoId);
    return { ok: `${result.invoiceNumber} now USD ${result.total.toFixed(2)}.` };
  } catch (error) {
    if (error instanceof PriceListRefused) return { error: error.message };
    throw error;
  }
}
