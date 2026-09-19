import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { loadBooks, sum, twelveMonths, type Books } from "@/lib/finance-report";
import { outstandingOf, outstandingTzsOf } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

import { primeLocale, T } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
const tzs = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "TZS", maximumFractionDigits: 0 }).format(n);
const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

function ago(d: Date) {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * THE MONEY, IN SHAPE.
 *
 * Four pictures under the overview's numbers: whether money in is keeping up
 * with money out this year, how old the debt is, who has waited longest on the
 * Dar floor, and what was handed over most recently. Each is the same record
 * the ledger and the profit & loss read — nothing here is counted twice.
 */
export async function MoneyInShape({ books: loaded }: { books?: Books } = {}) {
  const [books, waiting, recent] = await Promise.all([
    loaded ?? loadBooks(),
    prisma.invoice.findMany({
      where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
      include: {
        payments: true,
        customer: { select: { fullName: true, businessName: true, phone: true } },
        cargo: {
          select: {
            id: true,
            reference: true,
            darReceiving: { select: { receivedAt: true } },
            pickupNote: { select: { status: true } },
          },
        },
      },
    }),
    prisma.payment.findMany({
      where: { status: "VERIFIED", writtenOff: false },
      /* Postgres puts a missing date first when sorting newest first, which
         made an undated payment read as the latest one. */
      orderBy: [{ paidAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 6,
      include: {
        receipts: { select: { number: true }, take: 1 },
        account: { select: { bankName: true, currency: true, kind: true } },
        invoice: { select: { currency: true, cargo: { select: { id: true, reference: true } } } },
      },
    }),
  ]);

  const today = books.today;
  const year = new Date().getFullYear();
  const months = twelveMonths(books).filter((_, i, all) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - (all.length - 1 - i), 1);
    return d.getFullYear() === year;
  });
  const peak = Math.max(1, ...months.map((m) => Math.max(m.in.tzs, m.out.tzs)));

  /* Aged from the day the bill became real — issued, not the day the cargo
     was received — because that is the day anybody could be asked to pay. */
  const open = books.bills.filter((b) => b.owing.usd > 0.005);
  const age = (b: (typeof open)[number]) => Math.floor((Date.now() - b.at.getTime()) / 86_400_000);
  const bands = [
    { label: "Billed this week", tone: "bg-success", rows: open.filter((b) => age(b) <= 7) },
    { label: "8–14 days", tone: "bg-brand", rows: open.filter((b) => age(b) > 7 && age(b) <= 14) },
    { label: "15–30 days", tone: "bg-warning", rows: open.filter((b) => age(b) > 14 && age(b) <= 30) },
    { label: "Over 30 days", tone: "bg-destructive", rows: open.filter((b) => age(b) > 30) },
  ].map((b) => ({ ...b, owed: sum(b.rows, (r) => r.owing) }));
  const owedAll = sum(open, (b) => b.owing).tzs;
  const oldest = open.length ? Math.max(...open.map(age)) : 0;

  /* On the Dar floor and not paid for: counted in, still owed, not collected. */
  const longest = waiting
    .filter((i) => i.cargo.darReceiving && i.cargo.pickupNote?.status !== "USED")
    .map((i) => {
      const owing = Number(outstandingOf(i));
      const r = Number(i.fxRate) > 1 ? Number(i.fxRate) : today;
      return {
        id: i.cargo.id,
        cargo: i.cargo.reference,
        customer: i.customer.businessName || i.customer.fullName,
        phone: i.customer.phone,
        since: i.cargo.darReceiving!.receivedAt,
        usd: i.currency === "USD" ? owing : r ? owing / r : 0,
        /* The bill's own shillings where it has them, never dollars times
           today's rate again. */
        tzs: outstandingTzsOf(i)?.toNumber() ?? (i.currency === "USD" ? owing * r : owing),
      };
    })
    .filter((w) => w.usd > 0.005)
    .sort((a, b) => a.since.getTime() - b.since.getTime())
    .slice(0, 6);

  const label = "text-[11px] font-semibold uppercase tracking-widest text-muted-foreground";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className={label}>{T("The money, in shape")}</p>
        <Link href="/app/finance/ledger" className="flex items-center gap-1 text-sm text-primary hover:underline">
          {T("General ledger")} <ArrowRight className="size-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold">{T("Money in and out")}</h3>
          <p className="text-xs text-muted-foreground">{T("Cargo money in against costs paid, this year")}</p>
          <div className="mt-4 flex h-36 items-end gap-2">
            {months.map((m) => (
              <div key={m.label} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-28 w-full items-end justify-center gap-0.5">
                  <div className="w-1/2 rounded-t bg-success/80" style={{ height: `${(m.in.tzs / peak) * 100}%` }} title={`In ${tzs(m.in.tzs)}`} />
                  <div className="w-1/2 rounded-t bg-destructive/80" style={{ height: `${(m.out.tzs / peak) * 100}%` }} title={`Out ${tzs(m.out.tzs)}`} />
                </div>
                <span className={cn("text-[10px] uppercase", m.current ? "font-semibold" : "text-muted-foreground")}><Tx>{m.label}</Tx></span>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-success" />{T("Money in")}</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-destructive" />{T("Money out")}</span>
            <span className="ml-auto">{T("One scale")}</span>
          </p>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold">{T("What we are owed, by age")}</h3>
              <p className="text-xs text-muted-foreground">{T("From the day the bill became real")}</p>
            </div>
            <span className="text-xs text-muted-foreground">oldest <span className="font-semibold text-foreground">{oldest}d</span></span>
          </div>
          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-secondary">
            {bands.map((b) => (
              <div key={b.label} className={b.tone} style={{ width: `${owedAll ? (b.owed.tzs / owedAll) * 100 : 0}%` }} />
            ))}
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {bands.map((b) => (
              <li key={b.label} className={cn("grid grid-cols-[1fr_auto_auto_auto] items-center gap-4", b.rows.length === 0 && "text-muted-foreground")}>
                <span className="flex items-center gap-2"><span className={cn("size-2 rounded-full", b.tone)} /><Tx>{b.label}</Tx></span>
                <span className="tnum text-xs text-muted-foreground">{b.rows.length} bills</span>
                <span className="tnum text-xs">{tzs(b.owed.tzs)}</span>
                <span className="tnum w-10 text-right text-xs text-muted-foreground">
                  {owedAll && b.owed.tzs ? `${Math.round((b.owed.tzs / owedAll) * 100)}%` : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border bg-card">
          <header className="flex items-start justify-between border-b px-5 py-4">
            <div>
              <h3 className="font-semibold">{T("Longest waiting")}</h3>
              <p className="text-xs text-muted-foreground">{T("On the Dar floor, oldest first")}</p>
            </div>
            <Link href="/app/finance/collections?sort=waiting" className="text-sm text-primary hover:underline">Payment follow-up →</Link>
          </header>
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{T("Cargo")}</th>
                  <th className="px-4 py-2 font-medium">{T("Customer")}</th>
                  <th className="px-4 py-2 font-medium">{T("Waiting")}</th>
                  <th className="px-4 py-2 text-right font-medium">{T("Worth")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {longest.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">{T("Nothing unpaid on the Dar floor.")}</td></tr>
                ) : longest.map((w) => (
                  <tr key={w.id}>
                    <td className="tnum px-4 py-2.5 text-xs"><Link href={`/app/cargo/${w.id}`} className="hover:underline">{w.cargo}</Link></td>
                    <td className="px-4 py-2.5">{w.customer}<span className="tnum block text-xs text-muted-foreground">{w.phone}</span></td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{ago(w.since)}</td>
                    <td className="tnum px-4 py-2.5 text-right font-semibold">{tzs(w.tzs)}<span className="block text-xs font-normal text-muted-foreground">{usd(w.usd)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border bg-card">
          <header className="flex items-start justify-between border-b px-5 py-4">
            <div>
              <h3 className="font-semibold">{T("Recent payments")}</h3>
              <p className="text-xs text-muted-foreground">{T("What was handed over, and where it landed")}</p>
            </div>
            <Link href="/app/finance/ledger?type=sale" className="text-sm text-primary hover:underline">All payments →</Link>
          </header>
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{T("Receipt")}</th>
                  <th className="px-4 py-2 font-medium">{T("Cargo")}</th>
                  <th className="px-4 py-2 font-medium">{T("Landed in")}</th>
                  <th className="px-4 py-2 text-right font-medium">{T("Taken")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recent.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">{T("No payments verified yet.")}</td></tr>
                ) : recent.map((p) => {
                  const credited = Number(p.creditedAmount ?? 0);
                  return (
                    <tr key={p.id}>
                      <td className="tnum px-4 py-2.5 text-xs text-muted-foreground">{p.receipts[0]?.number ?? p.reference}</td>
                      <td className="tnum px-4 py-2.5 text-xs"><Link href={`/app/cargo/${p.invoice.cargo.id}`} className="hover:underline">{p.invoice.cargo.reference}</Link></td>
                      <td className="px-4 py-2.5 text-xs">{p.account ? p.account.bankName : "No account named"}</td>
                      <td className="tnum px-4 py-2.5 text-right font-semibold">
                        {p.currency === "USD" ? usd(Number(p.amount)) : tzs(Number(p.amount))}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {p.currency === "TZS" && credited ? `settled ${usd(credited)}` : p.account?.kind === "CASH" ? "Cash" : ""}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
