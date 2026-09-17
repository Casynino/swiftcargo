import "server-only";

import { Prisma } from "@prisma/client";

import { recordAudit, recordFieldChange } from "@/lib/audit";
import { formatCurrency, formatRate, roundMoney, usdToTzs } from "@/lib/currency";
import { nextInvoiceNumber } from "@/lib/ids";
import { paymentSnapshotNow } from "@/lib/invoice-accounts";
import { billingMeasurement, priceConsignment } from "@/lib/invoice-draft";
import { repriceDraftInvoices } from "@/lib/invoice-reprice";
import { notifyCustomer } from "@/lib/notify";
import { applyVat, companySettings, currentExchangeRate } from "@/lib/pricing";
import { prisma, type TxClient } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";

/**
 * FROM "DAR HAS COUNTED IT" TO "THE CUSTOMER HAS A BILL", IN ONE PRESS.
 *
 * The owner's flow, taken from the air side: the rate book prices every
 * consignment the moment Dar checks it in, as a DRAFT nobody has to raise; the
 * pricing list shows every one of those figures; whoever confirms reads down
 * it, corrects a type or a rate where something looks wrong, and presses one
 * button. Nobody opens a consignment to raise a bill and nobody opens a bill to
 * issue it.
 *
 * Every write here takes a client, so the whole of it can run inside the
 * caller's transaction — and a test can run it inside one that is rolled back.
 */

type Actor = SessionUser;

export type PriceOutcome =
  | { kind: "raised" | "repriced" | "unchanged"; invoiceId: string; number: string }
  | { kind: "blocked"; reference: string; reason: string }
  /* Something other than a draft is already billed: not this list's to touch. */
  | { kind: "billed"; reference: string }
  | { kind: "not-counted"; reference: string | null };

/**
 * A draft carrying a rate somebody agreed rather than the book's.
 *
 * The book's own drafts carry the same figure in both columns, or nothing in
 * either when the lines are at mixed rates. A rate typed on the price list or
 * on the bill moves only `appliedRate`, and that is what must survive being
 * confirmed — re-deriving it from the book would silently undo the one number
 * somebody decided.
 */
export function carriesAgreedRate(invoice: {
  appliedRate: Prisma.Decimal | null;
  standardRate: Prisma.Decimal | null;
}) {
  if (invoice.appliedRate === null) return false;
  return invoice.standardRate === null || !invoice.appliedRate.equals(invoice.standardRate);
}

/**
 * Raise this consignment's draft from the rate book, or bring an existing
 * draft back into line with it.
 *
 * Never touches a bill past DRAFT: a figure a customer has been given is
 * Finance's, through a discount or a re-price with a reason. Never raises one
 * for cargo Dar has not counted — sea freight is billed on what landed.
 *
 * A gap in the rate book is returned, not thrown. One consignment the book
 * cannot price must not stop the rest of a container being priced.
 */
