"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, type Role } from "@prisma/client";

import { formatCurrency, formatRate, roundMoney, tzsToUsd, usdToTzs } from "@/lib/currency";

import { recordAudit, recordFieldChange } from "@/lib/audit";
import { nextInvoiceNumber, reserveInvoiceNumbers } from "@/lib/ids";
import { impliedStatus, outstandingOf } from "@/lib/invoice-balance";
import { billingMeasurement, priceConsignment } from "@/lib/invoice-draft";
import { notifyCustomer } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { storagePosition } from "@/lib/storage-fee";
import {
  applyVat,
  companySettings,
  currentExchangeRate,
  resolveRate,
} from "@/lib/pricing";
import { darConfirmationGap } from "@/lib/price-confirmation";
import { can } from "@/lib/rbac";
import { authorize } from "@/lib/session";
import { refreshInvoiceStatus } from "@/lib/invoice-status";
import { paymentSnapshotNow } from "@/lib/invoice-accounts";
import { confirmPrices } from "@/lib/actions/price-list";
import { storageStart } from "@/lib/storage-clock";


/**
 * THE RATE A BILL IS FINALISED AT.
 *
 * A draft carries whatever rate was on the board when it was raised, because
 * nobody has been told a figure yet. Issuing is the moment the customer is told
 * one, so the rate is taken again then and never read again afterwards — a bill
 * issued at 2,700 stays 2,700 when the board moves to 2,800.
 */
function issueSnapshot(
  invoice: { total: Prisma.Decimal; currency: string },
  fx: { id: string; rate: Prisma.Decimal }
) {
  return {
    exchangeRateId: fx.id,
    fxRate: fx.rate,
    totalTzs:
      invoice.currency === "TZS"
        ? roundMoney(invoice.total, "TZS")
        : usdToTzs(invoice.total, fx.rate),
  };
}

/** A second bill for the same boxes, caught inside the lock. Never shown raw. */
class DuplicateInvoice extends Error {}

/** "TZS 36,450 (USD 13.50 at 1 USD = 2,700 TZS)" */
function amountDueLine(totalUsd: Prisma.Decimal, rate: Prisma.Decimal) {
  return `${formatCurrency(usdToTzs(totalUsd, rate), "TZS")} (${formatCurrency(totalUsd, "USD")} at ${formatRate(rate)})`;
}

export type ActionState = { error?: string; ok?: string; id?: string };

/**
 * Raise a bill for one consignment on one sailing.
 *
 * IT REFUSES ANYTHING THAT HAS NOT LANDED. Sea freight is billed on what Dar
 * actually received, because that is the figure the customer can be shown and
 * the only one anybody can defend. Invoicing from the Guangzhou measurement
 * means re-issuing every bill where the two disagree.
 *
 * The rate, the VAT percentage and the exchange rate are all written onto the
 * invoice here. While it is still a draft, a corrected measurement re-prices
 * its freight from the rate book (lib/invoice-reprice.ts); once it is issued
 * nothing downstream re-reads them.
 */
