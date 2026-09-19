import Link from "next/link";
import type { Metadata } from "next";
import { Clock, Phone, QrCode, Search } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { FinanceTabs } from "@/components/app/finance-tabs";
import { PageHeader } from "@/components/app/page-header";
import { WhatsAppButton } from "@/components/app/whatsapp-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";
import { composeMessage, messageStage, whatsappNumber } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "Pickup notes" };

const FILTERS = [
  { key: "ACTIVE", label: "Waiting to be collected" },
  { key: "USED", label: "Picked up" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "ALL", label: "Everything" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

/** One page of the register. Named because the count line has to say so. */
const PAGE_SIZE = 100;

const PILL = {
  ACTIVE: "border-brand/30 bg-brand/10 text-brand",
  USED: "border-success/30 bg-success/10 text-success",
  CANCELLED: "border-border bg-muted text-muted-foreground",
} as const;

/**
 * The register of cargo cleared to leave.
 *
 * An ACTIVE note is not an archive entry — it is a customer who has paid and
 * whose boxes are still on our floor, accruing storage and taking space. So the
 * page leads with how long each has been standing and gives the phone number a
 * press rather than making somebody copy it out. That is the actual job here:
 * ring them and get the cargo gone.
 *
 * Nothing is ever deleted — a customer may be holding a printout, and the
 * counter has to be able to see that the note in front of it is dead.
 */
export default async function PickupNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("finance.view");
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { locale: true },
  });
  const locale = (me?.locale ?? "en") as Locale;

  const { status, q } = await searchParams;
  const query = q?.trim() ?? "";

  const active: FilterKey = FILTERS.some((f) => f.key === status)
    ? (status as FilterKey)
    : "ACTIVE";

  const contains = { contains: query, mode: "insensitive" as const };
  const digits = query.replace(/[^\d]/g, "");

  const where = {
    ...(active !== "ALL" ? { status: active } : {}),
    ...(query
      ? {
          OR: [
            { noteNumber: contains },
            { customer: { fullName: contains } },
            { customer: { businessName: contains } },
            { customer: { phone: contains } },
            /* A number read off a handset — 0757…, +255757… — carries a prefix
               the saved number may not, so the last digits are what match. */
            ...(digits.length >= 4
              ? [{ customer: { phone: { contains: digits.slice(-9) } } }]
              : []),
            { cargo: { reference: contains } },
          ],
        }
      : {}),
  };

  const [notes, counts] = await Promise.all([
    prisma.pickupNote.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      take: PAGE_SIZE,
      include: {
        customer: { select: { fullName: true, businessName: true, phone: true } },
        cargo: { select: { id: true, reference: true, description: true, status: true, clearedAt: true, darReceiving: { select: { id: true } } } },
        issuedBy: { select: { name: true } },
      },
    }),
    prisma.pickupNote.groupBy({ by: ["status"], _count: true }),
  ]);

  /* A pill keeps the search and the search keeps the pill — either one dropping
     the other silently is how a clerk ends up reading a list they did not ask
     for. */
  const pillHref = (key: FilterKey) => {
    const params = new URLSearchParams();
    if (key !== "ACTIVE") params.set("status", key);
    if (query) params.set("q", query);
    const qs = params.toString();
    return `/app/finance/pickup-notes${qs ? `?${qs}` : ""}`;
  };

  const countFor = (key: FilterKey) =>
    key === "ALL"
      ? counts.reduce((sum, row) => sum + row._count, 0)
      : (counts.find((row) => row.status === key)?._count ?? 0);

  // The oldest note still standing is the one worth a phone call.
  const oldest = notes
    .filter((note) => note.status === "ACTIVE")
    .reduce<Date | null>(
      (worst, note) => (!worst || note.issuedAt < worst ? note.issuedAt : worst),
      null
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title={t(locale, "Pickup notes")}
        description={t(
          locale,
          "The warehouse's authority to hand cargo over. Issued by Finance the moment a bill is settled — everyone else prints it and rings the customer."
        )}
      />
      {/* Finance works across its own tabs; Support reaches this page from its menu. */}
      {can(user.role, "payment.verify") ? <FinanceTabs /> : null}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const on = active === filter.key;
          return (
            <Link
              key={filter.key}
              href={pillHref(filter.key)}
              aria-current={on ? "page" : undefined}
              className={
                on
                  ? "inline-flex items-center gap-2 rounded-full border border-foreground/30 bg-foreground/5 px-3.5 py-1.5 text-sm font-medium"
                  : "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
              }
            >
              {t(locale, filter.label)}
              <span
                className={`rounded-full px-1.5 text-xs font-bold tabular-nums ${
                  on ? "bg-foreground/15" : "bg-muted"
                }`}
              >
                {countFor(filter.key)}
              </span>
            </Link>
          );
        })}
      </div>

      <div>
        <form className="flex max-w-xl gap-2">
          {active !== "ACTIVE" ? (
            <input type="hidden" name="status" value={active} />
          ) : null}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={query}
              placeholder={t(locale, "Note number, customer, phone or tracking number")}
              className="pl-9"
            />
          </div>
          <Button type="submit">{t(locale, "Search")}</Button>
        </form>
        {query ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {/* A full page means there may be more behind it, so it says
                "100+" rather than claiming exactly a hundred matched. */}
            {notes.length === PAGE_SIZE ? `${PAGE_SIZE}+` : notes.length}{" "}
            {t(locale, "of")} {countFor(active)} {t(locale, "match")}
            {" · "}
            <Link
              href={pillHref(active).replace(/[?&]q=[^&]*/, "").replace(/\?$/, "")}
              className="underline-offset-2 hover:underline"
            >
              {t(locale, "Clear")}
            </Link>
          </p>
        ) : null}
      </div>

      {active === "ACTIVE" && oldest ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 text-warning" />
          {t(locale, "Oldest has been waiting")}{" "}
          <span className="font-medium text-foreground">
            {waitedFor(locale, oldest)}
          </span>{" "}
          {t(locale, "— storage runs the whole time the cargo is on our floor.")}
        </p>
      ) : null}

      {notes.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon="QrCode"
            title={
              query
                ? `${t(locale, "Nothing matches")} “${query}”`
                : t(locale, "Nothing here")
            }
            description={
              query
                ? t(locale, "Try the tracking number, or a shorter search.")
                : t(
                    locale,
                    "A note appears the moment Finance confirms the payment that settles a bill."
                  )
            }
          />
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(locale, "Note")}</TableHead>
                <TableHead>{t(locale, "Customer")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t(locale, "Cargo")}</TableHead>
                <TableHead className="text-right">{t(locale, "Paid")}</TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  {t(locale, "Waiting")}
                </TableHead>
                <TableHead className="text-right">{t(locale, "Reach them")}</TableHead>
                <TableHead className="text-right">{t(locale, "Note")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notes.map((note) => {
                const waiting = note.status === "ACTIVE";
                const name = note.customer.businessName || note.customer.fullName;
                const phone = whatsappNumber(note.customer.phone);
                const paid = paidLines(note);
                return (
                  <TableRow key={note.id}>
                    <TableCell className="whitespace-nowrap py-2.5">
                      <span className="block font-mono text-xs font-semibold tabular-nums">
                        {note.noteNumber}
                      </span>
                      <Link
                        href={`/app/cargo/${note.cargo.id}`}
                        className="block font-mono text-xs tabular-nums text-muted-foreground hover:text-brand"
                      >
                        {note.cargo.reference}
                      </Link>
                    </TableCell>

                    <TableCell className="min-w-[11rem] py-2.5">
                      <span className="block truncate text-sm font-medium">{name}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-px text-xs ${PILL[note.status]}`}
                        >
                          {note.status === "ACTIVE"
                            ? t(locale, "not collected")
                            : note.status === "USED"
                              ? t(locale, "picked up")
                              : t(locale, "cancelled")}
                        </span>
                        {/* The recorded exception to "nothing leaves unpaid".
                            The note is valid, and the customer still owes. */}
                        {note.onCredit ? (
                          <span className="inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-2 py-px text-xs font-medium text-warning">
                            {t(locale, "on credit")}
                          </span>
                        ) : null}
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {note.customer.phone}
                        </span>
                      </span>
                    </TableCell>

                    <TableCell className="hidden max-w-[16rem] py-2.5 lg:table-cell">
                      <span className="block truncate text-xs text-muted-foreground">
                        {note.cargo.description}
                      </span>
                      <span className="block text-xs text-muted-foreground/70">
                        {t(locale, "issued by")} {note.issuedBy?.name ?? "—"}
                      </span>
                    </TableCell>

                    <TableCell className="whitespace-nowrap py-2.5 text-right">
                      <span className="block font-mono text-sm tabular-nums">
                        {paid.primary}
                      </span>
                      {paid.secondary ? (
                        <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">
                          {paid.secondary}
                        </span>
                      ) : null}
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap py-2.5 text-right text-xs sm:table-cell">
                      {waiting ? (
                        <span className="font-medium text-warning">
                          {waitedFor(locale, note.issuedAt)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {formatDate(note.usedAt ?? note.cancelledAt ?? note.issuedAt)}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap py-2.5 text-right">
                      {phone ? (
                        <span className="inline-flex items-center gap-2 sm:gap-1">
                          <a
                            href={`tel:${note.customer.phone}`}
                            title={t(locale, "Call them")}
                            aria-label={`${t(locale, "Call")} ${name}`}
                            className="focus-ring inline-flex size-9 items-center justify-center rounded-md border transition-colors hover:border-brand/40 hover:text-brand"
                          >
                            <Phone className="h-4 w-4" />
                          </a>
                          <WhatsAppButton
                            iconOnly
                            cargoId={note.cargo.id}
                            phone={phone}
                            kind="cargo.ready"
                            label={t(locale, "Notify on WhatsApp")}
                            message={composeMessage("cargo.ready", {
                              customerName: name,
                              reference: note.cargo.reference,
                              stage: messageStage({ status: note.cargo.status, hasDarReceiving: note.cargo.darReceiving !== null, clearedAt: note.cargo.clearedAt }),
                            })}
                          />
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t(locale, "no phone")}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap py-2.5 text-right">
                      <Link
                        href={`/app/finance/pickup-notes/${note.id}`}
                        className="focus-ring inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-brand px-4 text-xs font-semibold text-brand-foreground transition-colors hover:bg-brand/90 sm:min-h-0 sm:px-3 sm:py-1.5"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        {t(locale, "Print")}
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/*
  Shillings first, because shillings are what changed hands. The note keeps the
  settled figure in the bill's own currency and, when one was recorded, the
  shillings handed over; the two are shown one above the other and never added.
*/
function paidLines(note: {
  amountPaid: Parameters<typeof formatCurrency>[0];
  currency: string;
  amountTzs: Parameters<typeof formatCurrency>[0];
}): { primary: string; secondary: string | null } {
  if (note.currency === "TZS") {
    return { primary: formatCurrency(note.amountPaid, "TZS"), secondary: null };
  }
  if (note.amountTzs !== null && note.amountTzs !== undefined) {
    return {
      primary: formatCurrency(note.amountTzs, "TZS"),
      secondary: formatCurrency(note.amountPaid, note.currency),
    };
  }
  return { primary: formatCurrency(note.amountPaid, note.currency), secondary: null };
}

/* "3 days", not "3d ago": it follows "has been waiting", and it is read out to
   a customer on the phone. */
function waitedFor(locale: Locale, since: Date): string {
  const minutes = Math.max(0, Math.floor((Date.now() - since.getTime()) / 60_000));
  if (minutes < 60) return t(locale, "under an hour");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${t(locale, hours === 1 ? "hour" : "hours")}`;
  const days = Math.floor(hours / 24);
  return `${days} ${t(locale, days === 1 ? "day" : "days")}`;
}
