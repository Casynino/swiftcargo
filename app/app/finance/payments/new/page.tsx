import Link from "next/link";
import type { Metadata } from "next";
import { Banknote, ReceiptText, Search, Users, Wallet } from "lucide-react";

import { FinanceTabs } from "@/components/app/finance-tabs";
import { PageHeader } from "@/components/app/page-header";
import { WhatsAppButton } from "@/components/app/whatsapp-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initials } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";
import { balanceOf, owedAcross } from "@/lib/invoice-balance";
import { whatsappNumber } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "Merge Payment" };

/**
 * ONE CUSTOMER, ONE HANDOVER, HOWEVER MANY BILLS IT COVERS.
 *
 * A customer with four containers' worth of cargo on the floor arrives with one
 * lot of money. Taken bill by bill it is four counts of the same notes, and
 * taken against one bill it leaves three that look unpaid while the money sits
 * in the wrong place.
 *
 * This screen is the way in: who is carrying more than one open bill, how many,
 * and what it comes to — so the desk finds the customer before the customer is
 * standing in front of them.
 *
 * THE BILLS ARE NOT MERGED, ONLY THE ACT OF TAKING THE MONEY. Each cargo keeps
 * its own invoice, its own container and its own pickup note; the money is
 * spread across them oldest first. See recordMergedPayment.
 *
 * WHAT IS OWED IS DERIVED, NEVER READ OFF A COLUMN. balanceOf() counts VERIFIED
 * payments only, in shillings at each bill's own pinned rate — a screenshot
 * somebody uploaded is worth nothing until Finance says otherwise, and today's
 * rate is never read against an older bill.
 */