export async function generateInvoice(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("invoice.create");

  const cargoId = String(formData.get("cargoId") ?? "");
  const cargo = await prisma.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    include: {
      receiver: true,
      darReceiving: true,
      chinaReceiving: true,
      containerLines: { include: { container: true } },
      invoices: { where: { status: { not: "CANCELLED" } } },
    },
  });
  if (!cargo) return { error: "That cargo no longer exists." };

  if (!cargo.darReceiving) {
    return {
      error: `${cargo.reference} has not been received in Dar. Sea freight is billed on what actually landed.`,
    };
  }

  const line = cargo.containerLines.at(-1) ?? null;
  if (cargo.invoices.some((i) => i.containerCargoId === (line?.id ?? null))) {
    return { error: "This consignment already has a live invoice for that sailing." };
  }

  const settings = await companySettings();
  const fx = await currentExchangeRate();

  /* Dar's measurement first, falling back to China's when Dar recorded a count
     but not a volume — the bill still has to be raisable. Typed lines are
     priced as they stand, after whatever Dar corrected on them. */
  const priced = await priceConsignment({
    id: cargo.id,
    description: cargo.description,
    commodity: cargo.commodity,
    service: cargo.service,
    receiverId: cargo.receiverId,
    ...billingMeasurement(cargo),
  });

  if (priced.blockedReason) {
    return { error: priced.blockedReason };
  }

  const vatPercent = new Prisma.Decimal(settings?.vatPercent ?? 0);
  const { vatAmount, total } = applyVat(priced.amount, vatPercent);

  let invoice: Awaited<ReturnType<typeof prisma.invoice.create>>;
  try {
    invoice = await prisma.$transaction(async (tx) => {
      /* Two people on the invoices screen pressing "Raise invoice" at the same
         second both pass the check above. On a sailing the unique constraint on
         the container line decides it and the loser is told plainly rather than
         shown a stack trace; a consignment with no sailing has no such line, so
         the lock is what serialises them. */
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${cargo.id}, 0))`;
      const again = await tx.invoice.findFirst({
        where: {
          cargoId: cargo.id,
          status: { not: "CANCELLED" },
          containerCargoId: line?.id ?? null,
        },
        select: { id: true },
      });
      if (again) throw new DuplicateInvoice();
      const number = await nextInvoiceNumber(tx);
      return tx.invoice.create({
        data: {
          number,
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
    });
  } catch (error) {
    if (
      error instanceof DuplicateInvoice ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
    ) {
      return {
        error:
          "Somebody raised an invoice for this sailing a moment ago. Refresh the list before raising another.",
      };
    }
    throw error;
  }

  await recordAudit({
    actor,
    action: "invoice.create",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `Raised ${invoice.number} for ${cargo.reference} — ${priced.explanation}, total ${priced.currency} ${total}`,
    metadata: {
      explanation: priced.explanation,
      standardRate: priced.standardRate?.toString() ?? null,
      appliedRate: priced.appliedRate?.toString() ?? null,
      vatPercent: vatPercent.toString(),
      fxRate: fx?.rate?.toString() ?? null,
    },
  });

  revalidatePath("/app/finance/invoices");
  revalidatePath(`/app/cargo/${cargo.id}`);
  return { ok: `${invoice.number} raised as a draft.`, id: invoice.id };
}

/** Raise drafts for everything on a container that has landed and has none. */
export async function generateContainerInvoices(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("invoice.create");

  const containerId = String(formData.get("containerId") ?? "");
  const lines = await prisma.containerCargo.findMany({
    where: {
      containerId,
      cargo: {
        deletedAt: null,
        OR: [{ chinaReceiving: { isNot: null } }, { darReceiving: { isNot: null } }],
        invoices: { none: { status: { not: "CANCELLED" } } },
      },
    },
    include: {
      cargo: {
        include: { darReceiving: true, chinaReceiving: true, receiver: true },
      },
    },
  });

  if (lines.length === 0) {
    return { ok: "Nothing on this container is waiting to be invoiced." };
  }

  const settings = await companySettings();
  const fx = await currentExchangeRate();
  const vatPercent = new Prisma.Decimal(settings?.vatPercent ?? 0);

  let raised = 0;
  const skipped: string[] = [];

  /* Numbers are reserved in one block rather than one at a time — a container
     of three hundred consignments is three hundred round trips otherwise, and
     the counter upsert is atomic either way. */
  const numbers = await prisma.$transaction((tx) =>
    reserveInvoiceNumbers(tx, lines.length)
  );

  for (const [index, line] of lines.entries()) {
    const cargo = line.cargo;
    const priced = await priceConsignment({
      id: cargo.id,
      description: cargo.description,
      commodity: cargo.commodity,
      service: cargo.service,
      receiverId: cargo.receiverId,
      ...billingMeasurement(cargo),
    });

    if (priced.blockedReason) {
      skipped.push(`${cargo.reference}: ${priced.blockedReason}`);
      continue;
    }

    const { vatAmount, total } = applyVat(priced.amount, vatPercent);

    /* Two people pressing this on the same container both read the same lines
       and both try to write. The unique constraint on the sailing decides it,
       and the loser is named in the answer — an unhandled collision here would
       abandon the run half-done, with the consignments after it unbilled and
       nothing on screen saying which. */
    try {
      await prisma.invoice.create({
        data: {
          number: numbers[index],
          customerId: cargo.receiverId,
          cargoId: cargo.id,
          containerCargoId: line.id,
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
      raised++;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        skipped.push(`${cargo.reference}: already billed for this sailing.`);
        continue;
      }
      throw error;
    }
  }

  await recordAudit({
    actor,
    action: "invoice.bulk",
    entity: "Container",
    entityId: containerId,
    summary: `Raised ${raised} draft invoice(s)${skipped.length ? `, ${skipped.length} could not be priced` : ""}`,
    metadata: { skipped },
  });

  revalidatePath("/app/finance/invoices");
  return {
    ok: skipped.length
      ? `${raised} raised. ${skipped.length} could not be priced: ${skipped[0]}`
      : `${raised} draft invoice(s) raised.`,
  };
}

/**
 * Send it to the customer.
 *
 * A draft is Finance's working; an issued invoice is a demand for money and is
 * what the release engine looks at. Issuing is where the customer is told.
 */
export async function issueInvoice(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("invoice.issue");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const dueDays = Number(formData.get("dueDays") ?? 7);

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      cargo: {
        select: {
          reference: true,
          senderId: true,
          darReceiving: { select: { verified: true, discrepancy: true } },
          chinaReceiving: { select: { id: true } },
        },
      },
    },
  });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.status !== "DRAFT") {
    return { error: "That invoice has already been issued." };
  }
  /* Something must have been measured — China's counter is enough. */
  const gap = darConfirmationGap(invoice.cargo);
  if (gap) return { error: `${invoice.cargo.reference}: ${gap}` };

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + (Number.isFinite(dueDays) ? dueDays : 7));

  const fx = await currentExchangeRate();
  if (!fx) {
    return { error: "There is no exchange rate published. Set one in the Rate book first." };
  }
  const snapshot = issueSnapshot(invoice, fx);

  await prisma.$transaction(async (tx) => {
    const claim = await tx.invoice.updateMany({
      where: { id: invoice.id, status: "DRAFT" },
      data: {
        status: "ISSUED",
        issuedAt: new Date(),
        dueAt,
        ...snapshot,
        paymentSnapshot: await paymentSnapshotNow(tx),
      },
    });
    if (claim.count === 0) throw new Error("Somebody else issued it first.");

    await notifyCustomer(
      [invoice.customerId],
      {
        kind: "invoice.issued",
        title: `Invoice ${invoice.number}`,
        body: `${amountDueLine(invoice.total, snapshot.fxRate)} is due for ${invoice.cargo.reference}.`,
        href: "/portal/invoices",
      },
      tx
    );
  });

  await recordAudit({
    actor,
    action: "invoice.issue",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `Issued ${invoice.number} — ${amountDueLine(invoice.total, snapshot.fxRate)}`,
    metadata: { exchangeRateId: snapshot.exchangeRateId, fxRate: snapshot.fxRate.toString(), totalTzs: snapshot.totalTzs.toString() },
  });

  revalidatePath("/app/finance/invoices");
  revalidatePath(`/app/finance/invoices/${invoice.id}`);
  return { ok: `${invoice.number} issued.` };
}

const adjustSchema = z.object({
  invoiceId: z.string().min(1),
  appliedRate: z.coerce.number().min(0).optional(),
  additionalCharge: z.coerce.number().optional(),
  chargeDescription: z.string().trim().optional(),
  reason: z.string().trim().min(3, "Say why."),
});

/**
 * Change what a customer is being asked to pay.
 *
 * Only on a draft. Once an invoice is issued the customer has been told a
 * figure, and moving it afterwards — even downward — is a credit note, not an
 * edit. Every change writes the old and new values before it takes effect.
 */
export async function adjustInvoice(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("invoice.discount");

  const parsed = adjustSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    appliedRate: formData.get("appliedRate") || undefined,
    additionalCharge: formData.get("additionalCharge") || undefined,
    chargeDescription: formData.get("chargeDescription") || undefined,
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  const invoice = await prisma.invoice.findUnique({
    where: { id: data.invoiceId },
    include: { items: true },
  });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.status !== "DRAFT") {
    return {
      error:
        "This invoice has been issued. The customer has been told a figure — raise a credit note rather than editing it.",
    };
  }

  const billable =
    invoice.billableCbm ?? invoice.billableKg ?? new Prisma.Decimal(1);
  const newRate =
    data.appliedRate !== undefined
      ? new Prisma.Decimal(data.appliedRate)
      : invoice.appliedRate ?? new Prisma.Decimal(0);

  const freight = billable.mul(newRate).toDecimalPlaces(2);
  const extra =
    data.additionalCharge !== undefined
      ? new Prisma.Decimal(data.additionalCharge)
      : new Prisma.Decimal(0);

  const subtotal = freight.add(extra);
  const { vatAmount, total } = applyVat(subtotal, invoice.vatPercent);
  const standardTotal = invoice.standardRate
    ? billable.mul(invoice.standardRate)
    : subtotal;

  await prisma.$transaction(async (tx) => {
    if (invoice.appliedRate && !invoice.appliedRate.equals(newRate)) {
      await recordFieldChange(
        {
          actor,
          entity: "Invoice",
          entityId: invoice.id,
          field: "appliedRate",
          oldValue: invoice.appliedRate.toString(),
          newValue: newRate.toString(),
          reason: data.reason,
        },
        tx
      );
    }
    await recordFieldChange(
      {
        actor,
        entity: "Invoice",
        entityId: invoice.id,
        field: "total",
        oldValue: invoice.total.toString(),
        newValue: total.toString(),
        reason: data.reason,
      },
      tx
    );

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        appliedRate: newRate,
        subtotal,
        vatAmount,
        total,
        discount: standardTotal.sub(freight).toDecimalPlaces(2),
        totalTzs: invoice.fxRate
          ? usdToTzs(total, invoice.fxRate)
          : null,
        notes: data.reason,
      },
    });

    /* The freight line follows the rate; anything else is added beside it so a
       customer can see what the extra was for. */
    const freightItem = invoice.items.find((i) => i.category === "Freight");
    if (freightItem) {
      await tx.invoiceItem.update({
        where: { id: freightItem.id },
        data: { unitPrice: newRate, amount: freight },
      });
    }
    if (!extra.isZero()) {
      await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          description: data.chargeDescription || "Additional charge",
          quantity: 1,
          unitPrice: extra,
          amount: extra,
          category: "Other",
        },
      });
    }
  });

  await recordAudit({
    actor,
    action: "invoice.adjust",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `${invoice.number}: total ${invoice.total} → ${total} — ${data.reason}`,
  });

  revalidatePath(`/app/finance/invoices/${invoice.id}`);
  return { ok: "Adjusted." };
}

export async function cancelInvoice(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("invoice.cancel");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Say why it is being cancelled." };

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (!invoice) return { error: "That invoice no longer exists." };

  if (invoice.payments.some((p) => p.status === "VERIFIED")) {
    return {
      error:
        "Money has been received against this invoice. Reverse the payment first — cancelling it here would make the receipt point at nothing.",
    };
  }

  /*
    THE SAILING IS RELEASED WITH THE BILL.

    `containerCargoId` is unique across invoices, which is what stops one
    sailing being billed twice. A cancelled invoice that kept its hold on that
    sailing would make the consignment permanently unbillable — Finance cancels
    a wrong bill, raises the right one, and the database refuses it. Clearing
    the link puts the sailing back in play; which sailing this bill covered is
    kept below, in a log that is never rewritten.
  */
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledReason: reason,
      containerCargoId: null,
    },
  });

  await recordAudit({
    actor,
    action: "invoice.cancel",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `Cancelled ${invoice.number} — ${reason}`,
    metadata: {
      containerCargoId: invoice.containerCargoId,
      cargoId: invoice.cargoId,
      total: invoice.total.toString(),
      currency: invoice.currency,
    },
  });

  revalidatePath("/app/finance/invoices");
  return { ok: "Cancelled." };
}


/**
 * CONFIRM THE PRICES ON A WHOLE CONTAINER.
 *
 * The same press as "Confirm all prices" on the price list, kept under this
 * name for the callers that already use it. It prices whatever Dar counted and
 * has no draft yet, then issues every draft on the container — see
 * lib/price-confirmation.ts. A line the rate book cannot price is named and
 * left waiting; the rest of the container goes out.
 */
export async function confirmContainerPricing(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await authorize("invoice.priceConfirm");
  if (!String(formData.get("containerId") ?? "")) {
    return { error: "Which container?" };
  }
  return confirmPrices({}, formData);
}


/*
  A SETTLED BILL IS NOT RE-OPENED AT THE COUNTER.

  invoice.discount is held by Support so that a customer on the phone can be
  given a little off before they pay. Once the bill is paid in full, or the
  boxes it paid for have left the warehouse, changing it rewrites money the
  books have already counted — and nobody is on the phone any more. That is a
  correction, and corrections belong to the desks holding invoice.edit.
*/
async function settledRefusal(
  actor: { role: Role },
  invoice: { status: string; cargoId: string }
): Promise<string | null> {
  if (can(actor.role, "invoice.edit")) return null;
  if (invoice.status === "PAID") {
    return "This bill is paid in full. Ask Finance to correct it.";
  }
  const released = await prisma.release.findFirst({
    where: { cargoId: invoice.cargoId },
    select: { id: true },
  });
  return released
    ? "This cargo has already been handed over. Ask Finance to correct the bill."
    : null;
}

/**
 * A DISCOUNT ON A BILL THE CUSTOMER HAS ALREADY SEEN.
 *
 * The rule everywhere else is that an issued figure does not move — the
 * customer has been told it. This is the deliberate exception, and it is why it
 * looks the way it does: it never edits the total in place. It appends a
 * negative line with a reason and a name on it, so the invoice document shows
 * what was charged, what was taken off, and who took it off.
 *
 * A discount larger than the bill is refused. Forgiving more than somebody owes
 * is not a discount, it is a payment out, and that is a different act.
 */
export async function discountInvoice(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("invoice.discount");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "How much is coming off?" };
  }
  if (reason.length < 3) return { error: "Say why it is being discounted." };

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.status === "CANCELLED") {
    return { error: "That invoice is cancelled." };
  }
  const settled = await settledRefusal(actor, invoice);
  if (settled) return { error: settled };

  /* Typed in shillings or dollars; the bill is in dollars, so shillings are
     turned into dollars here at the bill's own rate, not in the browser. */
  const inCurrency = String(formData.get("currency") ?? invoice.currency);
  let off = new Prisma.Decimal(amount);
  if (inCurrency === "TZS" && invoice.currency === "USD") {
    if (!invoice.fxRate || invoice.fxRate.lessThanOrEqualTo(1)) {
      return { error: "This bill has no exchange rate. Give the discount in dollars." };
    }
    off = tzsToUsd(off, invoice.fxRate);
    if (off.lessThanOrEqualTo(0)) return { error: "That is less than one cent." };
  }
  if (off.greaterThan(invoice.total)) {
    return {
      error: `The bill is only ${invoice.currency} ${invoice.total}. A discount cannot be larger than it.`,
    };
  }

  const subtotal = invoice.subtotal.sub(off);
  const { vatAmount, total } = applyVat(subtotal, invoice.vatPercent);

  await prisma.$transaction(async (tx) => {
    /* Written before it takes effect, like every other change to a figure
       somebody has been shown. */
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
      tx
    );

    await tx.invoiceItem.create({
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

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        discount: invoice.discount.add(off),
        subtotal,
        vatAmount,
        total,
        totalTzs: invoice.fxRate
          ? usdToTzs(total, invoice.fxRate)
          : null,
      },
    });
  });

  await recordAudit({
    actor,
    action: "invoice.discount",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `Took ${invoice.currency} ${off} off ${invoice.number}: ${reason}`,
  });

  /* The stored status follows the new total: a bill that now owes is not
     left reading PAID, and one a discount settled is not left reading ISSUED. */
  await refreshInvoiceStatus(invoice.id);

  revalidatePath(`/app/finance/invoices/${invoice.id}`);
  return { ok: `${invoice.currency} ${off} taken off.` };
}

/**
 * RE-PRICE A BILL AT A DIFFERENT RATE PER CBM.
 *
 * Every line is re-multiplied at the new rate and the old rate is written to
 * FieldChange first. Flat-rate and per-kilo lines are left alone — they are not
 * priced per cubic metre, and silently scaling them would be inventing a charge.
 */
export async function repriceInvoice(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("invoice.discount");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const rate = Number(formData.get("rate") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim();
  /* Optional: the category and the volume, the two things our prices move on
     besides the rate itself. Absent means unchanged. */
  const rawCategory = formData.get("category");
  const category = rawCategory === null ? undefined : String(rawCategory).trim() || null;
  const rawCbm = String(formData.get("cbm") ?? "").trim();
  const cbmIn = rawCbm ? Number(rawCbm) : undefined;

  if (!Number.isFinite(rate) || rate <= 0) return { error: "Give a rate." };
  if (cbmIn !== undefined && (!Number.isFinite(cbmIn) || cbmIn <= 0 || cbmIn > 5000)) {
    return { error: "Check the volume." };
  }
  if (reason.length < 3) return { error: "Say why the price is changing." };

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: true, cargo: { select: { service: true } } },
  });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.status === "CANCELLED") {
    return { error: "That invoice is cancelled." };
  }
  const settled = await settledRefusal(actor, invoice);
  if (settled) return { error: settled };

  const next = new Prisma.Decimal(rate);
  const cbmLines = invoice.items.filter((i) => i.unit === "CBM");
  if (cbmLines.length === 0) {
    return { error: "Nothing on this bill is priced per cubic metre." };
  }

  /* One freight line: its category and volume can be changed here. A bill
     with several is changed line by line on the bill itself. */
  const single = cbmLines.length === 1 ? cbmLines[0] : null;
  const oldCategory = single?.category ?? null;
  const newCategory = category !== undefined && category !== oldCategory ? category : undefined;
  const newCbm =
    cbmIn !== undefined && single && !single.quantity.equals(new Prisma.Decimal(cbmIn))
      ? new Prisma.Decimal(cbmIn).toDecimalPlaces(4)
      : undefined;
  if (!single) {
    const moved = cbmLines.some(
      (l) =>
        (category !== undefined && l.category !== category) ||
        (cbmIn !== undefined && !l.quantity.equals(new Prisma.Decimal(cbmIn)))
    );
    if (moved) {
      return { error: "This bill has several freight lines — change the category or volume on the bill itself." };
    }
  }

  /* The book's rate for the new category, so the bill still says what the
     standard was beside what is charged. */
  let newStandard: Prisma.Decimal | null | undefined;
  if (newCategory !== undefined) {
    const { standard } = await resolveRate(prisma, {
      service: invoice.cargo?.service ?? "LCL",
      cargoType: newCategory,
    });
    newStandard = standard && standard.basis === "PER_CBM" ? standard.rate : null;
  }

  const quantityOf = (item: (typeof invoice.items)[number]) =>
    item === single && newCbm !== undefined ? newCbm : item.quantity;

  let subtotal = new Prisma.Decimal(0);
  for (const item of invoice.items) {
    subtotal = subtotal.add(
      item.unit === "CBM" ? quantityOf(item).mul(next) : item.amount
    );
  }
  const { vatAmount, total } = applyVat(subtotal, invoice.vatPercent);

  await prisma.$transaction(async (tx) => {
    if (!invoice.appliedRate || !invoice.appliedRate.equals(next)) {
      await recordFieldChange(
        {
          actor,
          entity: "Invoice",
          entityId: invoice.id,
          field: "appliedRate",
          oldValue: invoice.appliedRate?.toString() ?? "mixed",
          newValue: next.toString(),
          reason,
        },
        tx
      );
    }
    if (newCategory !== undefined) {
      await recordFieldChange(
        { actor, entity: "Invoice", entityId: invoice.id, field: "category", oldValue: oldCategory, newValue: newCategory, reason },
        tx
      );
    }
    if (newCbm !== undefined) {
      await recordFieldChange(
        { actor, entity: "Invoice", entityId: invoice.id, field: "billableCbm", oldValue: single!.quantity.toString(), newValue: newCbm.toString(), reason },
        tx
      );
    }

    for (const item of cbmLines) {
      const quantity = quantityOf(item);
      await tx.invoiceItem.update({
        where: { id: item.id },
        data: {
          unitPrice: next,
          quantity,
          ...(item === single && newCategory !== undefined ? { category: newCategory } : {}),
          amount: quantity.mul(next).toDecimalPlaces(2),
        },
      });
    }

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        ...(newCbm !== undefined ? { billableCbm: newCbm } : {}),
        ...(newStandard !== undefined ? { standardRate: newStandard } : {}),
        appliedRate: next,
        subtotal,
        vatAmount,
        total,
        totalTzs: invoice.fxRate
          ? usdToTzs(total, invoice.fxRate)
          : null,
      },
    });
  });

  await recordAudit({
    actor,
    action: "invoice.reprice",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `Re-priced ${invoice.number} at ${invoice.currency} ${next}/CBM${newCategory !== undefined ? `, category ${oldCategory ?? "none"} → ${newCategory ?? "none"}` : ""}${newCbm !== undefined ? `, ${single!.quantity} → ${newCbm} CBM` : ""}: ${reason}`,
  });

  await refreshInvoiceStatus(invoice.id);

  revalidatePath(`/app/finance/invoices/${invoice.id}`);
  return { ok: `Re-priced at ${invoice.currency} ${next} per CBM.` };
}

/**
 * PUT THE FLOOR RENT ON THE BILL, OR TAKE IT OFF AGAIN.
 *
 * Never automatic. The figure is worked out from the day Dar booked the boxes
 * in, less the free days, at the rate on CompanySetting — and then a person
 * decides. Whether to charge a customer who was three days late is a commercial
 * judgement, and a charge that appears by itself is one nobody can explain when
 * the customer rings.
 */
export async function chargeStorage(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("invoice.discount");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const remove = String(formData.get("remove") ?? "") === "1";

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: true,
      cargo: { include: { darReceiving: true, release: true } },
    },
  });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.status === "CANCELLED") {
    return { error: "That invoice is cancelled." };
  }
  const settled = await settledRefusal(actor, invoice);
  if (settled) return { error: settled };

  const existing = invoice.items.filter((i) => i.category === "Storage");

  if (remove) {
    if (existing.length === 0) return { error: "There is no storage on it." };
    const off = existing.reduce(
      (sum, i) => sum.add(i.amount),
      new Prisma.Decimal(0)
    );
    const subtotal = invoice.subtotal.sub(off);
    const { vatAmount, total } = applyVat(subtotal, invoice.vatPercent);

    await prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({
        where: { id: { in: existing.map((i) => i.id) } },
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          subtotal,
          vatAmount,
          total,
          totalTzs: invoice.fxRate
            ? usdToTzs(total, invoice.fxRate)
            : null,
        },
      });
    });

    await recordAudit({
      actor,
      action: "invoice.storage.waive",
      entity: "Invoice",
      entityId: invoice.id,
      summary: `Waived ${invoice.currency} ${off} of storage on ${invoice.number}`,
    });

    await refreshInvoiceStatus(invoice.id);

    revalidatePath(`/app/finance/invoices/${invoice.id}`);
    return { ok: "Storage taken off." };
  }

  if (existing.length > 0) {
    return { ok: "Storage is already on this bill." };
  }

  const settings = await companySettings();
  const position = storagePosition({
    receivedAt: storageStart(invoice.cargo.darReceiving?.receivedAt, invoice.cargo.clearedAt),
    collectedAt: invoice.cargo.release?.releasedAt ?? null,
    freeDays: settings?.freeStorageDays ?? 7,
    perDay: settings?.storagePerDay ?? 0,
    currency: settings?.storageCurrency ?? "USD",
  });

  if (!position.configured) {
    return {
      error:
        "No storage rate is set. An administrator sets one in Settings before it can be charged.",
    };
  }
  if (position.chargeableDays <= 0) {
    return {
      ok: `Still inside the ${position.freeDays} free days — nothing to charge.`,
    };
  }

  const subtotal = invoice.subtotal.add(position.amount);
  const { vatAmount, total } = applyVat(subtotal, invoice.vatPercent);

  await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.create({
      data: {
        invoiceId: invoice.id,
        description: `Storage — ${position.chargeableDays} day(s) beyond ${position.freeDays} free`,
        quantity: new Prisma.Decimal(position.chargeableDays),
        unit: "day",
        unitPrice: position.perDay,
        amount: position.amount,
        category: "Storage",
        taxable: true,
      },
    });
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        subtotal,
        vatAmount,
        total,
        totalTzs: invoice.fxRate
          ? usdToTzs(total, invoice.fxRate)
          : null,
      },
    });
  });

  await recordAudit({
    actor,
    action: "invoice.storage.charge",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `Added ${invoice.currency} ${position.amount} storage to ${invoice.number} (${position.chargeableDays} day(s))`,
  });

  await refreshInvoiceStatus(invoice.id);

  revalidatePath(`/app/finance/invoices/${invoice.id}`);
  return { ok: `${invoice.currency} ${position.amount} of storage added.` };
}


/**
 * THE EXCHANGE RATE ON ONE BILL.
 *
 * The dollar total does not move — only what it comes to in shillings. Used when
 * the counter agreed a rate with this customer that is not the board's. Payments
 * already taken keep the shilling value they were taken at; the balance is the
 * new shilling total less those.
 */
export async function changeInvoiceRate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  /* The shillings a customer was told to pay move with this figure while the
     dollar total sits still, so it is the bill's own desk that moves it —
     never the desk that only quotes it over the phone. */
  const actor = await authorize("invoice.edit");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const raw = String(formData.get("rate") ?? "").replace(/,/g, "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!/^\d+(\.\d{1,6})?$/.test(raw)) return { error: "Enter the rate, e.g. 2700." };
  const rate = new Prisma.Decimal(raw);
  if (rate.lessThan(100) || rate.greaterThan(100000)) {
    return { error: "That rate is outside any sensible USD → TZS range." };
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.status === "CANCELLED") return { error: "That invoice is cancelled." };
  const settled = await settledRefusal(actor, invoice);
  if (settled) return { error: settled };
  if (invoice.currency !== "USD") return { error: "Only a dollar bill has an exchange rate." };
  if (invoice.fxRate && invoice.fxRate.equals(rate)) return { error: "That is already the rate on this bill." };

  const totalTzs = usdToTzs(invoice.total, rate);
  await prisma.$transaction(async (tx) => {
    await recordFieldChange(
      {
        actor,
        entity: "Invoice",
        entityId: invoice.id,
        field: "fxRate",
        oldValue: invoice.fxRate,
        newValue: rate,
        reason: note || "Rate agreed for this bill",
      },
      tx
    );
    await tx.invoice.update({
      where: { id: invoice.id },
      /* No longer the published row: this bill carries a rate of its own. */
      data: { fxRate: rate, exchangeRateId: null, totalTzs },
    });
    await recordAudit(
      {
        actor,
        action: "invoice.rate",
        entity: "Invoice",
        entityId: invoice.id,
        summary: `${invoice.number}: ${invoice.fxRate ? formatRate(invoice.fxRate) : "no rate"} → ${formatRate(rate)}${note ? ` — ${note}` : ""}`,
        metadata: {
          oldValue: invoice.fxRate?.toString() ?? null,
          newValue: rate.toString(),
          reason: note || null,
        },
      },
      tx
    );
  });

  await refreshInvoiceStatus(invoice.id);
  revalidatePath(`/app/finance/invoices/${invoice.id}`);
  revalidatePath(`/app/cargo/${invoice.cargoId}`);
  revalidatePath("/app/finance/collections");
  return { ok: `Rate on ${invoice.number} is now ${formatRate(rate)} — ${formatCurrency(totalTzs, "TZS")}.` };
}

/**
 * ADJUST THIS INVOICE, AS ONE SAVE.
 *
 * The editor on the invoice page shows every figure a desk may correct — the
 * rate per CBM, storage, an additional charge, a discount, the exchange rate
 * and the note printed on the bill — and sends only the ones that changed. Each
 * is applied by the same action that does it on its own, in the order that
 * keeps VAT honest (price first, then what is added, then what is taken off,
 * then what it comes to in shillings), and each writes its own history. It
 * stops at the first refusal and says which one.
 */
export async function saveInvoiceAdjustments(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await authorize("invoice.discount");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: true },
  });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.status === "CANCELLED") return { error: "That invoice is cancelled." };

  const num = (key: string) => {
    const raw = String(formData.get(key) ?? "").replace(/,/g, "").trim();
    return raw === "" ? null : Number(raw);
  };
  const steps: { label: string; run: () => Promise<ActionState> }[] = [];
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    f.set("invoiceId", invoice.id);
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };

  const rate = num("appliedRate");
  if (rate !== null && (!invoice.appliedRate || !invoice.appliedRate.equals(rate))) {
    steps.push({
      label: "rate per CBM",
      run: () => repriceInvoice({}, form({ rate: String(rate), reason })),
    });
  }

  const hasStorage = invoice.items.some((i) => i.category === "Storage");
  const wantStorage = formData.get("storage") === "on";
  if (wantStorage !== hasStorage) {
    steps.push({
      label: "storage",
      run: () => chargeStorage({}, form(wantStorage ? {} : { remove: "1" })),
    });
  }

  const extra = num("additionalCharge");
  if (extra !== null && extra !== 0) {
    steps.push({
      label: "additional charge",
      run: () =>
        addInvoiceCharge(
          form({
            amount: String(extra),
            description: String(formData.get("chargeDescription") ?? "").trim(),
            reason,
          })
        ),
    });
  }

  const discount = num("discount");
  if (discount !== null && discount > 0) {
    steps.push({
      label: "discount",
      run: () => discountInvoice({}, form({ amount: String(discount), currency: "USD", reason })),
    });
  }

  const fx = String(formData.get("fxRate") ?? "").replace(/,/g, "").trim();
  if (fx && invoice.currency === "USD" && (!invoice.fxRate || !invoice.fxRate.equals(fx))) {
    steps.push({
      label: "exchange rate",
      run: () => changeInvoiceRate({}, form({ rate: fx, note: reason })),
    });
  }

  const note = String(formData.get("notes") ?? "").trim();
  if (note !== (invoice.notes ?? "")) {
    steps.push({ label: "note", run: () => setInvoiceNote(invoice.id, note) });
  }

  if (steps.length === 0) return { error: "Nothing was changed." };
  const needsReason = steps.some((s) => s.label !== "note");
  if (needsReason && reason.length < 3) {
    return { error: "Say why the bill is changing — it goes on the record with your name." };
  }

  const done: string[] = [];
  for (const step of steps) {
    const result = await step.run();
    if (result.error) {
      return {
        error: `${done.length ? `Saved ${done.join(", ")}. ` : ""}The ${step.label} was not changed: ${result.error}`,
      };
    }
    done.push(step.label);
  }

  revalidatePath(`/app/finance/invoices/${invoice.id}`);
  revalidatePath(`/app/cargo/${invoice.cargoId}`);
  revalidatePath("/app/finance/collections");
  return { ok: `Saved: ${done.join(", ")}.` };
}

/** A charge added to an issued bill — repacking, handling, delivery. Its own line. */
async function addInvoiceCharge(formData: FormData): Promise<ActionState> {
  const actor = await authorize("invoice.discount");
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const description = String(formData.get("description") ?? "").trim() || "Additional charge";
  const reason = String(formData.get("reason") ?? "").trim();
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "An additional charge has to be above zero. Use a discount to take money off." };
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { error: "That invoice no longer exists." };
  const settled = await settledRefusal(actor, invoice);
  if (settled) return { error: settled };

  const value = new Prisma.Decimal(amount).toDecimalPlaces(2);
  const subtotal = invoice.subtotal.add(value);
  const { vatAmount, total } = applyVat(subtotal, invoice.vatPercent);

  await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.create({
      data: {
        invoiceId: invoice.id,
        description,
        quantity: new Prisma.Decimal(1),
        unit: null,
        unitPrice: value,
        amount: value,
        category: "Charge",
        taxable: true,
      },
    });
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        subtotal,
        vatAmount,
        total,
        totalTzs: invoice.fxRate ? usdToTzs(total, invoice.fxRate) : null,
      },
    });
    await recordAudit(
      {
        actor,
        action: "invoice.charge",
        entity: "Invoice",
        entityId: invoice.id,
        summary: `Added ${formatCurrency(value, invoice.currency)} to ${invoice.number}: ${description}${reason ? ` — ${reason}` : ""}`,
        metadata: { oldValue: invoice.total.toString(), newValue: total.toString(), reason },
      },
      tx
    );
  });
  await refreshInvoiceStatus(invoice.id);
  return { ok: "Charge added." };
}

async function setInvoiceNote(invoiceId: string, note: string): Promise<ActionState> {
  const actor = await authorize("invoice.discount");
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { notes: true } });
  if (!invoice) return { error: "That invoice no longer exists." };
  await prisma.$transaction(async (tx) => {
    await recordFieldChange(
      { actor, entity: "Invoice", entityId: invoiceId, field: "notes", oldValue: invoice.notes, newValue: note || null },
      tx
    );
    await tx.invoice.update({ where: { id: invoiceId }, data: { notes: note || null } });
  });
  return { ok: "Note saved." };
}
