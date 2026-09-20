"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import { nextPaymentReference, nextReceiptNumber } from "@/lib/ids";
import { formatCurrency, formatRate, toBase } from "@/lib/currency";
import { balanceOf, outstandingOf } from "@/lib/invoice-balance";
import {
  parseAmount,
  paymentRate,
  spreadPayment,
  stillTakeableTzs,
  valuePayment,
} from "@/lib/payment-value";
import { notifyCustomer, notifyStaff, staffInDepartment } from "@/lib/notify";
import { issuePickupNoteIfSettled, withdrawPickupNoteIfOwing } from "@/lib/pickup-note";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { confirmPayment } from "@/lib/payment-confirm";
import { currentExchangeRate } from "@/lib/pricing";
import { authorize, authorizeCustomer } from "@/lib/session";
import { formMessage } from "@/lib/safe-error";
import { store, UploadError } from "@/lib/storage";

import { refreshInvoiceStatus } from "@/lib/invoice-status";

export type ActionState = { error?: string; ok?: string; id?: string };

const METHODS = ["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE", "OTHER"] as const;

const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.string().trim().min(1, "An amount is required."),
  currency: z.enum(["USD", "TZS"], { message: "Choose the currency the money came in." }),
  method: z.enum(METHODS),
  transactionRef: z.string().trim().optional(),
  payerName: z.string().trim().optional(),
  payerAccount: z.string().trim().optional(),
  payerBank: z.string().trim().optional(),
  paidAt: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  /* The rate agreed at the counter, when it is not the rate on the board. */
  fxRate: z.coerce.number().positive().optional(),
  /* Which of our accounts it reached. */
  accountId: z.string().trim().optional(),
  /* Delivery the customer put inside the same transfer. Never settles freight. */
  deliveryAdded: z.coerce.number().min(0).optional(),
  deliverySettledFrom: z.string().trim().optional(),
  idempotencyKey: z.string().trim().max(100).optional(),
  allowOverpayment: z.boolean().optional(),
  overpaymentReason: z.string().trim().optional(),
});


/**
 * Record money that has arrived, or hand a claim up to be checked.
 *
 * WHO RECORDS IT DECIDES WHETHER IT COUNTS NOW. By the owner's decision, as on
 * the air side: Finance (and the manager and owner, who hold the same
 * `payment.verify`) take money as confirmed — the receipt is issued and the
 * bill moves in the same press, because the person recording it is the person
 * who would have verified it. Support's recording is a claim and lands PENDING
 * for Finance, which is the separation that stops cargo leaving on a
 * screenshot a customer sent the help desk.
 */
