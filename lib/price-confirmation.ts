import "server-only";

import { Prisma, type RateBasis } from "@prisma/client";

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
 * ONE CONSIGNMENT IS PRICED BY ONE TRANSACTION AT A TIME.
 *
 * Everything below reads "has this cargo got a bill yet?" and then writes one.
 * Two presses of Confirm landing in the same second both read "none" and both
 * write, and the customer is handed two bills for one lot of boxes. A
 * consignment on a sailing is caught by the unique constraint on its container
 * line; one that reached Dar with no container has no line and no constraint,
 * so nothing was stopping it.
 *
 * The lock is held to the end of the CALLER'S transaction and released when it
 * commits or rolls back — never a session lock, which a pooled connection
 * would hand to the next request still held.
 */
async function lockCargoForPricing(client: TxClient, cargoId: string) {
  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${cargoId}, 0))`;
}

/**
 * DAR SIGNS THE COUNT OFF BEFORE ANYBODY IS ASKED FOR MONEY.
 *
 * Receiving and verifying are two acts on the Dar floor: boxes come off a
 * container in a rush and are checked properly afterwards. A receiving row
 * means the counting has started, not that it is finished, and a bill issued
 * against a figure the floor is still correcting is a bill that has to be
 * withdrawn.
 *
 * So the same signature the release engine waits for is the one Finance waits
 * for — with one deliberate exception. A count Dar has FLAGGED is the floor
 * having finished and said what it found: eight cartons where the manifest
 * promised ten, a bale that came off soaked. That figure stands, the shortage
 * or the damage is a case of its own, and the customer is still billed for what
 * landed — the price list carries the tag so nobody quotes a clean bill for it.
 * What stops a bill is a count nobody has been back to: the boxes came off in a
 * rush, the proper check has not happened, and the figure is still moving.
 */
export function darConfirmationGap(cargo: {
  darReceiving: { verified: boolean; discrepancy: boolean } | null;
}): string | null {
  if (!cargo.darReceiving) return "Dar has not counted this cargo yet.";
  if (cargo.darReceiving.verified) return null;
  if (cargo.darReceiving.discrepancy) return null;
  return "Dar has not confirmed the count yet.";
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
  await lockCargoForPricing(client, cargoId);

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
  /* The floor's signature, read before anything is priced. Blocking here rather
     than filtering the list earlier is deliberate: the row stays on Finance's
     screen with its figure on it, named as waiting on Dar, instead of vanishing
     and leaving nobody able to say why the container will not confirm. */
  const counted = await client.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    select: {
      reference: true,
      darReceiving: { select: { verified: true, discrepancy: true } },
    },
  });
  if (!counted) return { kind: "skipped", reference: null };
  const gap = darConfirmationGap(counted);
  if (gap) {
    /* Nothing counted at all is not Finance's problem to be told about twice —
       the list never offered it. An unconfirmed count is, and is named. */
    return counted.darReceiving
      ? { kind: "blocked", reference: counted.reference, reason: gap }
      : { kind: "skipped", reference: counted.reference };
  }

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

export type WaitingPriceInput = {
  cargoId: string;
  /** The unit the rate is quoted in. The rate book's own basis, or the other one. */
  basis: RateBasis;
  /** The rate agreed. Null with a null freight means "price it from the book". */
  rate: Prisma.Decimal | null;
  /** A freight total typed straight in, when nobody derived it from a rate. */
  freight: Prisma.Decimal | null;
  /** Handling, repacking, a delivery — one line, replaced each time. */
  extra: Prisma.Decimal | null;
  /** Money off, as one line. Zero or null takes an earlier one back off. */
  discount: Prisma.Decimal | null;
  reason?: string | null;
};

const FREIGHT_UNIT: Record<RateBasis, string> = {
  PER_CBM: "CBM",
  PER_KG: "kg",
  FLAT: "consignment",
};

/**
 * THE WHOLE PRICE OF ONE WAITING CONSIGNMENT, SET IN ONE PRESS.
 *
 * What the air side's per-cargo dialog does, in cubic metres. Four figures come
 * in — the rate, a freight total somebody typed instead, an extra charge and a
 * discount — and any of them may be absent. Absent is not zero: an empty rate
 * and an empty freight together mean "price this from the rate book again",
 * which is the only way back from an agreement somebody regrets.
 *
 * A TYPED RATE BEATS A TYPED TOTAL, because it is the number that was actually
 * agreed on the phone: the customer was told $380 a cubic metre, and the total
 * is what falls out of that. A total typed on its own is kept as a total and
 * clears the rate — a figure nobody derived from a rate must not claim to have
 * been.
 *
 * The book's rate stays on the bill beside the agreed one, so the gap reads as
 * what it is. Old rate and old total go to FieldChange before anything moves,
 * and every write is conditional on the bill still being a draft: an issued
 * bill is Finance's, by discount or re-price with a reason, never this.
 */
export async function setWaitingPrice(
  client: TxClient,
  actor: Actor,
  input: WaitingPriceInput
): Promise<{ invoiceNumber: string; total: Prisma.Decimal; issued: boolean }> {
  /* What the desk actually typed, kept apart from the default: a draft may be
     re-priced without a sentence, a bill the customer is holding may not. */
  const given = input.reason?.trim() ?? "";
  const reason = given || "Price agreed on the price list";

  const release = await client.release.findFirst({
    where: { cargoId: input.cargoId },
    select: { id: true },
  });
  if (release) throw new PriceListRefused("This cargo has already been collected.");

  if (input.rate !== null && input.rate.lessThanOrEqualTo(0)) {
    throw new PriceListRefused("A rate has to be above zero.");
  }
  if (input.freight !== null && input.freight.lessThan(0)) {
    throw new PriceListRefused("A freight total cannot be below zero.");
  }

  /*
    A BILL THAT HAS GONE OUT IS STILL FINANCE'S TO CORRECT.

    The rule is that an issued figure does not move by itself — no measurement,
    no re-count and no rate-book change reaches it. What does reach it is a
    person, with a reason, and that is this door: the same dialog on the same
    row, because making somebody find the bill on another screen to change a
    figure they are looking at is how the wrong bill gets edited.

    It stops the moment money lands. A total that moves under a payment leaves
    a receipt describing a bill that no longer exists, and there is no honest
    way back from that — from then on it is a discount or a credit note.
  */
  const issuedBill = await client.invoice.findFirst({
    where: {
      cargoId: input.cargoId,
      status: { notIn: ["DRAFT", "CANCELLED"] },
    },
    include: { payments: true },
    orderBy: { createdAt: "asc" },
  });
  if (issuedBill) {
    return repriceIssuedBill(client, actor, issuedBill, input, given);
  }

  /* Both boxes empty is the request to go back to the book, and that is the
     one case where an agreement already on the draft is deliberately dropped. */
  const fromBook = input.rate === null && input.freight === null;
  const priced = await priceWaitingCargo(client, actor, input.cargoId, {
    reason,
    keepAgreedRate: !fromBook,
  });
  if (priced.kind === "blocked") {
    throw new PriceListRefused(`${priced.reference}: ${priced.reason}`);
  }
  if (priced.kind === "billed") {
    throw new PriceListRefused(
      `${priced.reference} is already billed. Change the price on the bill.`
    );
  }
  if (priced.kind === "not-counted") {
    throw new PriceListRefused("Dar has not counted this cargo yet.");
  }

  const invoice = await client.invoice.findUnique({
    where: { id: priced.invoiceId },
    include: {
      items: true,
      cargo: {
        select: {
          reference: true,
          description: true,
          darReceiving: { select: { cbm: true, weightKg: true } },
          chinaReceiving: { select: { cbm: true, weightKg: true } },
        },
      },
    },
  });
  if (!invoice || invoice.status !== "DRAFT") {
    throw new PriceListRefused("That bill has already been issued.");
  }

  const freightItems = invoice.items.filter((i) => i.category === "Freight");
  let appliedRate = invoice.appliedRate;
  let rateBasis = invoice.rateBasis;
  let billableCbm = invoice.billableCbm;
  let billableKg = invoice.billableKg;

  const replaceFreight = async (line: {
    quantity: Prisma.Decimal;
    unit: string;
    unitPrice: Prisma.Decimal;
  }) => {
    await client.invoiceItem.deleteMany({
      where: { id: { in: freightItems.map((i) => i.id) } },
    });
    await client.invoiceItem.create({
      data: {
        invoiceId: invoice.id,
        description: `Sea freight — ${invoice.cargo.description}`,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice,
        amount: line.quantity.mul(line.unitPrice).toDecimalPlaces(2),
        category: "Freight",
        taxable: true,
      },
    });
  };

  if (input.rate !== null) {
    const unit = FREIGHT_UNIT[input.basis];
    /*
      THE PER-LINE WORKING SURVIVES WHERE IT CAN.

      A consignment billed as four typed lines keeps its four lines: each is
      re-multiplied at the agreed rate, so the customer can still see which
      goods cost what. It collapses to one line only when the unit itself is
      changing, because a cubic-metre line and a kilo line are not the same
      line with a different price on it.
    */
    const sameUnit =
      freightItems.length > 0 && freightItems.every((i) => i.unit === unit);
    if (sameUnit && input.basis !== "FLAT") {
      for (const item of freightItems) {
        await client.invoiceItem.update({
          where: { id: item.id },
          data: {
            unitPrice: input.rate,
            amount: item.quantity.mul(input.rate).toDecimalPlaces(2),
          },
        });
      }
      const quantity = freightItems.reduce(
        (sum, i) => sum.add(i.quantity),
        new Prisma.Decimal(0)
      );
      billableCbm = input.basis === "PER_CBM" ? quantity : null;
      billableKg = input.basis === "PER_KG" ? quantity : null;
    } else {
      const measured = billingMeasurement(invoice.cargo);
      const quantity =
        input.basis === "PER_CBM" ? measured.measuredCbm : measured.measuredKg;
      if (!quantity || new Prisma.Decimal(quantity).lessThanOrEqualTo(0)) {
        throw new PriceListRefused(
          input.basis === "PER_CBM"
            ? "Nothing has been measured, so there is no volume to charge."
            : "Nothing has been weighed, so there are no kilos to charge."
        );
      }
      await replaceFreight({
        quantity: new Prisma.Decimal(quantity),
        unit,
        unitPrice: input.rate,
      });
      billableCbm = input.basis === "PER_CBM" ? new Prisma.Decimal(quantity) : null;
      billableKg = input.basis === "PER_KG" ? new Prisma.Decimal(quantity) : null;
    }
    appliedRate = input.rate;
    rateBasis = input.basis;
  } else if (input.freight !== null) {
    await replaceFreight({
      quantity: new Prisma.Decimal(1),
      unit: "consignment",
      unitPrice: input.freight,
    });
    /* Nobody agreed a rate, so the bill does not claim one. The book's figure
       stays where it is, which is what the gap is measured against. */
    appliedRate = null;
    rateBasis = "FLAT";
    billableCbm = null;
    billableKg = null;
  } else {
    /* Back to the book: priceWaitingCargo has already rewritten the lines. */
    const fresh = await client.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      select: {
        appliedRate: true,
        rateBasis: true,
        billableCbm: true,
        billableKg: true,
      },
    });
    appliedRate = fresh.appliedRate;
    rateBasis = fresh.rateBasis;
    billableCbm = fresh.billableCbm;
    billableKg = fresh.billableKg;
  }

  /* One extra and one discount, each replaced rather than stacked. Pressing
     Save twice with 20 in the box means twenty dollars, not forty. */
  const extras = invoice.items.filter((i) => i.category === "Charge");
  if (extras.length > 0) {
    await client.invoiceItem.deleteMany({ where: { id: { in: extras.map((i) => i.id) } } });
  }
  if (input.extra && input.extra.greaterThan(0)) {
    await client.invoiceItem.create({
      data: {
        invoiceId: invoice.id,
        description: `Additional charge — ${reason}`,
        quantity: new Prisma.Decimal(1),
        unit: null,
        unitPrice: input.extra,
        amount: input.extra,
        category: "Charge",
        taxable: true,
      },
    });
  }

  const offs = invoice.items.filter((i) => i.category === "Discount");
  if (offs.length > 0) {
    await client.invoiceItem.deleteMany({ where: { id: { in: offs.map((i) => i.id) } } });
  }
  const off = input.discount && input.discount.greaterThan(0) ? input.discount : null;
  if (off) {
    await client.invoiceItem.create({
      data: {
        invoiceId: invoice.id,
        description: `Discount — ${reason}`,
        quantity: new Prisma.Decimal(1),
        unit: null,
        unitPrice: off.negated(),
        amount: off.negated(),
        category: "Discount",
        taxable: true,
      },
    });
  }

  const items = await client.invoiceItem.findMany({ where: { invoiceId: invoice.id } });
  const subtotal = items.reduce((sum, i) => sum.add(i.amount), new Prisma.Decimal(0));
  if (subtotal.lessThan(0)) {
    throw new PriceListRefused("That takes the bill below nothing. Lower the discount.");
  }
  const { vatAmount, total } = applyVat(subtotal, invoice.vatPercent);

  if (
    (invoice.appliedRate?.toString() ?? null) !== (appliedRate?.toString() ?? null)
  ) {
    await recordFieldChange(
      {
        actor,
        entity: "Invoice",
        entityId: invoice.id,
        field: "appliedRate",
        oldValue: invoice.appliedRate?.toString() ?? "from the rate book",
        newValue: appliedRate?.toString() ?? "typed as a total",
        reason,
      },
      client
    );
  }
  if (!invoice.total.equals(total)) {
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
  }

  const claim = await client.invoice.updateMany({
    where: { id: invoice.id, status: "DRAFT" },
    data: {
      appliedRate,
      rateBasis,
      billableCbm,
      billableKg,
      /* A book draft at mixed rates has no standard to measure against; the
         old figure becomes it, so the agreement is still visible as one. */
      standardRate: invoice.standardRate ?? invoice.appliedRate ?? undefined,
      discount: off ?? new Prisma.Decimal(0),
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
      summary: `Priced draft ${invoice.number} on the price list at ${
        appliedRate
          ? `${invoice.currency} ${appliedRate}/${FREIGHT_UNIT[rateBasis ?? "PER_CBM"]}`
          : "a freight total typed by hand"
      } — ${invoice.currency} ${total}: ${reason}`,
      metadata: {
        from: invoice.total.toString(),
        to: total.toString(),
        oldRate: invoice.appliedRate?.toString() ?? null,
        rate: appliedRate?.toString() ?? null,
        basis: rateBasis,
        extra: input.extra?.toString() ?? null,
        discount: off?.toString() ?? null,
        reason,
      },
    },
    client
  );

  return { invoiceNumber: invoice.number, total, issued: false };
}

/**
 * THE SAME FOUR FIGURES, ON A BILL THE CUSTOMER IS ALREADY HOLDING.
 *
 * Deliberately narrower than the draft path in three ways, and identical in
 * every other:
 *
 *  - It refuses once any money has been taken. A receipt names a total.
 *  - It never re-reads a measurement. "Both boxes empty" on a draft means
 *    "price it from the rate book again", which re-derives the volume; here it
 *    means "back to the rate this bill itself recorded as the book's", because
 *    an issued bill is never moved by a measurement.
 *  - It never touches the exchange rate or the collection accounts. The
 *    shilling figure is re-struck at the rate PINNED on the bill, not today's,
 *    so a correction of two dollars does not quietly restate the whole total
 *    at a rate the customer was never quoted.
 */
async function repriceIssuedBill(
  client: TxClient,
  actor: Actor,
  invoice: Prisma.InvoiceGetPayload<{ include: { payments: true } }>,
  input: WaitingPriceInput,
  reason: string
): Promise<{ invoiceNumber: string; total: Prisma.Decimal; issued: boolean }> {
  if (reason.length < 3) {
    throw new PriceListRefused(
      "Say why this bill is changing — the customer has already been given it."
    );
  }
  /* VERIFIED money only. A PENDING claim is somebody SAYING money moved and
     nobody having checked; refusing on it would leave a bill frozen by an
     unverified sentence, which is the opposite of what verification is for.
     The claim is still matched against the bill when it is verified, and an
     overpayment is shown as one. */
  const taken = invoice.payments.filter((p) => p.status === "VERIFIED");
  if (taken.length > 0) {
    throw new PriceListRefused(
      `Money has already been taken against ${invoice.number}. Correct it with a discount or a credit note.`
    );
  }

  const items = await client.invoiceItem.findMany({ where: { invoiceId: invoice.id } });
  const freightItems = items.filter((i) => i.category === "Freight");
  let appliedRate = invoice.appliedRate;
  let rateBasis = invoice.rateBasis;
  let billableCbm = invoice.billableCbm;
  let billableKg = invoice.billableKg;

  if (input.rate !== null) {
    const unit = FREIGHT_UNIT[input.basis];
    const sameUnit =
      freightItems.length > 0 && freightItems.every((i) => i.unit === unit);
    const quantity = sameUnit
      ? freightItems.reduce((sum, i) => sum.add(i.quantity), new Prisma.Decimal(0))
      : /* The bill's own billable figure, never a fresh measurement. */
        (input.basis === "PER_CBM" ? invoice.billableCbm : invoice.billableKg);
    if (!quantity || quantity.lessThanOrEqualTo(0)) {
      throw new PriceListRefused(
        input.basis === "PER_CBM"
          ? `${invoice.number} carries no volume to charge per cubic metre. Type the freight instead.`
          : `${invoice.number} carries no weight to charge per kilo. Type the freight instead.`
      );
    }
    if (sameUnit) {
      for (const item of freightItems) {
        await client.invoiceItem.update({
          where: { id: item.id },
          data: {
            unitPrice: input.rate,
            amount: item.quantity.mul(input.rate).toDecimalPlaces(2),
          },
        });
      }
    } else {
      await client.invoiceItem.deleteMany({
        where: { id: { in: freightItems.map((i) => i.id) } },
      });
      await client.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          description: `Sea freight — re-priced ${unit === "kg" ? "per kg" : "per CBM"}`,
          quantity,
          unit,
          unitPrice: input.rate,
          amount: quantity.mul(input.rate).toDecimalPlaces(2),
          category: "Freight",
          taxable: true,
        },
      });
    }
    appliedRate = input.rate;
    rateBasis = input.basis;
    billableCbm = input.basis === "PER_CBM" ? quantity : null;
    billableKg = input.basis === "PER_KG" ? quantity : null;
  } else if (input.freight !== null) {
    await client.invoiceItem.deleteMany({
      where: { id: { in: freightItems.map((i) => i.id) } },
    });
    await client.invoiceItem.create({
      data: {
        invoiceId: invoice.id,
        description: "Sea freight — agreed for this consignment",
        quantity: new Prisma.Decimal(1),
        unit: "consignment",
        unitPrice: input.freight,
        amount: input.freight,
        category: "Freight",
        taxable: true,
      },
    });
    appliedRate = null;
    rateBasis = "FLAT";
    billableCbm = null;
    billableKg = null;
  } else {
    /* Back to the book, as the bill itself recorded the book — not as the rate
       book reads today, and not on a volume re-measured since. */
    if (!invoice.standardRate) {
      throw new PriceListRefused(
        `${invoice.number} does not carry the rate book's own figure, so there is nothing to go back to. Type the rate or the freight.`
      );
    }
    for (const item of freightItems) {
      await client.invoiceItem.update({
        where: { id: item.id },
        data: {
          unitPrice: invoice.standardRate,
          amount: item.quantity.mul(invoice.standardRate).toDecimalPlaces(2),
        },
      });
    }
    appliedRate = invoice.standardRate;
  }

  const extras = items.filter((i) => i.category === "Charge");
  if (extras.length > 0) {
    await client.invoiceItem.deleteMany({ where: { id: { in: extras.map((i) => i.id) } } });
  }
  if (input.extra && input.extra.greaterThan(0)) {
    await client.invoiceItem.create({
      data: {
        invoiceId: invoice.id,
        description: `Additional charge — ${reason}`,
        quantity: new Prisma.Decimal(1),
        unit: null,
        unitPrice: input.extra,
        amount: input.extra,
        category: "Charge",
        taxable: true,
      },
    });
  }

  const offs = items.filter((i) => i.category === "Discount");
  if (offs.length > 0) {
    await client.invoiceItem.deleteMany({ where: { id: { in: offs.map((i) => i.id) } } });
  }
  const off = input.discount && input.discount.greaterThan(0) ? input.discount : null;
  if (off) {
    await client.invoiceItem.create({
      data: {
        invoiceId: invoice.id,
        description: `Discount — ${reason}`,
        quantity: new Prisma.Decimal(1),
        unit: null,
        unitPrice: off.negated(),
        amount: off.negated(),
        category: "Discount",
        taxable: true,
      },
    });
  }

  const now = await client.invoiceItem.findMany({ where: { invoiceId: invoice.id } });
  const subtotal = now.reduce((sum, i) => sum.add(i.amount), new Prisma.Decimal(0));
  if (subtotal.lessThan(0)) {
    throw new PriceListRefused("That takes the bill below nothing. Lower the discount.");
  }
  const { vatAmount, total } = applyVat(subtotal, invoice.vatPercent);

  for (const [field, before, after] of [
    ["appliedRate", invoice.appliedRate?.toString() ?? "from the rate book", appliedRate?.toString() ?? "typed as a total"],
    ["total", invoice.total.toString(), total.toString()],
  ] as const) {
    if (before === after) continue;
    await recordFieldChange(
      { actor, entity: "Invoice", entityId: invoice.id, field, oldValue: before, newValue: after, reason },
      client
    );
  }

  /* Conditional on the bill still standing exactly as it was read: a payment
     verified or a cancellation in the same second must win. */
  const claim = await client.invoice.updateMany({
    where: { id: invoice.id, status: invoice.status, total: invoice.total },
    data: {
      appliedRate,
      rateBasis,
      billableCbm,
      billableKg,
      discount: off ?? new Prisma.Decimal(0),
      subtotal,
      vatAmount,
      total,
      /* The rate this bill was agreed at, never today's. */
      totalTzs: invoice.fxRate ? usdToTzs(total, invoice.fxRate) : invoice.totalTzs,
    },
  });
  if (claim.count === 0) {
    throw new PriceListRefused(`${invoice.number} changed a moment ago. Open it again.`);
  }

  await recordAudit(
    {
      actor,
      action: "invoice.reprice",
      entity: "Invoice",
      entityId: invoice.id,
      summary: `Re-priced issued ${invoice.number} from ${invoice.currency} ${invoice.total} to ${invoice.currency} ${total}: ${reason}`,
      metadata: {
        from: invoice.total.toString(),
        to: total.toString(),
        oldRate: invoice.appliedRate?.toString() ?? null,
        rate: appliedRate?.toString() ?? null,
        basis: rateBasis,
        extra: input.extra?.toString() ?? null,
        discount: off?.toString() ?? null,
        /* Untouched, and said so: the bill keeps the rate and the accounts it
           was issued with. */
        fxRate: invoice.fxRate?.toString() ?? null,
        reason,
      },
    },
    client
  );

  return { invoiceNumber: invoice.number, total, issued: true };
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
