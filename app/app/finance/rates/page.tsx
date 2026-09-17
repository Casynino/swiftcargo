import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowLeftRight,
  Clock,
  History,
  Layers,
  Tags,
  TriangleAlert,
  Users,
} from "lucide-react";

import {
  CustomerRateForm,
  ExchangeRateForm,
  RateForm,
} from "@/components/app/finance-forms";
import { PageHeader } from "@/components/app/page-header";
import {
  CustomerRateActions,
  ExchangeRateRemove,
  RateCardActions,
} from "@/components/app/rate-actions";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Rate book" };

const PER = { PER_CBM: "m³", PER_KG: "kg", FLAT: "flat" } as const;

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const tzs = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "TZS", maximumFractionDigits: 0 }).format(n);

/**
 * THE RATE BOOK — WHAT SWIFT CARGO CHARGES, AND THE RATE IT CHARGES IT AT.
 *
 * One page for everything a bill is priced from: the rate for each kind of
 * goods, the customers who have agreed a different one, and today's dollar to
 * shilling rate. Change a figure here and the next bill follows; a bill
 * already raised never moves, because each one pinned what it used.
 *
 * No tab row. This is not a view of the money — it is the machine that sets
 * every figure the money pages then report, and it is opened on purpose.
 */
export default async function RateBookPage() {
  const user = await requirePermission("rate.view");
  const mayPublish = can(user.role, "rate.manage");
  const mayAgree = can(user.role, "customerRate.manage");
  const maySetFx = can(user.role, "fx.manage");

  const [rates, customerRates, customers, fxHistory, usedTypes, history] = await Promise.all([
    prisma.shippingRate.findMany({ orderBy: [{ active: "desc" }, { effectiveFrom: "desc" }] }),
    prisma.customerRate.findMany({
      where: { active: true },
      orderBy: { effectiveFrom: "desc" },
      include: { customer: { select: { id: true, fullName: true, businessName: true, code: true } } },
    }),
    mayAgree
      ? prisma.customer.findMany({
          where: { deletedAt: null },
          orderBy: { fullName: "asc" },
          take: 400,
          select: { id: true, fullName: true, code: true },
        })
      : [],
    prisma.exchangeRate.findMany({ orderBy: { effectiveFrom: "desc" }, take: 8 }),
    /* Kinds of goods the floor has actually received. One with no live rate is
       cargo that reaches Finance with no price — the fault this page exists to
       prevent. */
    prisma.cargoPackage.groupBy({
      by: ["cargoType"],
      where: { deletedAt: null, cargoType: { not: null } },
      _count: { _all: true },
    }),
    prisma.auditLog.findMany({
      where: {
        action: {
          in: ["rate.publish", "rate.edit", "rate.delete", "customerRate.set", "customerRate.edit", "customerRate.delete", "fx.set", "fx.delete"],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { actor: { select: { name: true } } },
    }),
  ]);

  const fx = fxHistory.find((r) => r.active) ?? fxHistory[0] ?? null;
  const today = fx ? Number(fx.rate) : 0;
  const setters = fxHistory.length
    ? await prisma.user.findMany({
        where: { id: { in: fxHistory.map((r) => r.createdById).filter((x): x is string => !!x) } },
        select: { id: true, name: true },
      })
    : [];
  const setterName = (id: string | null) => setters.find((u) => u.id === id)?.name ?? "—";

  /* The live exchange rate can be withdrawn only while nothing hangs off it. */
  const [fxBills, fxPayments] = fx
    ? await Promise.all([
        prisma.invoice.count({ where: { exchangeRateId: fx.id, status: { not: "DRAFT" } } }),
        prisma.payment.count({ where: { exchangeRateId: fx.id } }),
      ])
    : [0, 0];
  const fxBlockedBy =
    fxBills + fxPayments > 0
      ? `${fxBills} bill${fxBills === 1 ? "" : "s"} and ${fxPayments} payment${fxPayments === 1 ? "" : "s"} already use this rate, so it cannot be withdrawn — publish the correct rate instead.`
      : null;

  const live = rates.filter((r) => r.active).sort((a, b) => Number(b.rate) - Number(a.rate));
  const superseded = rates.filter((r) => !r.active);
  const highest = Math.max(1, ...live.map((r) => Number(r.rate)));
  const general = live.find((r) => !r.cargoType);
  const priced = new Set(live.map((r) => (r.cargoType ?? "").toLowerCase()));
  const unpriced = general
    ? []
    : usedTypes
        .map((t) => t.cargoType!)
        .filter((name) => !priced.has(name.toLowerCase()));
  const lastChange = rates.reduce<Date | null>(
    (d, r) => (!d || r.effectiveFrom > d ? r.effectiveFrom : d),
    null
  );
  const cheapest = live.at(-1);
  const dearest = live[0];
  const typeNames = [...new Set(live.map((r) => r.cargoType).filter((t): t is string => !!t))];
  const allTypes = [...new Set([...typeNames, ...usedTypes.map((t) => t.cargoType!)])];

  const agreedFor = (cargoType: string | null) =>
    customerRates.filter((c) => (c.cargoType ?? null) === cargoType).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rate book"
        description="Every figure Swift Cargo quotes comes from this page — the rate for each kind of goods, customers' agreed rates and today's exchange rate. Change it here and the next bill follows; a bill already raised keeps what it was priced at."
      />

      {!mayPublish ? (
        <p className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You can read the rate book here. Changing it is Finance&rsquo;s, so nothing on this page is editable for you.
        </p>
      ) : null}

      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-5">
        {[
          {
            icon: ArrowLeftRight,
            label: "Exchange rate",
            value: fx ? `1 USD = ${today.toLocaleString()} TZS` : "Not set",
            sub: fx ? `Set ${formatRelative(fx.effectiveFrom)}` : "Every bill needs one",
            tone: fx ? "text-brand" : "text-destructive",
          },
          {
            icon: Layers,
            label: "Cargo types priced",
            value: String(live.filter((r) => r.cargoType).length),
            sub: general ? `plus a general rate of ${usd(Number(general.rate))}` : "no general rate",
            tone: "text-foreground",
          },
          {
            icon: Tags,
            label: "Range per m³",
            value: cheapest && dearest ? `${usd(Number(cheapest.rate))} – ${usd(Number(dearest.rate))}` : "—",
            sub: cheapest && dearest ? `${cheapest.cargoType ?? "General"} to ${dearest.cargoType ?? "General"}` : "No live rates",
            tone: "text-foreground",
          },
          {
            icon: Users,
            label: "Customer rates agreed",
            value: String(customerRates.length),
            sub: customerRates.length ? `${new Set(customerRates.map((c) => c.customerId)).size} customers` : "Everyone pays the book",
            tone: "text-foreground",
          },
          {
            icon: Clock,
            label: "Last price change",
            value: lastChange ? formatRelative(lastChange) : "Never",
            sub: lastChange ? formatDateTime(lastChange) : "No rate published yet",
            tone: "text-foreground",
          },
        ].map((card) => (
          <div key={card.label} className="bg-card p-4">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <card.icon className={cn("size-3.5", card.tone)} />
              {card.label}
            </dt>
            <dd className="tnum mt-1 text-lg font-semibold">{card.value}</dd>
            <p className="mt-0.5 text-xs text-muted-foreground">{card.sub}</p>
          </div>
        ))}
      </dl>

      {unpriced.length > 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="font-medium">
              {unpriced.length} kind{unpriced.length === 1 ? "" : "s"} of goods cannot be priced
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              The floor has received cargo of these types and there is no live rate for them and no general rate to fall back on. They reach Finance with no price until one is published.
            </p>
            <p className="mt-2 flex flex-wrap gap-1.5">
              {unpriced.map((name) => (
                <span key={name} className="rounded-full border border-warning/40 px-3 py-1 text-xs">{name}</span>
              ))}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-xl border bg-card">
            <header className="flex items-end justify-between border-b px-5 py-4">
              <div>
                <h2 className="font-semibold">Rates by kind of goods</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Dearest first. Each line of a bill is charged at the rate for its own goods; the shilling figure is at today&rsquo;s rate.
                </p>
              </div>
              <span className="tnum text-xs text-muted-foreground">{live.length} live</span>
            </header>
            {live.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">No rate is live. Publish one to start pricing cargo.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
                {live.map((r) => {
                  const n = Number(r.rate);
                  const agreed = agreedFor(r.cargoType);
                  return (
                    <li key={r.id} className="bg-card px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{r.cargoType ?? "General rate"}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <Badge tone="neutral">{r.service}</Badge>
                            since {formatDate(r.effectiveFrom)}
                            {r.published ? <Badge tone="progress">public</Badge> : null}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="tnum text-xl font-semibold">
                            {usd(n)}
                            <span className="text-xs font-normal text-muted-foreground"> / {PER[r.basis]}</span>
                          </p>
                          {today && r.currency === "USD" ? (
                            <p className="tnum text-xs text-muted-foreground">{tzs(n * today)}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3 h-1 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${(n / highest) * 100}%` }} />
                      </div>
                      <p className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                        <span>
                          {r.minimumCbm ? `minimum ${Number(r.minimumCbm).toFixed(3)} m³` : r.minimumKg ? `minimum ${Number(r.minimumKg)} kg` : "no minimum"}
                        </span>
                        <span>{agreed ? `${agreed} customer rate${agreed === 1 ? "" : "s"}` : ""}</span>
                      </p>
                      {mayPublish ? (
                        <RateCardActions
                          cargoTypes={allTypes}
                          rate={{
                            id: r.id,
                            service: r.service,
                            cargoType: r.cargoType,
                            basis: r.basis,
                            rate: r.rate.toString(),
                            minimumCbm: r.minimumCbm?.toString() ?? null,
                            minimumKg: r.minimumKg?.toString() ?? null,
                            published: r.published,
                          }}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border bg-card">
            <header className="border-b px-5 py-4">
              <h2 className="font-semibold">Agreed customer rates</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                A customer who pays less than the book. The book rate stays — it is what the discount is measured against, and every bill shows both.
              </p>
            </header>
            {customerRates.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted-foreground">Nobody has an agreed rate. Everyone pays the book.</p>
            ) : (
              <ul className="divide-y">
                {customerRates.map((c) => {
                  const book = live.find((r) => (r.cargoType ?? null) === (c.cargoType ?? null) && r.service === c.service) ?? general;
                  const off = book ? Number(book.rate) - Number(c.rate) : 0;
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/app/customers/${c.customer.id}`} className="font-medium hover:underline">
                          {c.customer.businessName || c.customer.fullName}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {c.cargoType ?? "Every cargo type"} · {c.service} · since {formatDate(c.effectiveFrom)}
                          {c.reason ? ` · ${c.reason}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="tnum font-semibold">{usd(Number(c.rate))} <span className="text-xs font-normal text-muted-foreground">/ {PER[c.basis]}</span></p>
                        {book ? (
                          <p className={cn("tnum text-xs", off > 0 ? "text-success" : off < 0 ? "text-destructive" : "text-muted-foreground")}>
                            book {usd(Number(book.rate))}{off ? ` · ${off > 0 ? "−" : "+"}${usd(Math.abs(off))}` : ""}
                          </p>
                        ) : null}
                      </div>
                      {mayAgree ? (
                        <CustomerRateActions
                          id={c.id}
                          customer={c.customer.businessName || c.customer.fullName}
                          rate={c.rate.toString()}
                          basis={c.basis}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {superseded.length > 0 ? (
            <details className="overflow-hidden rounded-xl border bg-card">
              <summary className="cursor-pointer px-5 py-4 text-sm font-medium">
                Superseded rates <span className="tnum text-muted-foreground">· {superseded.length}</span>
              </summary>
              <ul className="divide-y border-t">
                {superseded.map((r) => (
                  <li key={r.id} className="flex justify-between px-5 py-2.5 text-sm text-muted-foreground">
                    <span>
                      {r.cargoType ?? "General rate"} · {r.service}
                      {r.notes ? <span className="block text-[11px]">{r.notes}</span> : null}
                    </span>
                    <span className="tnum">{usd(Number(r.rate))} / {PER[r.basis]} · from {formatDate(r.effectiveFrom)}{r.effectiveTo ? ` to ${formatDate(r.effectiveTo)}` : ""}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>

        <div className="space-y-6">
          <section id="exchange-rate" className="rounded-xl border bg-card">
            <div className="border-b px-5 py-4">
              <h2 className="font-semibold">Exchange rate</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Applied to every bill raised from now on. Bills already issued keep the rate they were raised at.
              </p>
            </div>
            <div className="p-5">
              {maySetFx ? (
                <div className="space-y-4">
                  <ExchangeRateForm current={fx ? fx.rate.toString() : null} />
                  {fx && fxHistory.length > 1 ? (
                    <div className="border-t pt-3">
                      <ExchangeRateRemove id={fx.id} blockedBy={fxBlockedBy} />
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="tnum text-2xl font-semibold">{fx ? `1 USD = ${today.toLocaleString()} TZS` : "Not set"}</p>
              )}
            </div>
            {fxHistory.length > 1 ? (
              <div className="border-t">
                <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Previous rates</p>
                <ul className="divide-y px-5 pb-4 pt-2">
                  {fxHistory.slice(1).map((r) => (
                    <li key={r.id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                      <span className="tnum">{Number(r.rate).toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground">{setterName(r.createdById)} · {formatRelative(r.effectiveFrom)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {mayPublish ? (
            <section className="rounded-xl border bg-card">
              <div className="border-b px-5 py-4">
                <h2 className="font-semibold">Publish a rate</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Supersedes the live rate for the same goods rather than editing it. Leave the kind of goods blank for the general rate.
                </p>
              </div>
              <div className="p-5">
                <RateForm inline cargoTypes={allTypes} />
              </div>
            </section>
          ) : null}

          {mayAgree ? (
            <section className="rounded-xl border bg-card">
              <div className="border-b px-5 py-4">
                <h2 className="font-semibold">Agree a customer rate</h2>
              </div>
              <div className="p-5">
                <CustomerRateForm
                  inline
                  cargoTypes={typeNames}
                  customers={customers.map((c) => ({ id: c.id, label: `${c.fullName} (${c.code})` }))}
                />
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border bg-card">
            <h2 className="flex items-center gap-2 border-b px-5 py-4 font-semibold">
              <History className="size-4 text-muted-foreground" />
              Change history
            </h2>
            {history.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">Nothing has been changed yet.</p>
            ) : (
              <ul className="divide-y">
                {history.map((h) => (
                  <li key={h.id} className="px-5 py-3">
                    <p className="text-sm">{h.summary}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{h.actor?.name ?? "System"} · {formatRelative(h.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
