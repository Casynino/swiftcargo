"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { formatCurrency } from "@/lib/currency";
import { balanceOf, owedAcross } from "@/lib/invoice-balance";
import { notifyStaff, staffInDepartment } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";

export type CreditRequestState = { error?: string; ok?: string };

export type CreditCandidate = {
  invoiceId: string;
  invoiceNumber: string;
  cargoId: string;
  cargoReference: string;
  customerName: string;
  phone: string;
  goods: string;
  container: string | null;
  /** This bill, shillings first. */
  owedLabel: string;
  /** The dollars the bill was priced in, when it was. */
  owedUsdLabel: string | null;
  /**
   * The whole consignment. A release on credit lets every box on the cargo go,
   * so the figure Finance agrees to is what all its bills still owe together.
   */
  cargoOwedLabel: string;
  /** Somebody has already asked and Finance has not released it yet. */
  alreadyAsked: boolean;
};

const TERMS = [7, 14, 30, 60];
const OPEN = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] as const;

/**
 * THE BILLS A CREDIT QUESTION COULD BE ABOUT.
 *
 * The question arrives on the phone with a name and nothing else, so the dialog
 * opens holding every candidate and the search narrows it. A candidate is a bill
 * still owed on cargo that has no live pickup note — once a note is out, the
 * cargo is already free to go and there is nothing left to ask for.
 */
export async function creditCandidates(query: string): Promise<CreditCandidate[]> {
  await authorize("payment.submit");
  const q = query.trim();

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: [...OPEN] },
      cargo: {
        deletedAt: null,
        OR: [{ pickupNote: null }, { pickupNote: { status: { not: "ACTIVE" } } }],
      },
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" as const } },
              { cargo: { reference: { contains: q, mode: "insensitive" as const } } },
              {
                customer: {
                  OR: [
                    { fullName: { contains: q, mode: "insensitive" as const } },
                    { businessName: { contains: q, mode: "insensitive" as const } },
                    { phone: { contains: q } },
                  ],
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { issuedAt: "desc" },
    take: 120,
    include: {
      payments: true,
      customer: { select: { fullName: true, businessName: true, phone: true } },
      cargo: {
        select: {
          id: true,
          reference: true,
          description: true,
          pickupNote: { select: { issuedAt: true } },
          invoices: {
            where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
            include: { payments: true },
          },
          containerLines: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: { container: { select: { reference: true } } },
          },
        },
      },
    },
  });

  const open = invoices
    .map((i) => ({ i, balance: balanceOf(i) }))
    .filter(({ balance }) => !balance.settled)
    .slice(0, 40);

  const asked = await pendingAsks(
    open.map(({ i }) => ({ invoiceId: i.id, since: i.cargo.pickupNote?.issuedAt ?? null }))
  );

  return open.map(({ i, balance }) => ({
    invoiceId: i.id,
    invoiceNumber: i.number,
    cargoId: i.cargo.id,
    cargoReference: i.cargo.reference,
    customerName: i.customer.businessName || i.customer.fullName,
    phone: i.customer.phone,
    goods: i.cargo.description ?? "",
    container: i.cargo.containerLines[0]?.container.reference ?? null,
    owedLabel: balance.outstandingTzs
      ? formatCurrency(balance.outstandingTzs, "TZS")
      : formatCurrency(balance.outstanding, i.currency),
    owedUsdLabel:
      i.currency === "USD" && balance.outstandingTzs
        ? formatCurrency(balance.outstanding, "USD")
        : null,
    cargoOwedLabel: owedAcross(i.cargo.invoices).primary,
    alreadyAsked: asked.has(i.id),
  }));
}

/**
 * Which of these bills already has a question waiting.
 *
 * A request counts only if it was made after the cargo's last pickup note: a
 * note written since is Finance's answer, and a request older than that has
 * been dealt with even when the note was later withdrawn.
 */