export async function priceWaitingCargo(
  client: TxClient,
  actor: Actor,
  cargoId: string,
  options: { reason: string; keepAgreedRate: boolean }
): Promise<PriceOutcome> {
  const cargo = await client.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    include: {
      darReceiving: true,
      chinaReceiving: true,
      containerLines: { orderBy: { createdAt: "asc" } },
      invoices: { where: { status: { not: "CANCELLED" } } },
    },
  });
  if (!cargo || !cargo.darReceiving) {
    return { kind: "not-counted", reference: cargo?.reference ?? null };
  }
  if (cargo.invoices.some((i) => i.status !== "DRAFT")) {
    return { kind: "billed", reference: cargo.reference };
  }

  const drafts = cargo.invoices;
  if (drafts.length > 0) {
    const first = drafts[0];
    if (options.keepAgreedRate && drafts.some(carriesAgreedRate)) {
      return { kind: "unchanged", invoiceId: first.id, number: first.number };
    }
    const result = await repriceDraftInvoices(
      client,
      actor,
      cargo.id,
      options.reason
    );
    if (result.blocked) {
      return { kind: "blocked", reference: cargo.reference, reason: result.blocked };
    }
    return {
      kind: result.repriced.length > 0 ? "repriced" : "unchanged",
      invoiceId: first.id,
      number: first.number,
    };
  }

  const priced = await priceConsignment(
    {
      id: cargo.id,
      description: cargo.description,
      commodity: cargo.commodity,
      service: cargo.service,
      receiverId: cargo.receiverId,
      ...billingMeasurement(cargo),
    },
    client
  );
  if (priced.blockedReason) {
    return { kind: "blocked", reference: cargo.reference, reason: priced.blockedReason };
  }

  const [settings, fx] = await Promise.all([
    companySettings(client),
    currentExchangeRate(client),
  ]);
  const vatPercent = new Prisma.Decimal(settings?.vatPercent ?? 0);
  const { vatAmount, total } = applyVat(priced.amount, vatPercent);
  const line = cargo.containerLines.at(-1) ?? null;

  const invoice = await client.invoice.create({
    data: {
      /* From the Counter, inside this transaction: a draft that rolls back
         rolls its number back with it. */
      number: await nextInvoiceNumber(client),
      customerId: cargo.receiverId,
      cargoId: cargo.id,
      containerCargoId: line?.id ?? null,
      status: "DRAFT",
      billableCbm: priced.billableCbm,
      billableKg: priced.billableKg,
      standardRate: priced.standardRate,
      appliedRate: priced.appliedRate,
      rateBasis: priced.basis,
      discount: priced.discount,
      subtotal: priced.amount,
      vatPercent,
      vatAmount,
      total,
      currency: priced.currency,
      exchangeRateId: fx?.id ?? null,
      fxRate: fx?.rate ?? null,
      totalTzs: fx ? usdToTzs(total, fx.rate) : null,
      issuedById: actor.id,
      items: { create: priced.items },
    },
  });

  await recordAudit(
    {
      actor,
      action: "invoice.create",
      entity: "Invoice",
      entityId: invoice.id,
      summary: `Priced ${cargo.reference} from the rate book as draft ${invoice.number} — ${priced.explanation}, total ${priced.currency} ${total}`,
      metadata: {
        reason: options.reason,
        explanation: priced.explanation,
        standardRate: priced.standardRate?.toString() ?? null,
        appliedRate: priced.appliedRate?.toString() ?? null,
        vatPercent: vatPercent.toString(),
      },
    },
    client
  );

  return { kind: "raised", invoiceId: invoice.id, number: invoice.number };
}

/**
 * Price cargo the moment Dar checks it in.
 *
 * Outside the check-in's own transaction and never able to fail it: the boxes
 * are on the Dar floor whether or not the rate book can price them, and a clerk
 * cannot fix a rate book. A consignment that cannot be priced simply has no
 * draft yet, and the price list names it.
 */
export async function priceOnCheckIn(
  actor: Actor,
  cargoIds: string[],
  recount?: { reason: string }
) {
  for (const cargoId of cargoIds) {
    try {
      await prisma.$transaction(
        (tx) =>
          priceWaitingCargo(tx, actor, cargoId, recount
            ? /* Figures moved: the draft follows them, as any correction does. */
              { reason: recount.reason, keepAgreedRate: false }
            : /* Nothing moved: a rate somebody agreed is left standing. */
              {
                reason: "Priced from the rate book when Dar checked it in",
                keepAgreedRate: true,
              }),
        { timeout: 20_000 }
      );
    } catch {
      /* The draft is raised again the next time anything re-prices it, and
         confirming raises whatever is still missing. */
    }
  }
}

export type ConfirmContext = {
  fx: { id: string; rate: Prisma.Decimal };
  accounts: Prisma.InputJsonValue;
  dueAt: Date;
};

/** What confirming needs once for a whole list, so every bill agrees. */
export async function confirmContext(
  dueDays = 7,
  client: TxClient | typeof prisma = prisma
): Promise<ConfirmContext | null> {
  const fx = await currentExchangeRate(client);
  if (!fx) return null;
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + dueDays);
  return { fx, accounts: await paymentSnapshotNow(client), dueAt };
}