export async function recordPayment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("payment.submit");
  const confirmsOwn = can(actor.role, "payment.verify");

  const parsed = paymentSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    amount: formData.get("amount"),
    currency: formData.get("currency") || "TZS",
    method: formData.get("method") || "BANK_TRANSFER",
    idempotencyKey: formData.get("idempotencyKey") || undefined,
    allowOverpayment: formData.get("allowOverpayment") === "on",
    overpaymentReason: formData.get("overpaymentReason") || undefined,
    transactionRef: formData.get("transactionRef") || undefined,
    payerName: formData.get("payerName") || undefined,
    payerAccount: formData.get("payerAccount") || undefined,
    payerBank: formData.get("payerBank") || undefined,
    paidAt: formData.get("paidAt") || undefined,
    accountId: formData.get("accountId") || undefined,
    deliveryAdded: formData.get("deliveryAdded") || undefined,
    deliverySettledFrom: formData.get("deliverySettledFrom") || undefined,
    notes: formData.get("notes") || undefined,
    fxRate: formData.get("fxRate") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  /* The same press arriving twice — a double click, a retry on a bad line — is
     one payment. The key is minted when the form opens. */
  if (data.idempotencyKey) {
    const already = await prisma.payment.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
      select: { reference: true },
    });
    if (already) return { ok: `Already recorded as ${already.reference}.` };
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: data.invoiceId },
    include: { payments: true },
  });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.status === "DRAFT") {
    return { error: "That invoice has not been issued yet." };
  }
  if (invoice.status === "CANCELLED") {
    return { error: "That invoice was cancelled." };
  }

  const parsedAmount = parseAmount(data.amount, data.currency);
  if ("error" in parsedAmount) return { error: parsedAmount.error };
  const amount = parsedAmount.amount;

  const live = await currentExchangeRate();

  /*
    THE RATE THIS ONE PAYMENT WAS TAKEN AT.

    The bill's own rate, so dollars against a dollar bill settle it exactly. The
    counter sometimes agrees something else, because the customer changed money
    at a bureau; overriding it here changes what this payment is worth against
    this bill and nothing else — no other invoice, no other payment, and never
    the published rate. The rate used is written onto the payment, so the
    receipt and the audit both show it.
  */
  const override = data.fxRate ? new Prisma.Decimal(data.fxRate) : null;
  const rate = paymentRate(invoice, override, live?.rate);
  if (!rate) {
    return { error: "There is no exchange rate to value this payment with. Publish one in the Rate book." };
  }
  const fx = {
    id: override ? null : invoice.fxRate && rate.equals(invoice.fxRate) ? invoice.exchangeRateId : (live?.id ?? null),
    rate,
  };
  const value = valuePayment(amount, data.currency, invoice.currency, rate);

  /* More than the bill still owes is refused unless somebody says, on the
     record, that they meant it. The excess becomes a credit on the bill. */
  const takeable = stillTakeableTzs(invoice);
  const excess = takeable ? value.baseCurrencyAmount.sub(takeable) : new Prisma.Decimal(0);
  if (excess.greaterThan(0)) {
    if (!data.allowOverpayment) {
      return {
        error: `That is ${formatCurrency(excess, "TZS")} more than ${invoice.number} still owes (${formatCurrency(takeable, "TZS")}). Correct the amount, or tick "Accept overpayment" and give a reason.`,
      };
    }
    if (!data.overpaymentReason || data.overpaymentReason.length < 3) {
      return { error: "Say why more than the bill owes is being accepted." };
    }
  }

  const files = formData
    .getAll("proof")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const proofs: string[] = [];
  try {
    for (const file of files) proofs.push(await store(file, "payments"));
  } catch (error) {
    return {
      error: error instanceof UploadError ? error.message : "That upload failed.",
    };
  }

  let payment: Awaited<ReturnType<typeof prisma.payment.create>>;
  try {
  payment = await prisma.$transaction(async (tx) => {
    const reference = await nextPaymentReference(tx);
    const created = await tx.payment.create({
      data: {
        reference,
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        amount,
        currency: data.currency,
        exchangeRateId: fx.id,
        fxRate: fx.rate,
        baseCurrencyAmount: value.baseCurrencyAmount,
        creditedAmount: value.creditedAmount,
        idempotencyKey: data.idempotencyKey || null,
        overpaymentReason: excess.greaterThan(0) ? data.overpaymentReason! : null,
        method: data.method,
        transactionRef: data.transactionRef || null,
        payerName: data.payerName || null,
        payerAccount: data.payerAccount || null,
        payerBank: data.payerBank || null,
        paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
        notes: data.notes || null,
        accountId: data.accountId || null,
        /* Recorded beside the payment, never added to it. Only the freight half
           settles the bill. */
        deliveryAdded: data.deliveryAdded
          ? new Prisma.Decimal(data.deliveryAdded)
          : null,
        deliverySettledFrom: data.deliverySettledFrom || null,
        recordedById: actor.id,
        status: "PENDING",
        proofs: {
          create: proofs.map((url) => ({ url })),
        },
      },
    });

    if (!confirmsOwn) {
      await notifyStaff(
        await staffInDepartment("FINANCE", tx),
        {
          kind: "payment.pending",
          title: `Payment to verify on ${invoice.number}`,
          body: `${formatCurrency(amount, data.currency)} recorded by ${actor.name}.`,
          href: "/app/finance/collections/verify",
        },
        tx
      );
    }

    return created;
  });
  } catch (error) {
    if (
      data.idempotencyKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: "Already recorded." };
    }
    throw error;
  }

  await recordAudit({
    actor,
    action: excess.greaterThan(0) ? "payment.record.overpaid" : "payment.record",
    entity: "Payment",
    entityId: payment.id,
    summary: `Recorded ${payment.reference}: ${formatCurrency(amount, data.currency)} (${formatCurrency(value.baseCurrencyAmount, "TZS")} at ${formatRate(rate)}) against ${invoice.number}${confirmsOwn ? "" : " — awaiting verification"}`,
    metadata: {
      amount: amount.toString(),
      currency: data.currency,
      exchangeRate: rate.toString(),
      rateOverridden: Boolean(override),
      baseCurrencyAmount: value.baseCurrencyAmount.toString(),
      overpaidBy: excess.greaterThan(0) ? excess.toString() : null,
      overpaymentReason: excess.greaterThan(0) ? data.overpaymentReason : null,
    },
  });

  revalidatePath("/app/finance/verify");
  revalidatePath("/app/finance/collections", "layout");
  revalidatePath(`/app/finance/invoices/${invoice.id}`);
  if (confirmsOwn) {
    const confirmed = await confirmPayment(actor, payment.id);
    if (confirmed.error) {
      return { error: `${payment.reference} was recorded but not confirmed: ${confirmed.error}` };
    }
    return { ok: confirmed.ok?.replace(/^Verified\./, "Payment recorded.") ?? "Payment recorded." };
  }
  return { ok: `Recorded. Finance will verify it before it counts.` };
}