async function pendingAsks(
  bills: { invoiceId: string; since: Date | null }[]
): Promise<Set<string>> {
  if (bills.length === 0) return new Set();
  const rows = await prisma.auditLog.findMany({
    where: {
      action: "credit.request",
      entity: "Invoice",
      entityId: { in: bills.map((b) => b.invoiceId) },
    },
    select: { entityId: true, createdAt: true },
  });
  const since = new Map(bills.map((b) => [b.invoiceId, b.since]));
  return new Set(
    rows
      .filter((r) => {
        const cutoff = since.get(r.entityId ?? "");
        return !cutoff || r.createdAt > cutoff;
      })
      .map((r) => r.entityId ?? "")
  );
}

/**
 * "THEY WANT TO TAKE IT NOW AND PAY LATER."
 *
 * Support hears it; Finance decides it. Asking commits nothing — no note is
 * written, the cargo does not move and the bill does not change. The terms and
 * the reason are chosen here so Finance is answering a specific question rather
 * than being handed a blank authority to invent both.
 *
 * The request is the audit line and the notifications, written together: a
 * question Finance was told about and no record of it, or a record nobody was
 * told about, would each be a customer left standing at the counter.
 */
export async function requestCredit(
  _prev: CreditRequestState,
  formData: FormData
): Promise<CreditRequestState> {
  const actor = await authorize("payment.submit");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const days = Number(formData.get("creditDays") ?? 0);
  const reason = String(formData.get("creditReason") ?? "").trim();

  if (!TERMS.includes(days)) return { error: "Pick the terms they are asking for." };

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      payments: true,
      customer: { select: { fullName: true, businessName: true } },
      cargo: {
        select: {
          id: true,
          reference: true,
          deletedAt: true,
          pickupNote: { select: { status: true, issuedAt: true, noteNumber: true } },
        },
      },
    },
  });
  if (!invoice || invoice.cargo.deletedAt) return { error: "That bill no longer exists." };
  if (!(OPEN as readonly string[]).includes(invoice.status)) {
    return { error: "That bill is not open, so there is nothing to put on credit." };
  }
  if (invoice.cargo.pickupNote?.status === "ACTIVE") {
    return {
      error: `${invoice.cargo.reference} already has ${invoice.cargo.pickupNote.noteNumber} out — it is free to collect.`,
    };
  }

  const balance = balanceOf(invoice);
  if (balance.settled) return { error: "That bill is already paid." };

  const already = await pendingAsks([
    { invoiceId: invoice.id, since: invoice.cargo.pickupNote?.issuedAt ?? null },
  ]);
  if (already.size > 0) {
    return { error: "Credit has already been asked for on this bill. Finance has it." };
  }

  const customer = invoice.customer.businessName || invoice.customer.fullName;
  const owed = balance.outstandingTzs
    ? formatCurrency(balance.outstandingTzs, "TZS")
    : formatCurrency(balance.outstanding, invoice.currency);

  await prisma.$transaction(async (tx) => {
    const finance = await staffInDepartment("FINANCE", tx);
    await notifyStaff(
      finance.filter((id) => id !== actor.id),
      {
        kind: "credit.request",
        title: `${customer} asks for ${days} days' credit`,
        body: `${invoice.cargo.reference} · ${invoice.number} · ${owed} owed. ${actor.name}: ${reason}`,
        href: "/app/finance/credit",
      },
      tx
    );
    await recordAudit(
      {
        actor,
        action: "credit.request",
        entity: "Invoice",
        entityId: invoice.id,
        summary: `Asked Finance for ${days} days' credit on ${invoice.number} (${invoice.cargo.reference}) — ${customer} owes ${owed}: ${reason}`,
        metadata: {
          invoiceId: invoice.id,
          cargoId: invoice.cargo.id,
          days,
          reason,
        },
      },
      tx
    );
  });

  revalidatePath("/app/finance/credit");
  return { ok: `Sent to Finance. ${invoice.cargo.reference} stays where it is until they release it.` };
}
