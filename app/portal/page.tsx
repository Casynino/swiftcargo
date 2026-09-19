import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Banknote,
  Calculator,
  CalendarPlus,
  CheckCircle2,
  FileText,
  MapPin,
  MessageCircle,
  Package,
  PackageCheck,
  Search,
  Ship,
  Truck,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import { CopyField } from "@/components/app/copy-field";
import { SupplierAddressCard } from "@/components/app/supplier-address-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ROUTE } from "@/lib/constants";
import { formatCbm, formatDate, formatRelative } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { formatTzPhone } from "@/lib/phone";
import { mine, portalActivity, portalShipments, portalSummary } from "@/lib/portal";
import { prisma } from "@/lib/prisma";
import { publicSailings } from "@/lib/sailing-schedule";
import { requireCustomer } from "@/lib/session";
import { WHATSAPP_OPENER, whatsappLink } from "@/lib/site-contact";
import { supplierAddress } from "@/lib/supplier-address";
import { JOURNEY_INCLUDE, journeyOf } from "@/lib/tracking";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My dashboard" };

/**
 * THE CUSTOMER'S CONTROL CENTRE.
 *
 * Read top to bottom it answers, in order: what I have, where it is, what I
 * owe, what I can do next, what has happened. Every figure is counted from the
 * customer's own records by the session's customerId — nothing on this page
 * reads an id from the request, so there is nothing to change in an address
 * bar that could show somebody else's goods.
 */
