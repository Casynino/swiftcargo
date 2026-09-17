import "server-only";

import { normaliseCode } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import type { Role } from "@prisma/client";

/**
 * ONE BOX THAT FINDS ANYTHING.
 *
 * A clerk on the phone has one string in front of them and does not know what
 * kind of thing it is — a mark on a box, a number off a receipt, a phone number
 * the customer just read out. Making them pick the right screen first is the
 * friction this exists to remove.
 *
 * Every result carries what kind of record it is, so the list is readable when
 * one query matches three different kinds of thing.
 */

export type SearchHit = {
  kind:
    | "Customer"
    | "Cargo"
    | "Container"
    | "Shipment"
    | "Invoice"
    | "Payment"
    | "Receipt"
    | "Release"
    | "Case";
  title: string;
  subtitle: string;
  href: string;
};

export async function globalSearch(raw: string, role: Role): Promise<SearchHit[]> {
  const query = raw.trim();
  if (query.length < 2) return [];

  /* A bill, a payment and a receipt are money, and their result line carries
     the amount. Both warehouses hold search.global and neither holds
     finance.view, so for them those three are not searched at all — typing a
     receipt number off a customer's phone must not read out the figure. */
  const money = can(role, "finance.view");

  const code = normaliseCode(query);
  const like = { contains: query, mode: "insensitive" as const };
  const codeLike = { contains: code, mode: "insensitive" as const };
  const digits = query.replace(/[^\d]/g, "");

  const [customers, cargo, containers, invoices, payments, receipts, cases] =
    await Promise.all([
      prisma.customer.findMany({
        where: {
          deletedAt: null,
          OR: [
            { fullName: like },
            { businessName: like },
            { code: codeLike },
            { shippingMark: codeLike },
            ...(digits.length >= 4
              ? [{ phone: { contains: digits } }, { altPhone: { contains: digits } }]
              : []),
          ],
        },
        take: 6,
        select: { id: true, code: true, fullName: true, phone: true, shippingMark: true },
      }),
      prisma.cargo.findMany({
        where: {
          deletedAt: null,
          OR: [
            { reference: codeLike },
            { shippingMark: codeLike },
            { supplierRef: like },
            { description: like },
          ],
        },
        take: 8,
        select: {
          id: true,
          reference: true,
          description: true,
          status: true,
          sender: { select: { fullName: true } },
        },
      }),
      prisma.container.findMany({
        where: {
          deletedAt: null,
          OR: [
            { reference: codeLike },
            { containerNumber: codeLike },
            { sealNumber: codeLike },
          ],
        },
        take: 5,
        select: { id: true, reference: true, containerNumber: true, status: true },
      }),
      prisma.invoice.findMany({
        where: money ? { number: codeLike } : { id: { in: [] } },
        take: 5,
        select: {
          id: true,
          number: true,
          total: true,
          currency: true,
          customer: { select: { fullName: true } },
        },
      }),
      prisma.payment.findMany({
        where: money
          ? { OR: [{ reference: codeLike }, { transactionRef: like }] }
          : { id: { in: [] } },
        take: 5,
        select: {
          id: true,
          reference: true,
          amount: true,
          currency: true,
          invoiceId: true,
          customer: { select: { fullName: true } },
        },
      }),
      prisma.receipt.findMany({
        where: money ? { number: codeLike } : { id: { in: [] } },
        take: 5,
        select: {
          id: true,
          number: true,
          amount: true,
          currency: true,
          customer: { select: { fullName: true } },
        },
      }),
      prisma.exceptionCase.findMany({
        where: { OR: [{ reference: codeLike }, { title: like }] },
        take: 5,
        select: { id: true, reference: true, title: true, status: true },
      }),
    ]);

  return [
    ...cargo.map((c) => ({
      kind: "Cargo" as const,
      title: c.reference,
      subtitle: `${c.sender.fullName} · ${c.description} · ${c.status.replace(/_/g, " ").toLowerCase()}`,
      href: `/app/cargo/${c.id}`,
    })),
    ...customers.map((c) => ({
      kind: "Customer" as const,
      title: c.fullName,
      subtitle: `${c.code} · ${c.phone}${c.shippingMark ? ` · ${c.shippingMark}` : ""}`,
      href: `/app/customers/${c.id}`,
    })),
    ...containers.map((c) => ({
      kind: "Container" as const,
      title: c.containerNumber ?? c.reference,
      subtitle: `${c.reference} · ${c.status.toLowerCase()}`,
      href: `/app/containers/${c.id}`,
    })),
    ...invoices.map((i) => ({
      kind: "Invoice" as const,
      title: i.number,
      subtitle: `${i.customer.fullName} · ${i.currency} ${i.total}`,
      href: `/app/finance/invoices/${i.id}`,
    })),
    ...payments.map((p) => ({
      kind: "Payment" as const,
      title: p.reference,
      subtitle: `${p.customer.fullName} · ${p.currency} ${p.amount}`,
      href: `/app/finance/invoices/${p.invoiceId}`,
    })),
    ...receipts.map((r) => ({
      kind: "Receipt" as const,
      title: r.number,
      subtitle: `${r.customer.fullName} · ${r.currency} ${r.amount}`,
      href: `/app/finance/receipts/${r.id}`,
    })),
    ...cases.map((c) => ({
      kind: "Case" as const,
      title: c.reference,
      subtitle: `${c.title} · ${c.status.replace(/_/g, " ").toLowerCase()}`,
      href: `/app/exceptions/${c.id}`,
    })),
  ];
}