export type ConfirmOutcome =
  | { kind: "issued"; numbers: string[] }
  | { kind: "blocked"; reference: string; reason: string }
  | { kind: "skipped"; reference: string | null };

/**
 * Confirm one consignment's price: bring its draft up to date, then issue it.
 *
 * Issuing pins the exchange-rate ROW and its figure, writes the collection
 * accounts onto the bill, names the person who confirmed it and tells the
 * customer — the same things issuing a single bill does. The claim is
 * conditional on the bill still being a draft, so two people confirming the
 * same list in the same second issue it once.
 */
export async function confirmCargoPrice(
  client: TxClient,
  actor: Actor,
  cargoId: string,
  ctx: ConfirmContext
): Promise<ConfirmOutcome> {
  const priced = await priceWaitingCargo(client, actor, cargoId, {
    reason: "Re-priced from the rate book on confirmation",
    keepAgreedRate: true,
  });
  if (priced.kind === "blocked") return priced;
  if (priced.kind === "billed" || priced.kind === "not-counted") {
    return { kind: "skipped", reference: priced.reference };
  }

  const drafts = await client.invoice.findMany({
    where: { cargoId, status: "DRAFT" },
    include: { cargo: { select: { reference: true } } },
    orderBy: { createdAt: "asc" },
  });

  const numbers: string[] = [];
  for (const invoice of drafts) {
    const totalTzs =
      invoice.currency === "TZS"
        ? roundMoney(invoice.total, "TZS")
        : usdToTzs(invoice.total, ctx.fx.rate);
    const claim = await client.invoice.updateMany({
      where: { id: invoice.id, status: "DRAFT" },
      data: {
        status: "ISSUED",
        issuedAt: new Date(),
        dueAt: ctx.dueAt,
        exchangeRateId: ctx.fx.id,
        fxRate: ctx.fx.rate,
        totalTzs,
        paymentSnapshot: ctx.accounts,
        /* The draft was raised by whoever checked the cargo in. The bill is
           the confirmer's, and "Issued by" is printed on it. */
        issuedById: actor.id,
      },
    });
    if (claim.count === 0) continue;

    const due = `${formatCurrency(totalTzs, "TZS")} (${formatCurrency(invoice.total, "USD")} at ${formatRate(ctx.fx.rate)})`;
    await notifyCustomer(
      [invoice.customerId],
      {
        kind: "invoice.issued",
        title: `Invoice ${invoice.number}`,
        body: `${due} is due for ${invoice.cargo.reference}.`,
        href: "/portal/invoices",
      },
      client
    );
    await recordAudit(
      {
        actor,
        action: "invoice.issue",
        entity: "Invoice",
        entityId: invoice.id,
        summary: `Confirmed the price and issued ${invoice.number} — ${due}`,
        metadata: {
          exchangeRateId: ctx.fx.id,
          fxRate: ctx.fx.rate.toString(),
          totalTzs: totalTzs.toString(),
          confirmedFrom: "price list",
        },
      },
      client
    );
    numbers.push(invoice.number);
  }

  return numbers.length > 0
    ? { kind: "issued", numbers }
    : { kind: "skipped", reference: drafts[0]?.cargo.reference ?? null };
}

export type ConfirmSummary = {
  issued: number;
  numbers: string[];
  blocked: { reference: string; reason: string }[];
  skipped: number;
};

/**
 * Confirm a list, one consignment per transaction.
 *
 * Per consignment, as the air side does it, so a line that cannot be priced —
 * or a database hiccup on line forty — cannot roll back the thirty-nine bills
 * before it. A blocked line blocks only itself and is named in the answer.
 */
