"use client";

import Link from "next/link";
import { PackageOpen } from "lucide-react";

import { DataTable, type Column, type TableFilter } from "@/components/app/data-table";
import { WhatsAppButton } from "@/components/app/whatsapp-button";
import { formatDate } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";

export type CustomerRow = {
  id: string;
  code: string;
  name: string;
  /** A trading name, only when it says something the name does not. */
  mark: string | null;
  phone: string;
  city: string | null;
  cargo: number;
  activeCargo: number;
  /**
   * What is owed, already worded ("TZS 36,450"), and the shillings to sort by.
   * Undefined for roles that may not see money.
   */
  owed?: { label: string | null; tzs: number; owes: boolean };
  createdAt: string;
  lastCargoAt: string | null;
  /** The newest consignment: a WhatsApp contact is logged against one. */
  latestCargoId: string | null;
  /** Digits for wa.me and the wording, composed on the server. Null when it cannot be sent. */
  whatsapp: { phone: string; message: string } | null;
};

/**
 * The customer book.
 *
 * `owed` arrives undefined for roles without finance.view — the column and its
 * filter are built from that, so a warehouse account is never sent the figures
 * in the first place rather than having them hidden in the markup.
 */
export function CustomersTable({
  rows,
  locale,
  canContact,
}: {
  rows: CustomerRow[];
  locale: Locale;
  /** Logging a contact is its own permission; a button that always fails is worse than none. */
  canContact: boolean;
}) {
  const showMoney = rows.some((row) => row.owed !== undefined);

  const cities = [...new Set(rows.map((row) => row.city?.trim()).filter(Boolean) as string[])].sort(
    (a, b) => a.localeCompare(b)
  );

  const columns: Column<CustomerRow>[] = [
    {
      id: "name",
      header: t(locale, "Customer"),
      sortValue: (row) => row.name,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={`/app/customers/${row.id}`}
            className="font-medium hover:text-brand hover:underline"
          >
            {row.name}
          </Link>
          <div className="font-mono text-xs text-muted-foreground">
            {row.code}
            {row.mark ? <span className="font-sans"> · {row.mark}</span> : null}
          </div>
        </div>
      ),
    },
    {
      id: "phone",
      header: t(locale, "Phone"),
      sortValue: (row) => row.phone,
      className: "font-mono text-xs",
      cell: (row) =>
        row.phone ? (
          <a href={`tel:${row.phone}`} className="hover:text-brand">
            {row.phone}
          </a>
        ) : (
          <span className="font-sans text-xs text-muted-foreground">
            {t(locale, "none recorded")}
          </span>
        ),
    },
    {
      id: "city",
      header: t(locale, "City"),
      hideBelow: "lg",
      sortValue: (row) => row.city ?? "",
      className: "text-muted-foreground",
      cell: (row) => row.city ?? "—",
    },
    {
      id: "cargo",
      header: t(locale, "Cargo"),
      align: "right",
      sortValue: (row) => row.cargo,
      className: "tnum",
      cell: (row) => (
        <div>
          <span className="font-medium">{row.cargo}</span>
          {row.activeCargo > 0 ? (
            <Link
              href={`/app/customers/${row.id}`}
              className="block text-xs text-info hover:underline"
            >
              {t(locale, "{n} active").replace("{n}", String(row.activeCargo))}
            </Link>
          ) : null}
        </div>
      ),
    },
    ...(showMoney
      ? [
          {
            id: "owed",
            header: t(locale, "Owed"),
            align: "right" as const,
            sortValue: (row: CustomerRow) => row.owed?.tzs ?? 0,
            className: "font-mono tnum",
            cell: (row: CustomerRow) =>
              row.owed?.owes && row.owed.label ? (
                <span className="text-destructive">{row.owed.label}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          },
        ]
      : []),
    {
      id: "last",
      header: t(locale, "Last cargo"),
      hideBelow: "xl",
      sortValue: (row) => (row.lastCargoAt ? new Date(row.lastCargoAt) : null),
      className: "text-xs text-muted-foreground",
      cell: (row) => (row.lastCargoAt ? formatDate(row.lastCargoAt) : t(locale, "never")),
    },
    {
      id: "since",
      header: t(locale, "Customer since"),
      hideBelow: "xl",
      defaultHidden: true,
      sortValue: (row) => new Date(row.createdAt),
      className: "text-xs text-muted-foreground",
      cell: (row) => formatDate(row.createdAt),
    },
    {
      id: "reach",
      header: "",
      align: "right",
      cell: (row) => (
        /*
          The name is a link and nothing said so, so the row carries an explicit
          door with the count on it — the reader knows whether there is anything
          behind it before opening it.
        */
        <div className="flex items-center justify-end gap-1.5">
          {canContact && row.whatsapp && row.latestCargoId ? (
            <WhatsAppButton
              iconOnly
              cargoId={row.latestCargoId}
              phone={row.whatsapp.phone}
              message={row.whatsapp.message}
              kind="general"
              label={`WhatsApp ${row.name}`}
            />
          ) : null}
          <Link
            href={`/app/customers/${row.id}`}
            aria-label={`${t(locale, "Open")} ${row.name}`}
            className="focus-ring inline-flex h-9 items-center gap-1 rounded-md border border-brand/40 px-2 text-xs font-medium text-brand transition-colors hover:bg-brand/10"
          >
            <PackageOpen className="h-3.5 w-3.5" />
            {row.activeCargo > 0
              ? t(locale, "{n} active").replace("{n}", String(row.activeCargo))
              : t(locale, "Open")}
          </Link>
        </div>
      ),
    },
  ];

  const filters: TableFilter<CustomerRow>[] = [
    {
      id: "activity",
      label: t(locale, "Activity"),
      options: [
        { value: "active", label: t(locale, "Has cargo on the way") },
        { value: "dormant", label: t(locale, "Nothing active") },
        { value: "new", label: t(locale, "Never shipped") },
      ],
      match: (row, value) =>
        value === "active"
          ? row.activeCargo > 0
          : value === "new"
            ? row.cargo === 0
            : row.activeCargo === 0 && row.cargo > 0,
    },
    ...(cities.length > 1
      ? [
          {
            id: "city",
            label: t(locale, "City"),
            options: cities.map((city) => ({ value: city, label: city })),
            match: (row: CustomerRow, value: string) => row.city?.trim() === value,
          },
        ]
      : []),
    ...(showMoney
      ? [
          {
            id: "balance",
            label: t(locale, "Balance"),
            options: [
              { value: "owing", label: t(locale, "Owes money") },
              { value: "clear", label: t(locale, "Nothing owed") },
            ],
            match: (row: CustomerRow, value: string) =>
              value === "owing" ? !!row.owed?.owes : !row.owed?.owes,
          },
        ]
      : []),
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      filters={filters}
      locale={locale}
      columnsKey="customers"
      /*
        No search box of its own — the page has one above it.

        This table's search would filter the 25 rows it was handed; the page's
        searches every customer on file. Two boxes, one of which quietly only
        knows the current page, is how somebody concludes a customer is not in
        the system and registers them twice.
      */
      initialSort={{ id: "cargo", dir: "desc" }}
      emptyTitle={t(locale, "No customers match")}
      emptyDescription={t(locale, "Try a shorter piece of the name or number.")}
      rowHref={(row) => `/app/customers/${row.id}`}
      renderCard={(row) => (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{row.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{row.code}</p>
              <p className="mt-1 font-mono text-xs">{row.phone || t(locale, "no phone")}</p>
            </div>
            <div className="text-right">
              <p className="tnum text-sm font-medium">{row.cargo}</p>
              <p className="text-xs text-muted-foreground">{t(locale, "cargo")}</p>
              {row.activeCargo > 0 ? (
                <p className="text-xs text-info">
                  {t(locale, "{n} active").replace("{n}", String(row.activeCargo))}
                </p>
              ) : null}
            </div>
          </div>
          {row.owed?.owes && row.owed.label ? (
            <p className="mt-3 border-t pt-3 font-mono text-sm text-destructive">
              {row.owed.label} {t(locale, "owed")}
            </p>
          ) : null}
        </>
      )}
    />
  );
}
