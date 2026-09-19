import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, PackageSearch, QrCode, ScanLine, Search } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t, type Locale } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { parseScan } from "@/lib/qr";
import { globalSearch, type SearchHit } from "@/lib/search";
import { requirePermission } from "@/lib/session";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "Search cargo" };

const TONES = {
  Cargo: "progress",
  Customer: "neutral",
  Container: "progress",
  Shipment: "progress",
  Invoice: "warn",
  Payment: "warn",
  Receipt: "good",
  Release: "good",
  Case: "bad",
} as const;

/** The four handles a warehouse clerk actually has when hunting for a box. */
const HANDLES = [
  {
    icon: QrCode,
    title: "A QR code",
    hint: "Scan or paste the label off the carton — package or consignment, old labels included.",
  },
  {
    icon: PackageSearch,
    title: "A tracking number",
    hint: "SWC-2026-000125, or the carton reference from the Guangzhou packing list.",
  },
  {
    icon: PackageSearch,
    title: "A customer name",
    hint: "Part of it is enough. Their customer code works too.",
  },
  {
    icon: PackageSearch,
    title: "A phone number",
    hint: "Typed the way they read it off the handset — 0757…, +255757… or the last digits.",
  },
];

/**
 * Find one box.
 *
 * The text goes through `globalSearch`, the one definition of "found" — two
 * searches that disagree about what matches is how a clerk concludes cargo is
 * lost.
 *
 * A scanned label is not text anybody types, so the text search can never match
 * it. It is read here the way the label's own link reads it — package token
 * first, then consignment token — and the cargo it names is pinned to the top.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("search.global");
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { locale: true },
  });
  const locale = (me?.locale ?? "en") as Locale;

  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const scan = query ? parseScan(query) : null;
  const token = scan && "token" in scan ? scan.token : null;

  const scanned = token ? await cargoForToken(token) : null;
  const results: SearchHit[] = token ? [] : query ? await globalSearch(query, user.role) : [];
  const rows: (SearchHit & { fromLabel?: boolean })[] = scanned
    ? [scanned, ...results.filter((hit) => hit.href !== scanned.href)]
    : results;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(locale, "Search cargo")}
        description={t(
          locale,
          "Find a box by its QR label, tracking number, customer name or phone number."
        )}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/app/scan">
              <ScanLine />
              {t(locale, "Use the camera")}
            </Link>
          </Button>
        }
      />

      <div className="rounded-xl border bg-card p-4 shadow-soft">
        <form className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={query}
              autoFocus
              className="h-11 pl-9"
              placeholder={t(
                locale,
                "QR code, tracking number, customer name or phone number"
              )}
              aria-label={t(locale, "Search cargo")}
            />
          </div>
          <Button type="submit" size="lg">
            {t(locale, "Search")}
          </Button>
        </form>
      </div>

      {!query ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {HANDLES.map((handle) => (
            <div key={handle.title} className="rounded-xl border bg-card p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <handle.icon className="h-4 w-4 text-brand" />
                {t(locale, handle.title)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(locale, handle.hint)}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {token && !scanned ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-destructive">
            <QrCode className="h-4 w-4" />
            {t(locale, "That code is not a Swift Cargo label")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              locale,
              "Nothing in the system carries it. Check you scanned our sticker and not a supplier's, then try the tracking number instead."
            )}
          </p>
        </div>
      ) : null}

      {scanned ? (
        <div className="rounded-xl border border-brand/40 bg-brand/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <QrCode className="h-4 w-4 text-brand" />
            {t(locale, "Label read")} — {scanned.title}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(locale, "Its cargo is first in the results below.")}
          </p>
        </div>
      ) : null}

      {query && !(token && !scanned) ? (
        <p className="text-sm text-muted-foreground">
          {rows.length}{" "}
          {t(locale, rows.length === 1 ? "result for" : "results for")}{" "}
          <span className="font-medium text-foreground">{query}</span>
        </p>
      ) : null}

      {query && !token && rows.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon="SearchX"
            title={t(locale, "Nothing matched")}
            description={t(
              locale,
              "Try a shorter piece of it — part of a name, the last few digits of the phone number, or the carton reference written on the box."
            )}
          />
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="relative overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-28 p-3 font-medium">{t(locale, "Kind")}</th>
                <th className="p-3 font-medium">{t(locale, "Found")}</th>
                <th className="w-8 p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((hit) => (
                <tr
                  key={`${hit.kind}-${hit.href}`}
                  className="group relative border-t hover:bg-secondary/50"
                >
                  <td className="p-3 align-top">
                    <Badge tone={TONES[hit.kind]}>{t(locale, hit.kind)}</Badge>
                  </td>
                  <td className="min-w-0 p-3">
                    <Link
                      href={hit.href}
                      className="font-mono text-sm font-semibold tabular-nums after:absolute after:inset-0 group-hover:text-brand"
                    >
                      {hit.title}
                    </Link>
                    {hit.fromLabel ? (
                      <Badge tone="progress" className="ml-2 align-middle">
                        <QrCode className="mr-1 h-3 w-3" />
                        {t(locale, "scanned")}
                      </Badge>
                    ) : null}
                    <p className="mt-0.5 max-w-xl truncate text-xs text-muted-foreground">
                      {hit.subtitle}
                    </p>
                  </td>
                  <td className="p-3 text-right align-middle">
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

/*
  The same order the label's own link resolves in: a sticker off one box names a
  package, the consignment label names the cargo. Deleted cargo is not found —
  the link refuses it too, and a search that disagreed would send a clerk
  looking for a box that was written off.
*/
async function cargoForToken(
  token: string
): Promise<(SearchHit & { fromLabel: true }) | null> {
  const select = {
    id: true,
    reference: true,
    description: true,
    status: true,
    deletedAt: true,
    sender: { select: { fullName: true } },
  } as const;

  const pkg = await prisma.cargoPackage.findUnique({
    where: { qrToken: token },
    select: { cargo: { select } },
  });
  /* A pickup note's code names its consignment too — it is what the customer
     hands over at the Dar counter. */
  const cargo =
    pkg?.cargo ??
    (await prisma.cargo.findUnique({ where: { qrToken: token }, select })) ??
    (
      await prisma.pickupNote.findUnique({
        where: { qrToken: token },
        select: { cargo: { select } },
      })
    )?.cargo;
  if (!cargo || cargo.deletedAt) return null;

  return {
    kind: "Cargo",
    title: cargo.reference,
    subtitle: `${cargo.sender.fullName} · ${cargo.description} · ${cargo.status.replace(/_/g, " ").toLowerCase()}`,
    href: `/app/cargo/${cargo.id}`,
    fromLabel: true,
  };
}