export async function confirmPriceList(
  actor: Actor,
  cargoIds: string[],
  ctx: ConfirmContext
): Promise<ConfirmSummary> {
  const summary: ConfirmSummary = { issued: 0, numbers: [], blocked: [], skipped: 0 };
  for (const cargoId of cargoIds) {
    try {
      const outcome = await prisma.$transaction(
        (tx) => confirmCargoPrice(tx, actor, cargoId, ctx),
        { timeout: 20_000 }
      );
      if (outcome.kind === "issued") {
        summary.issued += outcome.numbers.length;
        summary.numbers.push(...outcome.numbers);
      } else if (outcome.kind === "blocked") {
        summary.blocked.push({ reference: outcome.reference, reason: outcome.reason });
      } else {
        summary.skipped++;
      }
    } catch (error) {
      const cargo = await prisma.cargo.findUnique({
        where: { id: cargoId },
        select: { reference: true },
      });
      summary.blocked.push({
        reference: cargo?.reference ?? cargoId,
        reason: error instanceof Error ? error.message : "Could not be confirmed.",
      });
    }
  }
  return summary;
}

export class PriceListRefused extends Error {}

/**
 * The cargo type of a consignment still waiting for its price, chosen on the
 * price list.
 *
 * Cargo that reached Dar untyped — entered before types existed, or imported —
 * would otherwise need somebody to open it, edit its details and come back.
 * Every line is set to the type chosen, each change written to FieldChange with
 * the old value first, and the draft is then raised or re-priced at that type's
 * rate. Refused once a bill has gone out or the boxes have been collected: a
 * type on a bill a customer holds is changed on the bill, with a reason.
 */
export async function setWaitingCargoType(
  client: TxClient,
  actor: Actor,
  input: { cargoId: string; cargoType: string; allowedTypes: string[]; reason?: string | null }
): Promise<{ changed: number; outcome: PriceOutcome }> {
  const cargoType = input.cargoType.trim();
  if (!cargoType || !input.allowedTypes.includes(cargoType)) {
    throw new PriceListRefused("Choose a cargo type from the rate book.");
  }
  const reason = input.reason?.trim() || "Cargo type chosen on the price list";

  const cargo = await client.cargo.findFirst({
    where: { id: input.cargoId, deletedAt: null },
    include: {
      packages: { where: { deletedAt: null }, orderBy: { reference: "asc" } },
      release: { select: { id: true } },
      invoices: { where: { status: { notIn: ["DRAFT", "CANCELLED"] } }, select: { number: true } },
    },
  });
  if (!cargo) throw new PriceListRefused("That cargo no longer exists.");
  if (cargo.release) {
    throw new PriceListRefused(`${cargo.reference} has already been collected.`);
  }
  if (cargo.invoices.length > 0) {
    throw new PriceListRefused(
      `${cargo.reference} is already billed on ${cargo.invoices[0].number}. Change the price on the bill.`
    );
  }

  let changed = 0;
  if (cargo.packages.length === 0) {
    if (cargo.commodity !== cargoType) {
      await recordFieldChange(
        {
          actor,
          entity: "Cargo",
          entityId: cargo.id,
          field: "commodity",
          oldValue: cargo.commodity,
          newValue: cargoType,
          reason,
        },
        client
      );
      await client.cargo.update({ where: { id: cargo.id }, data: { commodity: cargoType } });
      changed++;
    }
  } else {
    for (const line of cargo.packages) {
      if (line.cargoType === cargoType) continue;
      await recordFieldChange(
        {
          actor,
          entity: "CargoPackage",
          entityId: line.id,
          field: "cargoType",
          oldValue: line.cargoType,
          newValue: cargoType,
          reason,
        },
        client
      );
      await client.cargoPackage.update({ where: { id: line.id }, data: { cargoType } });
      changed++;
    }
  }

  if (changed > 0) {
    await recordAudit(
      {
        actor,
        action: "cargo.type.priceList",
        entity: "Cargo",
        entityId: cargo.id,
        summary: `${cargo.reference}: cargo type set to ${cargoType} on the price list — ${reason}`,
        metadata: { cargoType, lines: changed, reason },
      },
      client
    );
  }

  const outcome = await priceWaitingCargo(client, actor, cargo.id, {
    reason,
    keepAgreedRate: false,
  });
  return { changed, outcome };
}

/**
 * A rate per cubic metre agreed for one waiting consignment.
 *
 * Raises the draft first when there is none yet, then re-multiplies every
 * per-CBM line at the new rate. The book's rate stays on the bill as the
 * standard, so the gap reads as what it is. Old rate and old total go to
 * FieldChange before the figures move.
 */
