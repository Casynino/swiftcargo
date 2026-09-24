import "server-only";

import { Prisma } from "@prisma/client";

import { accountRegister, type AccountEntry } from "@/lib/accounts";
import { formatCurrency, toBase } from "@/lib/currency";
import { toCorrectable, type CorrectableExpense } from "@/lib/expense-correction";
import type { PriceChange } from "@/components/app/price-changed";
import { t as tr, type Locale } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

/**
 * THE GENERAL LEDGER, ONE ROW PER MOVEMENT OF MONEY.
 *
 * The rows are `accountRegister` — the same list the account cards are added
 * up from — so the register and the balances cannot disagree about what moved.
 * This file only reads back what each movement already carries: whose money it
 * was, which consignments it answered, who took it and who checked it, what was
 * written off with it and what it was worth in shillings on its own day.
 *
 * Nothing is computed here that is not on a record. A figure that is not
 * stored — a dollar cost's shilling value when the cost carries no rate — is
 * read at the rate that was posted on the day the money moved, never today's.
 */

export type LedgerPerson = { id: string; name: string };

export type LedgerFixPayment = {
  kind: "payment";
  paymentIds: string[];
  merged: boolean;
  transactionRef: string | null;
  method: string;
  payerName: string | null;
  payerAccount: string | null;
  payerBank: string | null;
  notes: string | null;
  /** The record as it stands, shown read-only at the top of the correction. */
  summary?: [string, string][];
};

export type LedgerFixExpense = {
  kind: "expense";
  expenseId: string;
  /** What the correction dialog starts from. */
  correction: CorrectableExpense;
};

export type LedgerFixTransfer = { kind: "transfer"; transferId: string };

export type LedgerRow = {
  id: string;
  kind: AccountEntry["kind"];
  /** The fare leaving again, on a payment that carried it. */
  transport: boolean;
  /** Money for cargo already let go on credit — a debt settled, not a sale. */
  credit: boolean;
  at: Date;
  title: string;
  /** The customer's own page, when the money was a customer's. */
  titleHref: string | null;
  purpose: string | null;
  refs: string[];
  writtenOffTzs: number | null;
  type: string;
  /** A cost the business's executives incurred — marked, never hidden. */
  executive: boolean;
  categoryId: string | null;
  accountId: string;
  account: string;
  submittedBy: LedgerPerson | null;
  verifiedBy: LedgerPerson | null;
  /** Everyone named on the row, for the "Anyone" filter. */
  people: string[];
  direction: "IN" | "OUT";
  amount: number;
  currency: string;
  /** The movement in whole shillings, at its own rate. */
  tzs: number;
  proofHref: string | null;
  href: string;
  /** What moved the price on the bill this payment answers, if anything did. */
  priceChange: PriceChange | null;
  cancelled: boolean;
  cancelledReason: string | null;
  search: string;
  fix: LedgerFixPayment | LedgerFixExpense | LedgerFixTransfer | null;
};

type RateRow = { rate: Prisma.Decimal; effectiveFrom: Date };

/** The rate posted on the day, or the first one ever posted for anything older. */
function rateOn(rates: RateRow[], at: Date): Prisma.Decimal | null {
  let chosen: RateRow | null = null;
  for (const r of rates) {
    if (r.effectiveFrom.getTime() <= at.getTime()) chosen = r;
  }
  return (chosen ?? rates[0] ?? null)?.rate ?? null;
}

function shillings(
  amount: Prisma.Decimal.Value,
  currency: string,
  rate: Prisma.Decimal.Value | null
): number {
  if (currency === "TZS") return Number(new Prisma.Decimal(amount).toDecimalPlaces(0));
  if (!rate) return 0;
  return Number(toBase(amount, currency, rate));
}

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  MOBILE_MONEY: "Mobile money",
  CHEQUE: "Cheque",
  OTHER: "Other",
};
export const methodLabel = (m: string) => METHOD_LABEL[m] ?? m;