export default async function MergePaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("payment.submit");
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { locale: true },
  });
  const locale = (me?.locale ?? "en") as Locale;

  const { q } = await searchParams;
  const query = (q ?? "").trim();

  /*
    Every customer with a billed invoice, and those bills with them.

    Filtered in memory rather than in SQL because "open" is derived: a bill is
    open when VERIFIED payments have not covered it, and no column says so.
  */
  const customers = await prisma.customer.findMany({
    where: {
      deletedAt: null,
      invoices: { some: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } } },
      ...(query
        ? {
            OR: [
              { fullName: { contains: query, mode: "insensitive" } },
              { businessName: { contains: query, mode: "insensitive" } },
              { phone: { contains: query } },
              { code: { contains: query, mode: "insensitive" } },
              { shippingMark: { contains: query, mode: "insensitive" } },
              {
                invoices: {
                  some: {
                    cargo: {
                      is: { reference: { contains: query, mode: "insensitive" } },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      fullName: true,
      businessName: true,
      code: true,
      phone: true,
      invoices: {
        where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
        orderBy: [{ issuedAt: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          total: true,
          totalTzs: true,
          currency: true,
          fxRate: true,
          payments: {
            select: {
              status: true,
              amount: true,
              currency: true,
              fxRate: true,
              baseCurrencyAmount: true,
              creditedAmount: true,
            },
          },
        },
      },
    },
    orderBy: { fullName: "asc" },
  });

  const matches = customers
    .map((customer) => {
      /* A bill whose status still says ISSUED but whose verified payments have
         covered it is not a bill this screen is waiting on. */
      const open = customer.invoices.filter((invoice) => !balanceOf(invoice).settled);
      return {
        id: customer.id,
        /* The business is who pays; the person is who answers the phone. */
        name: customer.businessName || customer.fullName,
        code: customer.code,
        phone: customer.phone,
        bills: open.length,
        open,
        owed: owedAcross(open),
      };
    })
    /* One open bill is an ordinary payment and belongs on the cargo page, and
       listing those would bury the handful this screen exists for. A search is
       a deliberate act, so it answers with whoever it found. */
    .filter((row) => (query ? row.bills > 0 : row.bills > 1))
    /* Most owed first: the customer at the top is the one whose money the
       business is most waiting on. A bill with no rate cannot be counted in
       shillings, so it breaks ties rather than being added to them. */
    .sort(
      (a, b) =>
        b.owed.tzs.comparedTo(a.owed.tzs) ||
        b.owed.unconverted.comparedTo(a.owed.unconverted) ||
        b.bills - a.bills
    );

  const openBills = matches.reduce((n, row) => n + row.bills, 0);
  const owedAll = owedAcross(matches.flatMap((row) => row.open));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(locale, "Merge Payment")}
        description={t(
          locale,
          "Merge Payment lets a customer with multiple cargo or invoices pay them together as one handover. Select the cargo/invoices the payment covers, and the system spreads the money across their outstanding amounts oldest first, while each cargo keeps its own invoice, container, and pickup note."
        )}
      />
      {/* Finance works across its own tabs; Support reaches this page from its menu. */}
      {can(user.role, "payment.verify") ? <FinanceTabs /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-brand/30 bg-brand/5 p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand">
            <Users className="h-3.5 w-3.5" />
            {t(locale, "Waiting to pay")}
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums">{matches.length}</p>
          <p className="text-xs text-muted-foreground">
            {t(locale, "customers with more than one open bill")}
          </p>
        </div>

        <div className="rounded-2xl border border-warning/30 bg-warning/5 p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-warning">
            <ReceiptText className="h-3.5 w-3.5" />
            {t(locale, "Open bills")}
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums">{openBills}</p>
          <p className="text-xs text-muted-foreground">
            {t(locale, "consignments still to be settled")}
          </p>
        </div>

        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-destructive">
            <Wallet className="h-3.5 w-3.5" />
            {t(locale, "Outstanding")}
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums">{owedAll.primary}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {owedAll.equivalent || " "}
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-soft">
        <div className="border-b p-5">
          <form className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={query}
                placeholder={t(locale, "Customer name, phone or tracking number")}
                className="pl-9"
              />
            </div>
            <Button type="submit">{t(locale, "Search")}</Button>
          </form>
        </div>

        {matches.length > 0 ? (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">{t(locale, "Customer")}</th>
                  <th className="hidden p-3 font-medium sm:table-cell">
                    {t(locale, "Open bills")}
                  </th>
                  <th className="p-3 text-right font-medium">{t(locale, "Owed")}</th>
                  <th className="p-3 text-right font-medium">
                    {t(locale, "Reach them")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {matches.map((customer) => {
                  const href = `/app/finance/payments/new/${customer.id}`;
                  return (
                    <tr key={customer.id} className="border-t">
                      <td className="p-3">
                        <Link href={href} className="focus-ring flex items-center gap-3 rounded">
                          <span
                            aria-hidden
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand"
                          >
                            {initials(customer.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {customer.name}
                            </span>
                            <span className="block truncate font-mono text-xs text-muted-foreground">
                              {customer.code}
                              {customer.phone ? ` · ${customer.phone}` : ""}
                            </span>
                          </span>
                        </Link>
                      </td>

                      <td className="hidden p-3 sm:table-cell">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                          <ReceiptText className="h-3.5 w-3.5" />
                          {customer.bills}
                        </span>
                      </td>

                      <td className="whitespace-nowrap p-3 text-right">
                        <span className="block font-bold tabular-nums">
                          {customer.owed.primary}
                        </span>
                        <span className="block font-mono text-[11px] text-muted-foreground">
                          {customer.owed.equivalent}
                        </span>
                      </td>

                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Logged against the oldest open bill: a contact
                              has to be about a bill or a consignment, and
                              that is the one the money reaches first. */}
                          <WhatsAppButton
                            iconOnly
                            invoiceId={customer.open[0]?.id}
                            phone={whatsappNumber(customer.phone)}
                            kind="payment.reminder"
                            label={t(locale, "Remind them on WhatsApp")}
                            message={`Habari ${customer.name}, una bili ${customer.bills} zinazodaiwa Swift Cargo, jumla ${customer.owed.primary}. Unaweza kuzilipa zote kwa malipo moja.`}
                          />
                          <Link
                            href={href}
                            title={t(locale, "Merge Payment")}
                            aria-label={`${t(locale, "Merge Payment")} — ${customer.name}`}
                            className="focus-ring inline-flex size-9 items-center justify-center rounded-md border border-brand/40 text-brand transition-colors hover:bg-brand/10"
                          >
                            <Banknote className="h-4 w-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {query && matches.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            {t(locale, "Nobody matched that.")}
          </p>
        ) : null}
        {!query && matches.length === 0 ? (
          <p className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            {t(
              locale,
              "Nobody has more than one unpaid consignment right now. Search for a customer to take a payment."
            )}
          </p>
        ) : null}
      </div>
    </div>
  );
}