export default async function PortalPage() {
  const locale = DEFAULT_LOCALE;
  const user = await requireCustomer();

  const [customer, summary, recent, shipments, activity, sailings, company] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: user.customerId },
      select: { code: true, phone: true, shippingMark: true },
    }),
    portalSummary(user.customerId),
    prisma.cargo.findMany({
      where: {
        ...mine(user.customerId),
        status: { notIn: ["COLLECTED", "DELIVERED", "CANCELLED"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 4,
      include: {
        ...JOURNEY_INCLUDE,
        chinaReceiving: { select: { packagesCount: true, cbm: true } },
      },
    }),
    portalShipments(user.customerId),
    portalActivity(user.customerId, 6),
    publicSailings({ count: 3 }),
    prisma.companySetting.findUnique({
      where: { id: "singleton" },
      select: { chinaAddress: true, whatsapp: true, phone: true },
    }),
  ]);

  const forSupplier = await supplierAddress(customer?.shippingMark ?? null);
  const whatsapp = whatsappLink(company?.whatsapp ?? company?.phone, WHATSAPP_OPENER);

  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Dar_es_Salaam",
      hour: "2-digit",
      hour12: false,
    }).format(new Date())
  );
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  /* The box that matters most right now: one still moving, else one loading. */
  const current =
    shipments.find((s) => !s.arrivedAt && s.departedAt) ??
    shipments.find((s) => !s.arrivedAt) ??
    null;

  const now = new Date();

  return (
    <div className="space-y-8">
      {/* Who, and the way to a person. */}
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b2742] via-[#0e3a5f] to-[#1d6fa3] p-5 text-white shadow-raised sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-48 rounded-full bg-white/10 blur-2xl" />
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
          {ROUTE.originCity} → {ROUTE.destinationCity}
        </p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">
          {t(locale, greeting)}, {user.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-white/80">
          {t(locale, "Here is everything happening with your cargo.")}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          {customer?.code ? (
            <span className="tnum rounded-full bg-white/15 px-2.5 py-1 font-semibold">
              {t(locale, "Customer")} {customer.code}
            </span>
          ) : null}
          {customer?.phone ? (
            <span className="tnum rounded-full bg-white/15 px-2.5 py-1">
              {formatTzPhone(customer.phone)}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/25 px-2.5 py-1 font-medium">
            <CheckCircle2 className="size-3.5" />
            {t(locale, "Account active")}
          </span>
          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-semibold text-brand transition-transform hover:-translate-y-0.5 sm:ml-auto"
            >
              <MessageCircle className="size-3.5" />
              {t(locale, "WhatsApp us")}
            </a>
          ) : null}
        </div>
      </header>

      {/* What I have, where it is, what I owe. */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat icon={Package} label="Active cargo" value={summary.active} href="/portal/cargo" />
        <Stat icon={Warehouse} label="In China" value={summary.inChina} href="/portal/cargo?stage=china" />
        <Stat icon={Ship} label="At sea" value={summary.atSea} href="/portal/cargo?stage=sea" tone="brand" />
        <Stat icon={PackageCheck} label="Arrived in Dar" value={summary.arrived} href="/portal/cargo?stage=arrived" />
        <Stat
          icon={Truck}
          label="Ready for pickup"
          value={summary.ready}
          href="/portal/cargo?stage=ready"
          tone={summary.ready > 0 ? "success" : undefined}
        />
        <Stat
          icon={Banknote}
          label="Outstanding"
          value={summary.owed.owes ? summary.owed.primary : "Nothing"}
          sub={summary.owed.equivalent ?? undefined}
          href="/portal/invoices"
          tone={summary.owed.owes ? "warning" : "success"}
        />
      </section>

      {/* What I can do next. */}
      <section>
        <Heading>{t(locale, "Quick actions")}</Heading>
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
          <Action href="/portal/cargo" icon={Search} label="Track cargo" />
          <Action href="/portal/calculator" icon={Calculator} label="Calculate shipping" />
          <Action href="/portal/book?service=pickup" icon={Truck} label="Book pickup" />
          <Action href="/portal/book" icon={CalendarPlus} label="Book shipment" />
          <Action href="/portal/invoices" icon={FileText} label="View invoices" />
          <Action href="/portal/messages" icon={MessageCircle} label="Request support" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <Heading action={{ href: "/portal/cargo", label: "All my cargo" }}>
            {t(locale, "My cargo")}
          </Heading>
          {recent.length === 0 ? (
            <Card className="p-6 text-center">
              <Package className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-semibold">
                {summary.total > 0 ? t(locale, "Nothing on the way right now") : t(locale, "No cargo yet")}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                {t(locale, "Send your first shipment to Swift Cargo and track everything from here.")}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button asChild size="sm">
                  <Link href="/portal/book">{t(locale, "Book cargo")}</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/portal/calculator">{t(locale, "Calculate shipping")}</Link>
                </Button>
              </div>
            </Card>
          ) : (
            <ul className="grid grid-cols-1 gap-3 [&>li]:min-w-0">
              {recent.map((item) => {
                const journey = journeyOf(item, now);
                const container = item.containerLines.at(-1)?.container;
                return (
                  <li key={item.id}>
                    <Link
                      href={`/portal/cargo/${encodeURIComponent(item.reference)}`}
                      className="focus-ring block rounded-xl"
                    >
                      <Card className="p-4 transition-all hover:-translate-y-0.5 hover:shadow-raised">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="tnum font-semibold">{item.reference}</p>
                            <p className="truncate text-sm text-muted-foreground">{item.description}</p>
                          </div>
                          <Badge tone={journey.tone}>{t(locale, journey.headline)}</Badge>
                        </div>
                        <dl className="mt-3 grid grid-cols-3 gap-3 border-t pt-3 text-xs">
                          <Fact label="Volume" value={item.chinaReceiving ? formatCbm(item.chinaReceiving.cbm) : "—"} />
                          <Fact label="Container" value={container?.reference ?? "Not yet loaded"} />
                          <Fact
                            label={journey.eta ? "Expected" : "Updated"}
                            value={journey.eta ? formatDate(journey.eta) : formatRelative(item.updatedAt)}
                          />
                        </dl>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="min-w-0 space-y-6">
          <section>
            <Heading action={shipments.length ? { href: "/portal/shipments", label: "All shipments" } : undefined}>
              {t(locale, "Current shipment")}
            </Heading>
            {current ? (
              <Card className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="tnum font-semibold">{current.container.reference}</p>
                  <Badge tone={current.departedAt ? "progress" : "neutral"}>
                    {t(locale, current.departedAt ? "At sea" : "Loading in Guangzhou")}
                  </Badge>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <Fact label="Left China" value={current.departedAt ? formatDate(current.departedAt) : "Not yet"} />
                  <Fact label="Expected in Dar" value={current.eta ? formatDate(current.eta) : "To be confirmed"} />
                  <Fact label="Your cargo in it" value={`${current.cargo.length}`} />
                  <Fact label="Your volume" value={formatCbm(current.cbm)} />
                </dl>
              </Card>
            ) : (
              <Card className="p-4 text-sm text-muted-foreground">
                {t(locale, "None of your cargo is in a container at the moment.")}
              </Card>
            )}
          </section>

          <section>
            <Heading action={{ href: "/portal/invoices", label: "Invoices" }}>{t(locale, "Payments")}</Heading>
            <Card className="p-4">
              {summary.owed.owes ? (
                <>
                  <p className="text-xs text-muted-foreground">{t(locale, "Outstanding")}</p>
                  <p className="tnum mt-0.5 text-2xl font-bold text-warning">{summary.owed.primary}</p>
                  {summary.owed.equivalent ? (
                    <p className="tnum text-xs text-muted-foreground">{summary.owed.equivalent}</p>
                  ) : null}
                  <Button asChild size="sm" className="mt-3 w-full">
                    <Link href="/portal/invoices">{t(locale, "View and pay")}</Link>
                  </Button>
                </>
              ) : (
                <p className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 shrink-0 text-success" />
                  {summary.invoiceCount > 0
                    ? t(locale, "All your invoices are paid.")
                    : t(locale, "No invoices yet. They appear here once we confirm your charges.")}
                </p>
              )}
            </Card>
          </section>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="min-w-0">
          <Heading action={{ href: "/portal/notifications", label: "Notifications" }}>
            {t(locale, "Recent activity")}
          </Heading>
          <Card className="p-2">
            {activity.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                {t(locale, "Nothing has happened on your account yet.")}
              </p>
            ) : (
              <ol className="divide-y">
                {activity.map((item, i) => (
                  <li key={i}>
                    <Link
                      href={item.href ?? "/portal"}
                      className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-secondary/60"
                    >
                      <span
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          item.kind === "money" ? "bg-success" : "bg-brand"
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">{item.text}</span>
                        <span className="text-xs text-muted-foreground">{formatRelative(item.at)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </section>

        <section className="min-w-0">
          <Heading action={{ href: "/schedule", label: "Full schedule" }}>
            {t(locale, "Upcoming sailings")}
          </Heading>
          <Card className="divide-y">
            {sailings.map((sailing, i) => (
              <div key={sailing.departureDate.toISOString()} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">
                    {i === 0 ? t(locale, "Next sailing") : `${t(locale, "Sails")} ${formatDate(sailing.departureDate)}`}
                  </p>
                  {sailing.bookingOpen ? (
                    <Link
                      href={`/portal/book?sailing=${sailing.departureDate.toISOString().slice(0, 10)}`}
                      className="text-xs font-semibold text-brand hover:underline"
                    >
                      {t(locale, "Book")}
                    </Link>
                  ) : null}
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <Fact label="Last cargo in" value={formatDate(sailing.cargoDeadline)} strong />
                  <Fact label="Departs" value={formatDate(sailing.departureDate)} />
                  <Fact label="Arrives about" value={formatDate(sailing.estimatedArrival)} />
                </dl>
              </div>
            ))}
          </Card>
        </section>
      </div>

      {/* For a customer about to buy: where the supplier sends the goods. */}
      <section>
        <Heading>{t(locale, "Send this to your supplier")}</Heading>
        <Card className="grid gap-6 p-5 md:grid-cols-2">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t(locale, "Your shipping mark")}
            </p>
            <div className="mt-2">
              <CopyField value={customer?.shippingMark ?? "—"} label="shipping mark" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t(locale, "This must be written on every box. Without it we cannot tell whose cargo has arrived.")}
            </p>
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <MapPin className="size-3.5" />
              {t(locale, "Our Guangzhou warehouse")}
            </p>
            <div className="mt-2">
              {forSupplier ? (
                <SupplierAddressCard {...forSupplier} />
              ) : (
                <CopyField value={company?.chinaAddress ?? t(locale, "Ask us for the address")} label="warehouse address" />
              )}
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

function Heading({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</h2>
      {action ? (
        <Link href={action.href} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          {action.label}
          <ArrowRight className="size-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  href,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  sub?: string;
  href: string;
  tone?: "brand" | "success" | "warning";
}) {
  return (
    <Link
      href={href}
      className="focus-ring rounded-xl border bg-card p-3.5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-raised"
    >
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </p>
      <p
        className={cn(
          "tnum mt-1.5 truncate text-xl font-bold tracking-tight",
          tone === "brand" && "text-brand",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning"
        )}
      >
        {value}
      </p>
      {sub ? <p className="tnum truncate text-[11px] text-muted-foreground">{sub}</p> : null}
    </Link>
  );
}

function Action({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      href={href}
      className="focus-ring flex flex-col items-center gap-1.5 rounded-xl border bg-card px-2 py-3 text-center shadow-soft transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-raised"
    >
      <span className="grid size-9 place-items-center rounded-full bg-brand/10 text-brand">
        <Icon className="size-4" />
      </span>
      <span className="text-[11px] font-medium leading-tight">{label}</span>
    </Link>
  );
}

function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tnum mt-0.5 truncate font-medium", strong && "text-signal")}>{value}</dd>
    </div>
  );
}