export async function setWaitingRate(
  client: TxClient,
  actor: Actor,
  input: { cargoId: string; rate: Prisma.Decimal; reason?: string | null }
): Promise<{ invoiceNumber: string; total: Prisma.Decimal }> {
  const reason = input.reason?.trim() || "Rate agreed on the price list";
  if (input.rate.lessThanOrEqualTo(0)) throw new PriceListRefused("Give a rate.");

  const release = await client.release.findFirst({
    where: { cargoId: input.cargoId },
    select: { id: true },
  });
  if (release) throw new PriceListRefused("This cargo has already been collected.");

  const priced = await priceWaitingCargo(client, actor, input.cargoId, {
    reason,
    keepAgreedRate: true,
  });
  if (priced.kind === "blocked") {
    throw new PriceListRefused(`${priced.reference}: ${priced.reason}`);
  }
  if (priced.kind === "billed") {
    throw new PriceListRefused(`${priced.reference} is already billed. Change the price on the bill.`);
  }
  if (priced.kind === "not-counted") {
    throw new PriceListRefused("Dar has not counted this cargo yet.");
  }

  const invoice = await client.invoice.findUnique({
    where: { id: priced.invoiceId },
    include: { items: true },
  });
  if (!invoice || invoice.status !== "DRAFT") {
    throw new PriceListRefused("That bill has already been issued.");
  }
  const cbmLines = invoice.items.filter((i) => i.unit === "CBM");
  if (cbmLines.length === 0) {
    throw new PriceListRefused("Nothing on this bill is priced per cubic metre.");
  }

  let subtotal = new Prisma.Decimal(0);
  for (const item of invoice.items) {
    subtotal = subtotal.add(
      item.unit === "CBM" ? item.quantity.mul(input.rate).toDecimalPlaces(2) : item.amount
    );
  }
  const { vatAmount, total } = applyVat(subtotal, invoice.vatPercent);

  await recordFieldChange(
    {
      actor,
      entity: "Invoice",
      entityId: invoice.id,
      field: "appliedRate",
      oldValue: invoice.appliedRate?.toString() ?? "mixed",
      newValue: input.rate.toString(),
      reason,
    },
    client
  );
  await recordFieldChange(
    {
      actor,
      entity: "Invoice",
      entityId: invoice.id,
      field: "total",
      oldValue: invoice.total.toString(),
      newValue: total.toString(),
      reason,
    },
    client
  );

  for (const item of cbmLines) {
    await client.invoiceItem.update({
      where: { id: item.id },
      data: { unitPrice: input.rate, amount: item.quantity.mul(input.rate).toDecimalPlaces(2) },
    });
  }
  /* Conditional on still being a draft: confirming in the same second must
     leave the issued bill exactly as the customer was told it. */
  const claim = await client.invoice.updateMany({
    where: { id: invoice.id, status: "DRAFT" },
    data: {
      appliedRate: input.rate,
      /* A book draft at mixed rates has no standard to measure against; the
         old figure becomes it, so the agreement is still visible as one. */
      standardRate: invoice.standardRate ?? invoice.appliedRate ?? undefined,
      subtotal,
      vatAmount,
      total,
      totalTzs: invoice.fxRate ? usdToTzs(total, invoice.fxRate) : null,
    },
  });
  if (claim.count === 0) throw new PriceListRefused(`${invoice.number} was issued a moment ago.`);

  await recordAudit(
    {
      actor,
      action: "invoice.reprice",
      entity: "Invoice",
      entityId: invoice.id,
      summary: `Re-priced draft ${invoice.number} at ${invoice.currency} ${input.rate}/CBM on the price list: ${reason}`,
      metadata: {
        from: invoice.total.toString(),
        to: total.toString(),
        oldRate: invoice.appliedRate?.toString() ?? null,
        rate: input.rate.toString(),
        reason,
      },
    },
    client
  );

  return { invoiceNumber: invoice.number, total };
}