/**
 * A customer says they have paid.
 *
 * Reaches the same PENDING queue as a staff-recorded payment. The screenshot is
 * kept as evidence and is worth exactly nothing until Finance says otherwise —
 * this is the specific thing §27 exists to prevent.
 */
export async function submitCustomerPayment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const customer = await authorizeCustomer();

  const parsed = paymentSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    amount: formData.get("amount"),
    currency: formData.get("currency") || "TZS",
    method: formData.get("method") || "MOBILE_MONEY",
    transactionRef: formData.get("transactionRef") || undefined,
    payerName: formData.get("payerName") || undefined,
    paidAt: formData.get("paidAt") || undefined,
    accountId: formData.get("accountId") || undefined,
    deliveryAdded: formData.get("deliveryAdded") || undefined,
    deliverySettledFrom: formData.get("deliverySettledFrom") || undefined,
    notes: formData.get("notes") || undefined,
    idempotencyKey: formData.get("idempotencyKey") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  /*
    OWNERSHIP IS CHECKED AGAINST THE SESSION, NOT THE FORM.

    The invoice id arrives in a request body the customer controls. Scoping the
    lookup by their own customerId is the whole defence — changing the number
    finds nothing rather than finding somebody else's bill.
  */
  const invoice = await prisma.invoice.findFirst({
    where: { id: data.invoiceId, customerId: customer.customerId },
    include: { payments: true },
  });
  if (!invoice) return { error: "We cannot find that invoice on your account." };
  if (invoice.status === "DRAFT" || invoice.status === "CANCELLED") {
    return { error: "That invoice is not open for payment." };
  }

  if (data.idempotencyKey) {
    const already = await prisma.payment.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
      select: { customerId: true },
    });
    if (already) return { ok: "Thank you — we already have this payment." };
  }

  const parsedAmount = parseAmount(data.amount, data.currency);
  if ("error" in parsedAmount) return { error: parsedAmount.error };
  const amount = parsedAmount.amount;

  /* The bill's own rate. A customer never chooses what their dollars are worth. */
  const live = await currentExchangeRate();
  const rate = paymentRate(invoice, null, live?.rate);
  if (!rate) return { error: "We cannot take this payment online right now. Please contact us." };
  const value = valuePayment(amount, data.currency, invoice.currency, rate);
  const takeable = stillTakeableTzs(invoice);
  const excess = takeable ? value.baseCurrencyAmount.sub(takeable) : new Prisma.Decimal(0);

  const files = formData
    .getAll("proof")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const proofs: string[] = [];
  try {
    for (const file of files) proofs.push(await store(file, "payments"));
  } catch (error) {
    return {
      error: error instanceof UploadError ? error.message : "That upload failed.",
    };
  }

  const claim = await prisma.$transaction(async (tx) => {
    const reference = await nextPaymentReference(tx);
    const created = await tx.payment.create({
      data: {
        reference,
        invoiceId: invoice.id,
        customerId: customer.customerId,
        amount,
        currency: data.currency,
        exchangeRateId: invoice.fxRate && rate.equals(invoice.fxRate) ? invoice.exchangeRateId : (live?.id ?? null),
        fxRate: rate,
        baseCurrencyAmount: value.baseCurrencyAmount,
        creditedAmount: value.creditedAmount,
        idempotencyKey: data.idempotencyKey || null,
        /* A customer may well have sent more than the bill. It is not refused —
           the money has already moved — but Finance sees it flagged before
           verifying. */
        overpaymentReason: excess.greaterThan(0)
          ? `Customer claims ${formatCurrency(excess, "TZS")} more than the bill owed`
          : null,
        method: data.method,
        transactionRef: data.transactionRef || null,
        payerName: data.payerName || customer.name,
        paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
        notes: data.notes || null,
        submittedByCustomer: true,
        status: "PENDING",
        proofs: { create: proofs.map((url) => ({ url })) },
      },
    });

    await notifyStaff(
      await staffInDepartment("FINANCE", tx),
      {
        kind: "payment.pending",
        title: `Customer payment on ${invoice.number}`,
        body: `${customer.name} says they have paid ${formatCurrency(amount, data.currency)}.`,
        href: "/app/finance/collections/verify",
      },
      tx
    );
    return created;
  });

  /*
    A CLAIM IS NOT MONEY, AND IT IS STILL AN EVENT.

    Every other way a payment enters the system writes a line saying who said
    so and when; this one — the customer's own — wrote none, so a claim that was
    later rejected, or entered twice, or made against the wrong bill had no
    record of having been made at all. It is worth nothing until Finance
    verifies it, which is exactly why the moment it arrived has to be findable.
  */
  await recordAudit({
    actor: customer,
    action: "payment.claim",
    entity: "Payment",
    entityId: claim.id,
    summary: `${claim.reference}: customer says they paid ${formatCurrency(amount, data.currency)} against ${invoice.number}`,
    metadata: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      newValue: amount.toString(),
      currency: data.currency,
      fxRate: rate.toString(),
      method: data.method,
      transactionRef: data.transactionRef || null,
      proofs: proofs.length,
      status: "PENDING",
    },
  });

  revalidatePath("/portal/invoices");
  return {
    ok: "Thank you. We will confirm it once our finance team has checked with the bank.",
  };
}

