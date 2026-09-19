import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { Plus } from "lucide-react";

import { CustomersTable, type CustomerRow } from "@/components/app/customers-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SearchBox } from "@/components/app/search-box";
import { SectionTabs } from "@/components/app/section-tabs";
import { Button } from "@/components/ui/button";
import { distinctMark } from "@/lib/customer-name";
import { t } from "@/lib/i18n";
import { owedAcross } from "@/lib/invoice-balance";
import { composeMessage, whatsappNumber } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "Customers" };

/*
  One page of the book at a time, and the same size the table pages at, so there
  is one pager in play rather than two nested ones. It is also what bounds the
  cargo and invoice reads below, which are per customer on this page.
*/
const PAGE_SIZE = 25;

/** Anything else is still somewhere between Guangzhou and the customer's hands. */
const FINISHED = new Set(["COLLECTED", "DELIVERED", "CANCELLED"]);

/** Bills that are demands for money. A draft is not agreed; a paid or cancelled one is done. */
const OPEN_BILLS = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] as const;

/**
 * The shapes one number is typed in.
 *
 * Numbers are saved however the clerk wrote them — 0757…, +255757…, 255 757 … —
 * and a customer reads theirs off the handset as 0757…. Matching only what was
 * typed misses the most common input, so the number is also searched without
 * its country code or trunk zero.
 */
function phoneNeedles(input: string): string[] {
  const digits = input.replace(/[^\d]/g, "");
  if (digits.length < 4 || digits.length < input.replace(/[\s+()-]/g, "").length) return [];
  const local = digits.startsWith("255")
    ? digits.slice(3)
    : digits.startsWith("0")
      ? digits.slice(1)
      : digits;
  return [...new Set([digits, local])].filter((n) => n.length >= 4);
}

