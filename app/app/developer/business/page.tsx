import type { Metadata } from "next";

import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { primeLocale, T } from "@/lib/server-t";

export const metadata: Metadata = { title: "Business" };

const tz = (n: unknown, c = "TZS") => `${c} ${Math.round(Number(n)).toLocaleString("en-US")}`;

function Table({ title, count, head, rows }: { title: string; count: number; head: string[]; rows: (string | number | null)[][] }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <header className="flex items-baseline justify-between border-b px-5 py-3">
        <h2 className="font-semibold">{title}</h2>
        <span className="tnum text-xs text-muted-foreground">{count.toLocaleString("en-US")} in total · latest {rows.length}</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>{head.map((h) => <th key={h} className="px-5 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j} className="whitespace-nowrap px-5 py-2 text-muted-foreground first:font-medium first:text-foreground">{c ?? "—"}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * BUSINESS — THE NUMBERS, WITH NOTHING TO PRESS.
 *
 * Read-only tables of what the business holds. For checking a figure without
 * risking a change; to change anything, work as the person who does.
 */
export default async function BusinessPage() {
  await primeLocale();
  await requirePermission("developer.activity");
  const [customers, cargo, invoices, payments, c1, c2, c3, c4] = await Promise.all([
    prisma.customer.count({ where: { deletedAt: null } }),
    prisma.cargo.count({ where: { deletedAt: null } }),
    prisma.invoice.count(),
    prisma.payment.count(),
    prisma.customer.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 12, select: { code: true, fullName: true, phone: true, createdAt: true } }),
    prisma.cargo.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 12, select: { reference: true, status: true, description: true, createdAt: true, receiver: { select: { fullName: true } } } }),
    prisma.invoice.findMany({ orderBy: { createdAt: "desc" }, take: 12, select: { number: true, status: true, total: true, currency: true, createdAt: true, customer: { select: { fullName: true } } } }),
    prisma.payment.findMany({ orderBy: { createdAt: "desc" }, take: 12, select: { reference: true, status: true, amount: true, currency: true, createdAt: true, customer: { select: { fullName: true } } } }),
  ]);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{T("Business")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{T("Customers, cargo, invoices and payments in read-only tables. Good for checking a number without risking a change.")}</p>
      </header>
      <Table title="Customers" count={customers} head={["Code", "Name", "Phone", "Added"]} rows={c1.map((c) => [c.code, c.fullName, c.phone, formatDate(c.createdAt)])} />
      <Table title="Cargo" count={cargo} head={["Reference", "Customer", "Goods", "Status", "Booked"]} rows={c2.map((c) => [c.reference, c.receiver.fullName, c.description, c.status.replaceAll("_", " ").toLowerCase(), formatDate(c.createdAt)])} />
      <Table title="Invoices" count={invoices} head={["Number", "Customer", "Total", "Status", "Raised"]} rows={c3.map((i) => [i.number, i.customer.fullName, tz(i.total, i.currency), i.status.toLowerCase(), formatDate(i.createdAt)])} />
      <Table title="Payments" count={payments} head={["Reference", "Customer", "Amount", "Status", "Recorded"]} rows={c4.map((p) => [p.reference, p.customer.fullName, tz(p.amount, p.currency), p.status.toLowerCase(), formatDate(p.createdAt)])} />
    </div>
  );
}