/**
 * FINANCE SAYS THE MONEY IS REALLY THERE.
 *
 * The only place a payment becomes worth anything. Held by Finance alone —
 * Support can record a claim and both warehouses can see a balance, but neither
 * can make one true.
 *
 * Issues the receipt in the same transaction, because a verified payment with
 * no receipt is a customer who cannot prove they paid.
 */
export async function verifyPayment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("payment.verify");
  return confirmPayment(actor, String(formData.get("paymentId") ?? ""));
}

export async function rejectPayment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("payment.verify");

  const paymentId = String(formData.get("paymentId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "No reason given";

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { invoice: { select: { number: true } } },
  });
  if (!payment) return { error: "That payment no longer exists." };
  if (payment.status !== "PENDING") {
    return { error: `That payment is already ${payment.status.toLowerCase()}.` };
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { status: "REJECTED", rejectedReason: reason, verifiedById: actor.id },
    });

    await notifyCustomer(
      [payment.customerId],
      {
        kind: "payment.rejected",
        title: `We could not confirm a payment on ${payment.invoice.number}`,
        body: reason,
        href: "/portal/invoices",
      },
      tx
    );
  });

  await recordAudit({
    actor,
    action: "payment.reject",
    entity: "Payment",
    entityId: payment.id,
    summary: `Rejected ${payment.reference} — ${reason}`,
  });

  revalidatePath("/app/finance/verify");
  revalidatePath("/app/finance/collections", "layout");
  return { ok: "Rejected." };
}

/**
 * Take back a payment that was verified in error.
 *
 * REVERSED, never deleted. The money was counted once and a receipt was issued
 * saying so; erasing the row would leave that receipt pointing at nothing and
 * the customer holding proof of a payment the system denies.
 */