/**
 * The customer book.
 *
 * This page answers "do we have this person on file", so the search is a query
 * over every customer, in the URL, and the list carries a count and page links.
 * A table that loads the newest few hundred and filters those reports every
 * long-standing account as non-existent, and a clerk then registers them twice.
 *
 * Money is left off the payload entirely for anyone without finance.view,
 * rather than being sent and hidden in the markup.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; incomplete?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("customer.view");
  const locale = await localeOf(user.id);
  const showMoney = can(user.role, "finance.view");
  /* Logging a WhatsApp contact is authorised on these, not on customer.view. */
  const canContact =
    can(user.role, "conversation.reply") || can(user.role, "payment.submit");

  const params = await searchParams;
  const search = (params.q ?? "").trim();

  /* Records carried over without an email are flagged, never filled in with
     an invented one: the office asks the customer and types what they say. */
  const incomplete = params.incomplete === "1";

  const where: Prisma.CustomerWhereInput = {
    deletedAt: null,
    ...(incomplete ? { AND: [{ OR: [{ email: null }, { email: "" }] }] } : {}),
    ...(search
      ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" } },
            { businessName: { contains: search, mode: "insensitive" } },
            { code: { contains: search, mode: "insensitive" } },
            { shippingMark: { contains: search, mode: "insensitive" } },
            { city: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
            { altPhone: { contains: search } },
            { email: { contains: search, mode: "insensitive" } },
            /* A caller reads the number off their receipt more often than they
               spell their name the way it was typed. */
            { cargoSent: { some: { reference: { contains: search, mode: "insensitive" } } } },
            { cargoReceived: { some: { reference: { contains: search, mode: "insensitive" } } } },
            ...phoneNeedles(search).flatMap((needle) => [
              { phone: { contains: needle } },
              { altPhone: { contains: needle } },
            ]),
          ],
        }
      : {}),
  };

  /*
    Counted first so the page number can be clamped to a page that exists.
    ?page=99 of a three-page list otherwise renders an empty table under a
    header saying there are hundreds of customers, which reads as broken.
  */
  const total = await prisma.customer.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(params.page) || 1), pages);

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      code: true,
      fullName: true,
      businessName: true,
      shippingMark: true,
      phone: true,
      city: true,
      createdAt: true,
    },
  });
  const ids = customers.map((c) => c.id);

  /*
    Cargo the customer sent OR is receiving, each consignment once. Most are the
    same customer on both ends; when they differ, both people have it on their
    books — the sender dealt with the factory, the receiver collects and pays.
  */
  const [cargo, invoices] = await Promise.all([
    ids.length
      ? prisma.cargo.findMany({
          where: {
            deletedAt: null,
            OR: [{ senderId: { in: ids } }, { receiverId: { in: ids } }],
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true, createdAt: true, senderId: true, receiverId: true },
        })
      : [],
    showMoney && ids.length
      ? prisma.invoice.findMany({
          where: { customerId: { in: ids }, status: { in: [...OPEN_BILLS] } },
          select: {
            customerId: true,
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
        })
      : [],
  ]);

  const rows: CustomerRow[] = customers.map((customer) => {
    /* Newest first, from the query's order. */
    const mine = cargo.filter(
      (c) => c.senderId === customer.id || c.receiverId === customer.id
    );
    const active = mine.filter((c) => !FINISHED.has(c.status)).length;
    const mark = [customer.businessName, distinctMark(customer.fullName, customer.shippingMark)]
      .filter(Boolean)
      .join(" · ");

    /* Shillings first, summed in shillings at each bill's own rate; a dollar
       bill with no rate is shown beside them, never added in. */
    const owed = showMoney
      ? owedAcross(invoices.filter((invoice) => invoice.customerId === customer.id))
      : null;

    const phone = whatsappNumber(customer.phone);

    return {
      id: customer.id,
      code: customer.code,
      name: customer.fullName,
      mark: mark || null,
      phone: customer.phone,
      city: customer.city,
      cargo: mine.length,
      activeCargo: active,
      owed: owed
        ? { label: owed.owes ? owed.primary : null, tzs: owed.tzs.toNumber(), owes: owed.owes }
        : undefined,
      createdAt: customer.createdAt.toISOString(),
      lastCargoAt: mine[0]?.createdAt.toISOString() ?? null,
      latestCargoId: mine[0]?.id ?? null,
      whatsapp:
        canContact && phone
          ? { phone, message: composeMessage("general", { customerName: customer.fullName }) }
          : null,
    };
  });

  /** Paging keeps the search, so turning a page never silently widens it. */
  const link = (next: { q?: string; page?: string }) => {
    const merged: Record<string, string | undefined> = {
      q: search || undefined,
      /* Any change of search starts again at page one — page 4 of a different
         list is a blank screen that looks like a bug. */
      page: undefined,
      ...next,
    };
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) if (value) qs.set(key, value);
    const s = qs.toString();
    return `/app/customers${s ? `?${s}` : ""}`;
  };

  const firstOnPage = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastOnPage = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(locale, "Customers")}
        description={t(
          locale,
          "Created automatically the first time cargo is registered against a name or number."
        )}
        actions={
          can(user.role, "customer.manage") ? (
            <Button asChild>
              <Link href="/app/customers/new">
                <Plus />
                {t(locale, "Register a customer")}
              </Link>
            </Button>
          ) : null
        }
      />
      <SectionTabs />

      <div className="space-y-2">
        {/*
          Searched in the database, suggested from the page.

          A GET form so the result is a linkable URL and the back button behaves,
          and pressing Search goes to the server — over every customer on file.
          The suggestions while typing are only the customers on this page, and
          the caption says so: a shortcut that is quiet about its edges is how a
          clerk decides somebody is not on file.
        */}
        <div className="rounded-xl border bg-card p-3 shadow-soft">
          <SearchBox
            locale={locale}
            defaultValue={search}
            placeholder={t(locale, "Name, customer ID, phone, email, city or cargo reference")}
            suggestions={customers.flatMap((customer) => [
              {
                value: customer.fullName,
                label: customer.fullName,
                /* The phone tells two of the same name apart fastest. */
                hint: customer.phone || customer.code,
              },
              { value: customer.code, label: customer.fullName, hint: customer.code },
              ...(customer.phone
                ? [{ value: customer.phone, label: customer.fullName, hint: customer.phone }]
                : []),
            ])}
          />
          <p className="mt-2 text-[11px] text-muted-foreground">
            {t(locale, "Searches every customer on file, however long ago they registered.")}{" "}
            {t(locale, "The suggestions are the customers on this page.")}{" "}
            <Link
              href={incomplete ? "/app/customers" : "/app/customers?incomplete=1"}
              className="font-semibold text-brand hover:underline"
            >
              {incomplete ? t(locale, "Show everyone") : t(locale, "Show records with no email")}
            </Link>
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          {total === 0
            ? t(locale, "Nothing matches.")
            : `${t(locale, "Showing")} ${firstOnPage}–${lastOnPage} ${t(locale, "of")} ${total} ${t(locale, total === 1 ? "customer" : "customers")}`}
          {search ? ` · ${t(locale, "filtered")}` : ""}
          {search ? (
            <>
              {" · "}
              <Link href={link({ q: undefined })} className="underline-offset-2 hover:underline">
                {t(locale, "Clear the search")}
              </Link>
            </>
          ) : null}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-card shadow-soft">
          <EmptyState
            icon="Users"
            title={
              search ? t(locale, "No customer matches that") : t(locale, "No customers yet")
            }
            description={
              search
                ? t(
                    locale,
                    "Try a shorter piece of the name, the customer ID off an old invoice, or the last few digits of the phone number."
                  )
                : t(locale, "They appear here as soon as the China desk receives cargo.")
            }
          />
        </div>
      ) : (
        <CustomersTable rows={rows} locale={locale} canContact={canContact} />
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={link({ page: page === 2 ? undefined : String(page - 1) })}
              className="focus-ring rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary"
            >
              ← {t(locale, "Newer")}
            </Link>
          ) : (
            <span />
          )}
          <span className="tnum text-xs text-muted-foreground">
            {t(locale, "Page")} {page} {t(locale, "of")} {pages}
          </span>
          {page < pages ? (
            <Link
              href={link({ page: String(page + 1) })}
              className="focus-ring rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary"
            >
              {t(locale, "Older")} →
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </div>
  );
}