export async function ledgerRows(locale: Locale = "en"): Promise<LedgerRow[]> {
  const register = await accountRegister();

  const idsOf = (prefix: string) =>
    register.filter((e) => e.id.startsWith(prefix)).map((e) => e.recordId);
  const paymentIds = [...new Set(register.filter((e) => e.kind === "payment").map((e) => e.recordId))];
  const expenseIds = idsOf("e-");
  const accountIds = idsOf("o-");

  const [payments, writeOffs, expenses, transfers, openings, rates] = await Promise.all([
    prisma.payment.findMany({
      where: { id: { in: paymentIds } },
      include: {
        customer: { select: { id: true, fullName: true, phone: true, code: true } },
        invoice: {
          select: {
            id: true,
            number: true,
            currency: true,
            discount: true,
            standardRate: true,
            appliedRate: true,
            storageWaivedAt: true,
            storageWaivedReason: true,
            items: { select: { category: true, description: true, amount: true, quantity: true } },
            cargo: {
              select: {
                id: true,
                reference: true,
                description: true,
                pickupNote: { select: { onCredit: true, issuedAt: true } },
              },
            },
          },
        },
        receipts: { select: { id: true, number: true }, take: 1 },
        recordedBy: { select: { id: true, name: true } },
        verifiedBy: { select: { id: true, name: true } },
        proofs: { select: { url: true }, orderBy: { uploadedAt: "asc" } },
      },
    }),
    /* A write-off rides on the payment it was agreed with, and is only ever
       words on that row: no money moved, so it is never a line of its own. */
    prisma.payment.findMany({
      where: { writtenOff: true, status: "VERIFIED", writeOffOfId: { in: paymentIds } },
      select: { writeOffOfId: true, baseCurrencyAmount: true, amount: true },
    }),
    prisma.containerExpense.findMany({
      where: { id: { in: expenseIds } },
      include: {
        expenseType: { select: { id: true, name: true } },
        vendor: { select: { name: true } },
        container: { select: { id: true, reference: true } },
        recordedBy: { select: { id: true, name: true } },
        account: { select: { bankName: true, currency: true } },
        payrollRun: { select: { id: true } },
      },
    }),
    prisma.accountTransfer.findMany({
      where: { id: { in: idsOf("t-out-") } },
      include: {
        recordedBy: { select: { id: true, name: true } },
        fromAccount: { select: { bankName: true, currency: true } },
        toAccount: { select: { bankName: true, currency: true } },
      },
    }),
    /* Who typed the opening figure is on its field history, not the account. */
    prisma.fieldChange.findMany({
      where: { entity: "BankAccount", field: "openingBalance", entityId: { in: accountIds } },
      orderBy: { createdAt: "desc" },
      select: { entityId: true, actor: { select: { id: true, name: true } } },
    }),
    prisma.exchangeRate.findMany({
      where: { fromCurrency: "USD", toCurrency: "TZS" },
      orderBy: { effectiveFrom: "asc" },
      select: { rate: true, effectiveFrom: true },
    }),
  ]);

  /* Who gave the discount, and when — the ledger's payment for a bill can be
     the only place anybody sees this again once it is verified. */
  const discountedInvoiceIds = [
    ...new Set(
      payments.filter((p) => p.invoice.discount.greaterThan(0)).map((p) => p.invoice.id)
    ),
  ];
  const discountGivenBy = new Map<string, string>();
  if (discountedInvoiceIds.length > 0) {
    const audits = await prisma.auditLog.findMany({
      where: { entity: "Invoice", entityId: { in: discountedInvoiceIds }, action: "invoice.discount" },
      orderBy: { createdAt: "desc" },
      select: { entityId: true, actor: { select: { name: true } } },
    });
    for (const a of audits) {
      if (a.entityId && !discountGivenBy.has(a.entityId)) {
        discountGivenBy.set(a.entityId, a.actor?.name ?? "somebody");
      }
    }
  }

  /*
    STORAGE AS IT STOOD WHEN THE MONEY MOVED.

    Storage is charged onto a bill a day at a time and can be taken off, so the
    bill today says nothing about a payment made last week: a freight payment
    made before the free days ran out did not include storage. Each payment is
    read against the bill's own storage history up to its moment. A bill with
    storage and no history had it put on by hand before the history was kept,
    and is read as it stands.
  */
  type StorageAt = { storage: { amount: number; days: number } | null; removed: { amount: number | null; reason: string; by: string | null } | null };
  const storageInvoiceIds = [...new Set(payments.map((p) => p.invoice.id))];
  const storageHistory = new Map<string, { at: Date; field: string; oldValue: string | null; newValue: string | null; reason: string | null; by: string | null }[]>();
  if (storageInvoiceIds.length > 0) {
    const changes = await prisma.fieldChange.findMany({
      where: { entity: "Invoice", entityId: { in: storageInvoiceIds }, field: { in: ["storage", "storageWaived"] } },
      orderBy: { createdAt: "asc" },
      select: { entityId: true, field: true, oldValue: true, newValue: true, reason: true, createdAt: true, actor: { select: { name: true } } },
    });
    for (const c of changes) {
      const list = storageHistory.get(c.entityId) ?? [];
      list.push({ at: c.createdAt, field: c.field, oldValue: c.oldValue, newValue: c.newValue, reason: c.reason, by: c.actor?.name ?? null });
      storageHistory.set(c.entityId, list);
    }
  }
  const storageAt = (invoice: (typeof payments)[number]["invoice"], at: Date): StorageAt => {
    const history = storageHistory.get(invoice.id);
    if (!history) {
      const lines = invoice.items.filter((i) => i.category === "Storage");
      const amount = lines.reduce((sum, i) => sum + Number(i.amount), 0);
      return {
        storage: amount > 0.005 ? { amount, days: lines.reduce((sum, i) => sum + Number(i.quantity), 0) } : null,
        removed: null,
      };
    }
    const state: StorageAt = { storage: null, removed: null };
    for (const h of history) {
      if (h.at.getTime() > at.getTime()) break;
      if (h.field === "storage") {
        const figure = h.newValue?.match(/^([\d.]+) day\(s\) · \S+ ([\d.]+)/);
        state.storage = figure ? { days: Number(figure[1]), amount: Number(figure[2]) } : null;
        state.removed = null;
      } else if (h.newValue === "Waived") {
        const figure = h.oldValue?.match(/([\d.]+) storage/);
        state.storage = null;
        state.removed = { amount: figure ? Number(figure[1]) : null, reason: h.reason ?? "", by: h.by };
      } else {
        state.removed = null;
      }
    }
    return state;
  };

  /** The price change to show on a payment's own row — the same words the
      verify screen and the collections list use, so a discount never reads
      three different ways depending which screen it is seen from. */
  const priceChangeOf = (invoice: (typeof payments)[number]["invoice"], at: Date): PriceChange => {
    const std = invoice.standardRate ? Number(invoice.standardRate) : null;
    const applied = invoice.appliedRate ? Number(invoice.appliedRate) : null;
    const discount = invoice.discount.greaterThan(0)
      ? {
          amount: Number(invoice.discount),
          reason: [
            invoice.items
              .filter((i) => i.category === "Discount")
              .map((i) => i.description.replace(/^Discount\s*[—-]\s*/, ""))
              .filter(Boolean)
              .join("; "),
            discountGivenBy.get(invoice.id),
          ]
            .filter(Boolean)
            .join(" — "),
        }
      : null;
    const then = storageAt(invoice, at);
    return {
      category: null,
      cbm: null,
      rate: std !== null && applied !== null && Math.abs(std - applied) > 0.005 ? { from: std, to: applied } : null,
      currency: invoice.currency,
      discount,
      storage: then.storage,
      storageRemoved: then.removed,
    };
  };

  const paymentById = new Map(payments.map((p) => [p.id, p]));
  const expenseById = new Map(expenses.map((e) => [e.id, e]));
  const transferById = new Map(transfers.map((t) => [t.id, t]));
  const openedBy = new Map<string, LedgerPerson>();
  for (const f of openings) {
    if (f.actor && !openedBy.has(f.entityId)) openedBy.set(f.entityId, f.actor);
  }
  const writtenOff = new Map<string, number>();
  for (const w of writeOffs) {
    if (!w.writeOffOfId) continue;
    writtenOff.set(
      w.writeOffOfId,
      (writtenOff.get(w.writeOffOfId) ?? 0) + Number(w.baseCurrencyAmount ?? w.amount)
    );
  }

  const rows: LedgerRow[] = [];

  for (const e of register) {
    const base = {
      id: e.id,
      kind: e.kind,
      at: e.at,
      accountId: e.accountId,
      account: e.account,
      direction: e.direction,
      amount: e.amount,
      currency: e.currency,
      cancelled: e.cancelled,
      cancelledReason: e.cancelledReason,
      href: `/app/finance/ledger/${e.id}`,
    };

    if (e.kind === "payment") {
      const p = paymentById.get(e.recordId);
      if (!p) continue;
      const transport = e.id.startsWith("pt-");
      const delivery = Number(p.deliveryAdded ?? 0);
      const rate = p.fxRate ?? rateOn(rates, e.at);
      /* The payment's own shilling value, plus the fare that came in with it —
         both at the rate this payment was taken at. */
      const tzs = transport
        ? shillings(delivery, e.currency, rate)
        : p.baseCurrencyAmount
          ? Number(p.baseCurrencyAmount) + shillings(delivery, p.currency, rate)
          : shillings(Number(p.amount) + delivery, p.currency, rate);
      const submitter: LedgerPerson | null = p.recordedBy
        ? p.recordedBy
        : p.submittedByCustomer
          ? { id: "", name: `${p.customer.fullName} (${tr(locale, "customer")})` }
          : null;
      const note = p.invoice.cargo.pickupNote;
      const credit = Boolean(note?.onCredit && note.issuedAt.getTime() <= e.at.getTime());
      const receipt = p.receipts[0] ?? null;
      rows.push({
        ...base,
        transport,
        credit: credit && !transport,
        priceChange: transport ? null : priceChangeOf(p.invoice, e.at),
        title: p.customer.fullName,
        titleHref: `/app/customers/${p.customer.id}`,
        purpose: p.invoice.cargo.description,
        refs: [receipt?.number ?? p.reference, p.invoice.cargo.reference, p.transactionRef].filter(
          (v): v is string => Boolean(v)
        ),
        writtenOffTzs: transport ? null : (writtenOff.get(p.id) ?? null),
        type: tr(locale, transport ? "Transport paid out" : credit ? "Credit payment" : "Cash sale"),
        executive: false,
        categoryId: null,
        submittedBy: submitter,
        verifiedBy: p.verifiedBy,
        people: [p.recordedBy?.id, p.verifiedBy?.id].filter((v): v is string => Boolean(v)),
        tzs,
        proofHref: p.proofs[0]?.url ?? null,
        search: [
          p.customer.fullName,
          p.customer.phone,
          p.customer.code,
          p.reference,
          receipt?.number,
          p.transactionRef,
          p.payerName,
          p.payerAccount,
          p.notes,
          p.invoice.number,
          p.invoice.cargo.reference,
          p.invoice.cargo.description,
          e.account,
          p.recordedBy?.name,
          p.verifiedBy?.name,
          transport ? "transport" : "",
          p.invoice.discount.greaterThan(0) ? "discount discounted" : "",
          transport ? "" : storageAt(p.invoice, e.at).storage ? "storage" : "",
          transport ? "" : storageAt(p.invoice, e.at).removed ? "storage removed waived" : "",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        fix: {
          kind: "payment",
          paymentIds: [p.id],
          merged: false,
          transactionRef: p.transactionRef,
          method: p.method,
          payerName: p.payerName,
          payerAccount: p.payerAccount,
          payerBank: p.payerBank,
          notes: p.notes,
          summary: [
            ["Payment", p.reference],
            ["Receipt", receipt?.number ?? "—"],
            ["Customer", p.customer.fullName],
            ["Bill", `${p.invoice.number} · ${p.invoice.cargo.reference}`],
            ["Amount", `${p.currency} ${Number(p.amount).toLocaleString("en-US")}`],
            ["Into", e.account ?? "—"],
            ["Paid on", (p.paidAt ?? p.createdAt).toISOString().slice(0, 10)],
            ["Recorded by", p.recordedBy?.name ?? "—"],
            /* Same fact the row itself flags — repeated here because this is
               where a correction is actually decided from. */
            ...(p.invoice.discount.greaterThan(0)
              ? ([["Discounted", `${p.invoice.currency} ${p.invoice.discount} — ${discountGivenBy.get(p.invoice.id) ?? "somebody"}`]] as [string, string][])
              : []),
          ],
        },
      });
      continue;
    }

    if (e.kind === "expense") {
      const x = expenseById.get(e.recordId);
      if (!x) continue;
      const rate = Number(x.fxRate) > 1 ? x.fxRate : rateOn(rates, e.at);
      rows.push({
        ...base,
        transport: false,
        credit: false,
        priceChange: null,
        title: x.description || x.expenseType?.name || x.vendor?.name || tr(locale, "Cost"),
        titleHref: null,
        purpose: x.vendor ? `${tr(locale, "paid to")} ${x.vendor.name}` : null,
        refs: [x.reference, x.referenceNumber, x.container?.reference].filter(
          (v): v is string => Boolean(v)
        ),
        writtenOffTzs: null,
        type: x.expenseType?.name ?? tr(locale, "Uncategorised"),
        executive: x.scope === "EXECUTIVE",
        categoryId: x.expenseType?.id ?? null,
        submittedBy: x.recordedBy,
        verifiedBy: null,
        people: x.recordedBy ? [x.recordedBy.id] : [],
        tzs: shillings(e.amount, e.currency, rate),
        proofHref: x.receiptUrl,
        search: [
          x.reference,
          x.referenceNumber,
          x.description,
          x.vendor?.name,
          x.expenseType?.name,
          x.container?.reference,
          x.notes,
          e.account,
          x.recordedBy?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        fix: {
          kind: "expense",
          expenseId: x.id,
          correction: toCorrectable(x),
        },
      });
      continue;
    }

    if (e.kind === "transfer") {
      const t = transferById.get(e.recordId);
      if (!t) continue;
      const outbound = e.direction === "OUT";
      rows.push({
        ...base,
        transport: false,
        credit: false,
        priceChange: null,
        title: outbound
          ? `${tr(locale, "Out to")} ${t.toAccount.bankName} (${t.toAccount.currency})`
          : `${tr(locale, "In from")} ${t.fromAccount.bankName} (${t.fromAccount.currency})`,
        titleHref: null,
        purpose: [
          t.purpose,
          outbound && Number(t.charge) > 0
            ? `${tr(locale, "includes bank charge")} ${formatCurrency(Number(t.charge), e.currency)}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
        refs: [t.reference],
        writtenOffTzs: null,
        type: tr(locale, outbound ? "Transfer out" : "Transfer in"),
        executive: false,
        categoryId: null,
        submittedBy: t.recordedBy,
        verifiedBy: null,
        people: t.recordedBy ? [t.recordedBy.id] : [],
        tzs: shillings(e.amount, e.currency, rateOn(rates, e.at)),
        proofHref: null,
        search: [t.reference, t.purpose, e.description, e.account, t.recordedBy?.name, "transfer"]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        fix: { kind: "transfer", transferId: t.id },
      });
      continue;
    }

    const by = openedBy.get(e.recordId) ?? null;
    rows.push({
      ...base,
      transport: false,
      credit: false,
      priceChange: null,
      title: `${tr(locale, "Opening balance for")} ${e.account}`,
      titleHref: null,
      purpose: tr(locale, "What was in the account when it was put on the system"),
      refs: [],
      writtenOffTzs: null,
      type: tr(locale, "Opening balance"),
      executive: false,
      categoryId: null,
      submittedBy: by,
      verifiedBy: null,
      people: by ? [by.id] : [],
      tzs: shillings(e.amount, e.currency, rateOn(rates, e.at)),
      proofHref: null,
      search: `${e.detail} ${e.account} opening balance ${by?.name ?? ""}`.toLowerCase(),
      fix: null,
    });
  }

  return mergeSlices(rows, payments);
}

/**
 * ONE HANDOVER, ONE LINE.
 *
 * A combined payment is stored as one payment per bill, sharing a MERGE-
 * reference, so each consignment keeps its own invoice and pickup note. The
 * money reached the account once, though, and a register that lists four
 * lines for one transfer reads as four transfers. So the slices that landed in
 * the same account and stand the same way — all live, or all reversed — are
 * shown as the one movement they were, naming every consignment it answered.
 */
function mergeSlices(
  rows: LedgerRow[],
  payments: { id: string; transactionRef: string | null; invoice: { cargo: { reference: string } } }[]
): LedgerRow[] {
  const refOf = new Map(payments.map((p) => [p.id, p.transactionRef]));
  const groups = new Map<string, LedgerRow>();
  const out: LedgerRow[] = [];

  for (const row of rows) {
    const fix = row.fix?.kind === "payment" ? row.fix : null;
    const ref = fix ? refOf.get(fix.paymentIds[0]) : null;
    if (!fix || !ref || !ref.startsWith("MERGE-")) {
      out.push(row);
      continue;
    }
    const key = `${ref}|${row.transport}|${row.accountId}|${row.cancelled}`;
    const head = groups.get(key);
    if (!head) {
      const copy = { ...row, fix: { ...fix, paymentIds: [...fix.paymentIds] } };
      groups.set(key, copy);
      out.push(copy);
      continue;
    }
    const headFix = head.fix as LedgerFixPayment;
    headFix.paymentIds.push(...fix.paymentIds);
    headFix.merged = true;
    head.amount = Math.round((head.amount + row.amount) * 100) / 100;
    head.tzs += row.tzs;
    if (row.writtenOffTzs) head.writtenOffTzs = (head.writtenOffTzs ?? 0) + row.writtenOffTzs;
    head.proofHref = head.proofHref ?? row.proofHref;
    head.refs = [...new Set([...head.refs, ...row.refs])];
    if (row.purpose && head.purpose !== row.purpose && !(head.purpose ?? "").includes(row.purpose)) {
      head.purpose = head.purpose ? `${head.purpose}; ${row.purpose}` : row.purpose;
    }
    head.people = [...new Set([...head.people, ...row.people])];
    head.search = `${head.search} ${row.search}`;
    if (row.at < head.at) head.at = row.at;
  }

  /* Receipt numbers first, then consignments, then the shared reference, so
     the codes read in the order somebody holding the paper looks for them. */
  for (const head of groups.values()) {
    const rank = (r: string) => (r.startsWith("RCT-") || r.startsWith("PAY-") ? 0 : r.startsWith("MERGE-") ? 2 : 1);
    head.refs.sort((a, b) => rank(a) - rank(b));
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}