export async function reversePayment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("payment.verify");

  const paymentId = String(formData.get("paymentId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "No reason given";

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { invoice: { select: { id: true, number: true, cargoId: true } } },
  });
  if (!payment) return { error: "That payment no longer exists." };
  if (payment.status !== "VERIFIED") {
    return { error: "Only a verified payment can be reversed." };
  }

  let withdrawn: { id: string; noteNumber: string } | null;
  try {
  withdrawn = await prisma.$transaction(async (tx) => {
    const taken = await tx.payment.updateMany({
      /* A write-off that rode on this payment goes with it: the shortfall it
         cleared is owed again once the money is taken back. */
      where: { OR: [{ id: payment.id }, { writeOffOfId: payment.id }], status: "VERIFIED" },
      data: { status: "REVERSED", reversedAt: new Date(), reversedReason: reason },
    });
    if (taken.count === 0) throw new Error("That payment has just been reversed.");

    return withdrawPickupNoteIfOwing(
      tx,
      payment.invoice.cargoId,
      `${payment.reference} reversed — ${reason}`
    );
  });
  } catch (error) {
    return { error: formMessage(error, "That payment was not reversed.") };
  }

  await refreshInvoiceStatus(payment.invoiceId);

  if (withdrawn) {
    await recordAudit({
      actor,
      action: "pickupNote.cancel",
      entity: "PickupNote",
      entityId: withdrawn.id,
      summary: `Withdrew ${withdrawn.noteNumber}: ${payment.reference} reversed — ${reason}`,
    });
  }

  await recordAudit({
    actor,
    action: "payment.reverse",
    entity: "Payment",
    entityId: payment.id,
    summary: `Reversed ${payment.reference} on ${payment.invoice.number} — ${reason}`,
  });

  revalidatePath(`/app/finance/invoices/${payment.invoiceId}`);
  revalidatePath("/app/release");
  return { ok: "Reversed. The balance has gone back up." };
}

/**
 * ONE PAYMENT, SEVERAL BILLS.
 *
 * A customer with four consignments on the floor hands over one lot of money.
 * Recording that as four separate payments means four counts of the same
 * notes, and recording it against one invoice means three bills that look
 * unpaid while the money sits in the wrong place.
 *
 * So the desk takes it once and the system spreads it: oldest bill first, in
 * full, until the money runs out. The last bill it reaches may be part-paid,
 * which is the true answer and shows as such. Every bill still gets its own
 * payment row with its own reference — the ledger is not merged, only the act
 * of taking the money — and they carry the same transaction reference so the
 * four rows can be recognised as one handover afterwards.
 *
 * Recorded by Finance, every slice is confirmed at once, each with its own
 * receipt; recorded by Support, they wait for Finance like any other claim.
 */
