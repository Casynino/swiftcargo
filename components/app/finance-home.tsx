import Link from "next/link";
import {
  ArrowRight,
  Hourglass,
  Clock,
  TrendingDown,
  TrendingUp,
  Wallet,
  TriangleAlert,
} from "lucide-react";

import { AttentionCenter, type AttentionItem } from "@/components/app/attention-center";
import { SectionLabel } from "@/components/app/section-label";
import { Donut, type DonutSlice } from "@/components/charts/donut";
import { loadBooks, sum, twelveMonths, within } from "@/lib/finance-report";
import { outstandingOf } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

import { primeLocale, T } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
const tzs = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "TZS", maximumFractionDigits: 0 }).format(n);
const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const days = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86_400_000);
const ago = (d: Date) => {
  const n = days(d);
  return n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`;
};

/**
 * HOME FOR THE FINANCE DESK.
 *
 * The morning, in the order it is worked: what needs somebody, what each
 * container is making, where the money is right now, how it is shaped, and the
 * cargo standing behind the money that is still owed. Everything is read from
 * the same record as the ledger, the collections list and profit & loss — this
 * page summarises them, it never keeps a figure of its own.
 */
export async function FinanceHome() {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const thisMonth = { from: monthStart, to: new Date(8.64e15) };

  const [books, openBills, drafts, unbilledAtDar, pending, notesOut, cases, recent] = await Promise.all([
    loadBooks(),
    prisma.invoice.findMany({
      where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
      include: {
        payments: true,
        customer: { select: { fullName: true, businessName: true, phone: true } },
        cargo: {
          select: {
            id: true,
            reference: true,
            description: true,
            darReceiving: { select: { receivedAt: true } },
            pickupNote: { select: { status: true } },
            contacts: { take: 1, select: { id: true } },
          },
        },
      },
    }),
    prisma.invoice.findMany({ where: { status: "DRAFT" }, select: { total: true, fxRate: true, currency: true } }),
    prisma.darReceiving.count({ where: { cargo: { invoices: { none: { status: { not: "CANCELLED" } } } } } }),
    prisma.payment.findMany({ where: { status: "PENDING" }, select: { amount: true, currency: true, fxRate: true } }),
    prisma.pickupNote.findMany({
      where: { status: "ACTIVE" },
      select: { amountTzs: true, issuedAt: true, onCredit: true },
    }),
    prisma.exceptionCase.findMany({
      where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
      orderBy: { createdAt: "asc" },
      take: 6,
      select: { id: true, reference: true, title: true, description: true, createdAt: true, priority: true },
    }),
    prisma.payment.findMany({
      where: { status: "VERIFIED", writtenOff: false },
      orderBy: [{ paidAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 6,
      include: {
        receipts: { select: { number: true }, take: 1 },
        account: { select: { bankName: true, kind: true } },
        invoice: { select: { cargo: { select: { id: true, reference: true } } } },
      },
    }),
  ]);

  const today = books.today;
  const inTzs = (amount: number, currency: string, fx: unknown) => {
    const r = Number(fx) > 1 ? Number(fx) : today;
    return currency === "TZS" ? amount : amount * r;
  };

  /* ---------------------------------------------------------- the money now */
  const balances = books.positions.map((p) => ({
    ...p,
    tzs: p.currency === "TZS" ? p.balance : p.balance * today,
  }));
  const cash = balances.reduce((s, p) => s + p.tzs, 0);
  const holding = balances.filter((p) => Math.abs(p.balance) > 0.005);
  const owed = sum(books.bills, (b) => b.owing);
  const billed = sum(books.bills, (b) => b.total);
  const collected = { usd: billed.usd - owed.usd, tzs: billed.tzs - owed.tzs };
  const waitingBilled = drafts.reduce(
    (s, d) => ({ tzs: s.tzs + inTzs(Number(d.total), d.currency, d.fxRate), usd: s.usd + (d.currency === "USD" ? Number(d.total) : today ? Number(d.total) / today : 0) }),
    { tzs: 0, usd: 0 }
  );
  const spentRows = books.costs.filter((c) => c.paid && within(c.at, thisMonth));
  const spent = sum(spentRows, (c) => c.amount);

  /* ------------------------------------------------------ needs attention */
  const pendingTzs = pending.reduce((s, p) => s + inTzs(Number(p.amount), p.currency, p.fxRate), 0);
  const unpaid = openBills
    .map((i) => ({ i, owing: Number(outstandingOf(i)) }))
    .filter((r) => r.owing > 0.005);
  const overdue = unpaid.filter((r) => r.i.dueAt && r.i.dueAt < new Date());
  const untold = unpaid.filter((r) => r.i.cargo.contacts.length === 0);
  const owedTzs = unpaid.reduce((s, r) => s + inTzs(r.owing, r.i.currency, r.i.fxRate), 0);
  const noCosts = books.boxes.filter((c) => (c.status === "ARRIVED" || c.status === "IN_TRANSIT" || c.status === "DEPARTED") && c.spent.usd === 0);
  /* Waiting on Finance: consignments priced from the book but not confirmed
     (a draft bill), plus any counted at Dar with no bill at all. Arrived
     containers counts the same thing, so the two screens agree. */
  const toPrice = drafts.length + unbilledAtDar;

  const items: AttentionItem[] = [
    ...(pending.length ? [{ id: "verify", group: "Collections", count: pending.length, tone: "warn" as const, title: `${pending.length} payment${pending.length === 1 ? "" : "s"} to verify`, detail: "Somebody says money moved and nobody has checked. It counts for nothing until it is verified.", href: "/app/finance/collections/verify", meta: tzs(pendingTzs), metaSub: "waiting on you" }] : []),
    ...(overdue.length ? [{ id: "overdue", group: "Collections", count: overdue.length, tone: "bad" as const, title: `${overdue.length} bill${overdue.length === 1 ? "" : "s"} overdue`, detail: "Past the day they were due and still unpaid.", href: "/app/finance/collections?view=overdue", meta: tzs(overdue.reduce((s, r) => s + inTzs(r.owing, r.i.currency, r.i.fxRate), 0)) }] : []),
    ...(unpaid.length ? [{ id: "unpaid", group: "Collections", count: unpaid.length, tone: "neutral" as const, title: `${unpaid.length} bills unpaid`, detail: "Confirmed and sent to the customer. The money has not arrived.", href: "/app/finance/collections", meta: tzs(owedTzs), metaSub: usd(owed.usd) }] : []),
    ...(untold.length ? [{ id: "untold", group: "Collections", count: untold.length, tone: "warn" as const, title: `${untold.length} customers never contacted`, detail: "A bill the customer has not been shown is not a debt yet.", href: "/app/finance/collections?view=untold", meta: "tell them" }] : []),
    ...(notesOut.length ? [{ id: "notes", group: "Pickup", count: notesOut.length, tone: "neutral" as const, title: `${notesOut.length} cleared, not collected`, detail: "Paid for and released. The cargo is still on our floor waiting for the customer to turn up.", href: "/app/finance/pickup-notes", meta: "already paid for" }] : []),
    ...(toPrice ? [{ id: "price", group: "Containers", count: toPrice, tone: "warn" as const, title: `${toPrice} consignment${toPrice === 1 ? "" : "s"} waiting for prices`, detail: "Counted at Dar with no bill. Nobody can be asked for this money until Finance confirms the price.", href: "/app/containers/arrived?view=pricing", meta: "confirm prices" }] : []),
    ...(noCosts.length ? [{ id: "nocosts", group: "Containers", count: noCosts.length, tone: "warn" as const, title: `${noCosts.length} sailing${noCosts.length === 1 ? "" : "s"} with no costs recorded`, detail: `${noCosts.map((c) => c.reference).join(", ")} — freight and clearing not entered, so the margin reads higher than it is.`, href: "/app/finance/containers", meta: "record costs" }] : []),
    ...cases.map((c) => ({ id: c.id, group: "Cargo", count: 1, tone: (c.priority === "URGENT" || c.priority === "HIGH" ? "bad" : "warn") as "bad" | "warn", title: `$<Tx>{c.title}</Tx> — ${c.reference}`, detail: c.description, href: `/app/exceptions/${c.id}`, meta: `Open for ${days(c.createdAt)} day(s)` })),
  ];

  /* --------------------------------------------------- what each one made */
  const sailings = [...books.boxes]
    .filter((c) => c.departed || c.arrived || c.billed.usd > 0)
    .sort((a, b) => (b.departed ?? b.arrived ?? new Date(0)).getTime() - (a.departed ?? a.arrived ?? new Date(0)).getTime());

  /* ------------------------------------------------------------- in shape */
  const TONES: DonutSlice["tone"][] = [1, 2, 3, 4, 5, 6];
  const slices: DonutSlice[] = holding
    .filter((p) => p.tzs > 0)
    .map((p, i) => ({ label: `${p.bankName} (${p.currency})`, value: Math.round(p.tzs), tone: TONES[i % 6] }));
  const year = new Date().getFullYear();
  const months = twelveMonths(books).filter((_, i, all) => new Date(year, new Date().getMonth() - (all.length - 1 - i), 1).getFullYear() === year);
  const peak = Math.max(1, ...months.map((m) => Math.max(m.in.tzs, m.out.tzs)));
  const netMonth = (months.at(-1)?.in.tzs ?? 0) - (months.at(-1)?.out.tzs ?? 0);

  const open = books.bills.filter((b) => b.owing.usd > 0.005);
  const age = (b: (typeof open)[number]) => days(b.at);
  const bands = [
    { label: "Billed this week", tone: "bg-success", text: "text-success", rows: open.filter((b) => age(b) <= 7) },
    { label: "8–14 days", tone: "bg-brand", text: "text-brand", rows: open.filter((b) => age(b) > 7 && age(b) <= 14) },
    { label: "15–30 days", tone: "bg-warning", text: "text-warning", rows: open.filter((b) => age(b) > 14 && age(b) <= 30) },
    { label: "Over 30 days", tone: "bg-destructive", text: "text-destructive", rows: open.filter((b) => age(b) > 30) },
  ].map((b) => ({ ...b, owed: sum(b.rows, (r) => r.owing).tzs }));
  const oldest = open.length ? Math.max(...open.map(age)) : 0;

  const longest = unpaid
    .filter((r) => r.i.cargo.darReceiving && r.i.cargo.pickupNote?.status !== "USED")
    .map((r) => ({
      id: r.i.cargo.id,
      cargo: r.i.cargo.reference,
      goods: r.i.cargo.description,
      customer: r.i.customer.businessName || r.i.customer.fullName,
      phone: r.i.customer.phone,
      since: r.i.cargo.darReceiving!.receivedAt,
      tzs: inTzs(r.owing, r.i.currency, r.i.fxRate),
      usd: r.i.currency === "USD" ? r.owing : today ? r.owing / today : 0,
    }))
    .sort((a, b) => a.since.getTime() - b.since.getTime())
    .slice(0, 8);

  const card = "flex flex-col rounded-xl border bg-card bg-gradient-to-br to-transparent p-5";

  return (
    <div className="space-y-8">
      <section>
        <SectionLabel count={items.filter((i) => i.tone !== "neutral").length} action={{ href: "/app/finance/collections", label: "The call list" }}>
          {T("Needs your attention")}
        </SectionLabel>
        <AttentionCenter items={items} />
      </section>

      <section>
        <SectionLabel action={{ href: "/app/finance/containers", label: "All containers" }}>{T("Containers · what each one made")}</SectionLabel>
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
            <h3 className="font-semibold">{T("What each container is making")}</h3>
            <p className="text-xs text-muted-foreground">{T("Billed against what it cost. Only Collected is money in the bank.")}</p>
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  {["Container", "Expected revenue", "Collected", "Outstanding", "Expenses", "Expected profit", "Margin"].map((h, i) => (
                    <th key={h} className={cn("px-4 py-2 font-medium", i > 0 && "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {sailings.map((c) => (
                  <tr key={c.id} className="hover:bg-secondary/30">
                    <td className="px-4 py-2.5">
                      <Link href={`/app/finance/containers/${c.id}`} className="tnum font-medium hover:underline">{c.reference}</Link>
                      {c.spent.usd === 0 ? (
                        <span className="ml-2 inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">
                          <TriangleAlert className="size-3" />no costs recorded
                        </span>
                      ) : null}
                    </td>
                    <td className="tnum px-4 py-2.5 text-right">{tzs(c.revenue.tzs)}</td>
                    <td className="tnum px-4 py-2.5 text-right text-success">{tzs(c.collected.tzs)}</td>
                    <td className="tnum px-4 py-2.5 text-right text-destructive">{tzs(c.owed.tzs)}</td>
                    <td className="tnum px-4 py-2.5 text-right text-destructive">{tzs(c.spent.tzs)}</td>
                    <td className={cn("tnum px-4 py-2.5 text-right font-semibold", c.profit.usd < 0 && "text-destructive")}>{tzs(c.profit.tzs)}</td>
                    <td className="tnum px-4 py-2.5 text-right">{c.revenue.usd > 0 ? `${Math.round((c.profit.usd / c.revenue.usd) * 100)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <SectionLabel action={{ href: "/app/finance/accounts", label: "Full position" }}>{T("The money · right now")}</SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { title: "Cash available", icon: Wallet, tone: "text-success", wash: "from-success/[0.08]", lead: cash, usd: today ? cash / today : 0, foot: `${holding.length} of ${balances.length} accounts holding`, note: "Every till and bank account, added up. Comes from the ledger, so it moves the moment money does.", href: "/app/finance/accounts" },
            { title: "Waiting to be billed", icon: Hourglass, tone: "text-warning", wash: "from-warning/[0.08]", lead: waitingBilled.tzs, usd: waitingBilled.usd, foot: `${toPrice} consignment${toPrice === 1 ? "" : "s"} not yet confirmed`, note: "Counted at Dar and priced from the rate book, but nobody has confirmed it, so no customer has been asked for it.", href: "/app/containers/arrived?view=pricing" },
            { title: "Owed by customers", icon: Clock, tone: "text-warning", wash: "from-warning/[0.06]", lead: owed.tzs, usd: owed.usd, foot: `${open.length} bills`, note: "Confirmed, sent, and still unpaid.", href: "/app/finance/collections" },
            { title: "Collected of billed", icon: TrendingUp, tone: "text-brand", wash: "from-brand/[0.08]", lead: collected.tzs, usd: collected.usd, foot: `${billed.usd > 0 ? Math.round((collected.usd / billed.usd) * 100) : 0}% of what was billed`, note: "Money actually in, against everything ever billed. A bill raised is not a bill paid — the gap is what Collections is for.", href: "/app/finance/reports" },
            { title: "Spent this month", icon: TrendingDown, tone: "text-destructive", wash: "from-destructive/[0.08]", lead: spent.tzs, usd: spent.usd, foot: `${spentRows.length} payment${spentRows.length === 1 ? "" : "s"} out`, note: "Freight, clearing, rent, supplies — everything that has actually left an account since the 1st. Money moved between our own accounts is not spending and is not counted.", href: "/app/finance/expenses" },
          ].map((c) => (
            <Link key={c.title} href={c.href} className={cn(card, c.wash, "transition-colors hover:border-foreground/20")}>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground"><Tx>{c.title}</Tx></p>
                <span className={cn("grid size-7 place-items-center rounded-md bg-secondary", c.tone)}><c.icon className="size-4" /></span>
              </div>
              <p className={cn("tnum mt-3 text-2xl font-bold", c.tone)}>{tzs(c.lead)}</p>
              <p className="tnum mt-2 w-fit rounded-md bg-background/60 px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                on the invoice <span className="text-foreground">{usd(c.usd)}</span>
              </p>
              <p className="mt-auto pt-4 text-sm font-medium">{c.foot}</p>
              <p className="mt-0.5 text-xs text-muted-foreground"><Tx>{c.note}</Tx></p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel action={{ href: "/app/finance/ledger", label: "The ledger" }}>{T("The money, in shape")}</SectionLabel>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:[&>*:last-child]:col-span-2 2xl:grid-cols-3 2xl:[&>*:last-child]:col-span-1">
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{T("Where the cash sits")}</h3>
                <p className="text-xs text-muted-foreground">{holding.length} of {balances.length} accounts holding</p>
              </div>
              <Link href="/app/finance/accounts" className="text-xs text-primary hover:underline">{T("All")}</Link>
            </div>
            <div className="mt-4 flex items-center gap-5">
              {slices.length ? <Donut slices={slices} size={120} stroke={18} /> : <div className="size-[120px] rounded-full border-8 border-secondary" />}
              <div>
                <p className="tnum text-2xl font-bold">{Math.round(cash).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{T("TZS in hand")}</p>
              </div>
            </div>
            <ul className="mt-4 space-y-1.5">
              {balances.map((p) => (
                <li key={p.id} className="flex justify-between text-sm">
                  <span className="truncate text-muted-foreground">{p.bankName} ({p.currency})</span>
                  <span className={cn("tnum", p.balance < 0 && "text-destructive")}>
                    {p.currency} {p.balance.toLocaleString("en-US", { maximumFractionDigits: p.currency === "TZS" ? 0 : 2 })}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{T("Money in and out")}</h3>
                <p className="text-xs text-muted-foreground">{T("What arrived against what it cost, this year")}</p>
              </div>
              <p className="text-right">
                <span className={cn("tnum block text-sm font-semibold", netMonth >= 0 ? "text-success" : "text-destructive")}>{netMonth >= 0 ? "+" : ""}{tzs(netMonth)}</span>
                <span className="text-[11px] text-muted-foreground">this month</span>
              </p>
            </div>
            <div className="mt-6 flex h-40 items-end gap-2">
              {months.map((m) => (
                <div key={m.label} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-32 w-full items-end justify-center gap-0.5">
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
              {bands.map((b) => <div key={b.label} className={b.tone} style={{ width: `${owed.tzs ? (b.owed / owed.tzs) * 100 : 0}%` }} />)}
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {bands.map((b) => (
                <li key={b.label} className={cn("grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 sm:gap-3", b.rows.length === 0 && "opacity-50")}>
                  <span className="flex min-w-0 items-center gap-2"><span className={cn("size-2 shrink-0 rounded-full", b.tone)} /><span className="truncate" title={b.label}><Tx>{b.label}</Tx></span></span>
                  <span className="tnum text-xs text-muted-foreground">{b.rows.length} bills</span>
                  <span className={cn("tnum text-xs", b.rows.length && b.text)}>{tzs(b.owed)}</span>
                  <span className="tnum w-9 text-right text-xs text-muted-foreground">{owed.tzs && b.owed ? `${Math.round((b.owed / owed.tzs) * 100)}%` : "—"}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section>
        <SectionLabel>{T("Cargo behind the money")}</SectionLabel>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="overflow-hidden rounded-xl border bg-card">
            <header className="flex items-start justify-between border-b px-5 py-4">
              <div>
                <h3 className="font-semibold">{T("Longest in the warehouse")}</h3>
                <p className="text-xs text-muted-foreground">{T("Oldest arrivals still unpaid — storage is building on every one")}</p>
              </div>
              <Link href="/app/finance/collections?sort=waiting" className="flex items-center gap-1 text-sm text-primary hover:underline">{T("Payment follow-up")} <ArrowRight className="size-3.5" /></Link>
            </header>
            <div className="relative overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 font-medium">{T("Cargo")}</th>
                    <th className="px-4 py-2 font-medium">{T("Customer")}</th>
                    <th className="px-4 py-2 text-right font-medium">{T("Value")}</th>
                    <th className="px-4 py-2 text-right font-medium">{T("Waiting")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {longest.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">{T("Nothing unpaid on the Dar floor.")}</td></tr>
                  ) : longest.map((w) => (
                    <tr key={w.id} className="hover:bg-secondary/30">
                      <td className="px-4 py-2.5"><Link href={`/app/cargo/${w.id}`} className="tnum font-medium hover:underline">{w.cargo}</Link><span className="block max-w-[10rem] truncate text-xs text-muted-foreground">{w.goods}</span></td>
                      <td className="px-4 py-2.5">{w.customer}<span className="tnum block text-xs text-muted-foreground">{w.phone}</span></td>
                      <td className="tnum px-4 py-2.5 text-right font-semibold">{tzs(w.tzs)}<span className="block text-xs font-normal text-muted-foreground">{usd(w.usd)}</span></td>
                      <td className={cn("px-4 py-2.5 text-right text-xs", days(w.since) > 7 ? "text-destructive" : "text-muted-foreground")}>{ago(w.since)}</td>
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
              <Link href="/app/finance/ledger?type=sale" className="flex items-center gap-1 text-sm text-primary hover:underline">{T("All")} <ArrowRight className="size-3.5" /></Link>
            </header>
            <ul className="divide-y">
              {recent.length === 0 ? (
                <li className="px-5 py-6 text-center text-sm text-muted-foreground">{T("No payments verified yet.")}</li>
              ) : recent.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span className="min-w-0">
                    <Link href={`/app/cargo/${p.invoice.cargo.id}`} className="tnum block text-sm font-medium hover:underline">{p.invoice.cargo.reference}</Link>
                    <span className="tnum block truncate text-xs text-muted-foreground">{p.receipts[0]?.number ?? p.reference} · {p.account?.bankName ?? "No account"}</span>
                  </span>
                  <span className="text-right">
                    <span className="tnum block text-sm font-semibold text-success">{p.currency === "USD" ? usd(Number(p.amount)) : tzs(Number(p.amount))}</span>
                    <span className="tnum block text-[11px] text-muted-foreground">{p.creditedAmount ? `settled ${usd(Number(p.creditedAmount))}` : p.account?.kind === "CASH" ? "Cash" : ""}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