export async function recordMergedPayment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("payment.submit");
  const confirmsOwn = can(actor.role, "payment.verify");

  const customerId = String(formData.get("customerId") ?? "");
  const invoiceIds = formData
    .getAll("invoiceIds")
    .map(String)
    .filter(Boolean);
  const amountRaw = Number(formData.get("amount") ?? 0);
  const currency = String(formData.get("currency") ?? "USD");
  const method = String(formData.get("method") ?? "BANK_TRANSFER");
  const transactionRef = String(formData.get("transactionRef") ?? "").trim();
  const paidAtRaw = String(formData.get("paidAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const fxOverride = Number(formData.get("fxRate") ?? 0);
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();

  if (!(amountRaw > 0)) return { error: "An amount is required." };
  if (invoiceIds.length === 0) return { error: "Choose which bills this covers." };
  if (idempotencyKey) {
    const already = await prisma.payment.findUnique({
      where: { idempotencyKey },
      select: { reference: true, transactionRef: true },
    });
    if (already) return { ok: `Already recorded as ${already.transactionRef ?? already.reference}.` };
  }
  if (currency !== "USD" && currency !== "TZS") {
    return { error: "That currency is not one we take." };
  }
  if (!(METHODS as readonly string[]).includes(method)) {
    return { error: "That payment method is not one we take." };
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      id: { in: invoiceIds },
      customerId,
      status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
    },
    orderBy: { issuedAt: "asc" },
    include: { payments: true, cargo: { select: { reference: true } } },
  });
  if (invoices.length === 0) {
    return { error: "None of those bills is open for payment." };
  }

  const live = await currentExchangeRate();
  const override = fxOverride > 0 ? new Prisma.Decimal(fxOverride) : null;
  const parsedAmount = parseAmount(formData.get("amount"), currency);
  if ("error" in parsedAmount) return { error: parsedAmount.error };

  const files = formData
    .getAll("proof")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const proofs: string[] = [];
  try {
    for (const file of files) proofs.push(await store(file, "payments"));
  } catch (error) {
    return {
      error: error instanceof UploadError ? error.message : "That upload failed.",
    };
  }

  /*
    Spread in shillings, bill by bill, each at its own pinned rate unless the
    counter agreed one rate for the whole handover. A payment on a bill that
    already has one waiting is spread against what is left after it.
  */
  const priced = override
    ? invoices.map((invoice) => ({ ...invoice, fxRate: override }))
    : invoices;
  const spread = spreadPayment(priced, parsedAmount.amount, currency, live?.rate);
  if ("error" in spread) {
    return { error: `${spread.invoice.number} ${spread.error} to value this payment with.` };
  }
  const { slices, left } = spread;
  const fx = { id: override ? null : (live?.id ?? null), rate: override ?? live?.rate ?? null };

  if (slices.length === 0) {
    return { error: "Those bills are already settled." };
  }
  if (left.greaterThan(0)) {
    return {
      error: `That is ${formatCurrency(left, currency)} more than those bills still owe. Tick another bill, or correct the figure.`,
    };
  }

  const reference = transactionRef || `MERGE-${Date.now().toString(36).toUpperCase()}`;
  const covering = slices.map((s) => s.invoice.number).join(", ");

  const created = await prisma.$transaction(async (tx) => {
    const rows: string[] = [];
    for (const [index, slice] of slices.entries()) {
      const paymentRef = await nextPaymentReference(tx);
      await tx.payment.create({
        data: {
          reference: paymentRef,
          invoiceId: slice.invoice.id,
          customerId,
          amount: slice.amount,
          currency,
          exchangeRateId: override ? null : slice.invoice.exchangeRateId,
          fxRate: slice.rate,
          baseCurrencyAmount: slice.baseCurrencyAmount,
          idempotencyKey: idempotencyKey && index === 0 ? idempotencyKey : null,
          creditedAmount: valuePayment(slice.amount, currency, slice.invoice.currency, slice.rate).creditedAmount,
          method: method as (typeof METHODS)[number],
          transactionRef: reference,
          paidAt: paidAtRaw ? new Date(paidAtRaw) : new Date(),
          notes:
            `${notes ? `${notes} — ` : ""}Part of one payment of ${currency} ${amountRaw} covering ${covering}.`.trim(),
          recordedById: actor.id,
          status: "PENDING",
          /* The proof is attached to the first slice only. It is one screenshot
             of one transfer; copying it onto four rows would have four people
             verifying the same image against four different amounts. */
          proofs:
            index === 0 ? { create: proofs.map((url) => ({ url })) } : undefined,
        },
      });
      rows.push(paymentRef);
    }

    if (!confirmsOwn) await notifyStaff(
      await staffInDepartment("FINANCE", tx),
      {
        kind: "payment.pending",
        title: `One payment to verify across ${slices.length} bill(s)`,
        body: `${currency} ${amountRaw} recorded by ${actor.name}, covering ${covering}.`,
        href: "/app/finance/collections/verify",
      },
      tx
    );

    return rows;
  });

  await recordAudit({
    actor,
    action: "payment.record.merged",
    entity: "Customer",
    entityId: customerId,
    summary: `Took ${currency} ${amountRaw} as one payment across ${slices.length} bill(s): ${covering}`,
    metadata: {
      transactionRef: reference,
      payments: created,
      fxRate: fx.rate?.toString() ?? null,
      rateOverridden: Boolean(override),
      unallocated: left.toString(),
    },
  });

  revalidatePath("/app/finance/verify");
  revalidatePath("/app/finance/collections", "layout");
  revalidatePath("/app/finance/invoices");

  if (confirmsOwn) {
    const rows = await prisma.payment.findMany({
      where: { reference: { in: created } },
      select: { id: true, reference: true },
    });
    const failed: string[] = [];
    for (const row of rows) {
      const confirmed = await confirmPayment(actor, row.id);
      if (confirmed.error) failed.push(`${row.reference}: ${confirmed.error}`);
    }
    if (failed.length > 0) {
      return { error: `Recorded, but not every part was confirmed — ${failed.join("; ")}` };
    }
    return { ok: `Payment recorded across ${slices.length} bill(s), with a receipt for each.` };
  }

  return {
    ok: left.greaterThan(0)
      ? `Recorded across ${slices.length} bill(s). ${currency} ${left} was more than those bills owed and was not applied.`
      : `Recorded across ${slices.length} bill(s). Finance will verify it before it counts.`,
  };
}
