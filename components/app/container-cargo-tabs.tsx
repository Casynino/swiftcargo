"use client";

import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";
import {
  ArrowRightLeft,
  Banknote,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Package,
  Search,
} from "lucide-react";

import { useUrlState } from "@/components/app/use-url-state";
import { MoveCargo } from "@/components/app/move-cargo";
import { openRecordPayment } from "@/components/app/record-payment-dialog";
import { WhatsAppButton } from "@/components/app/whatsapp-button";
import { RowPriceEditor } from "@/components/app/row-price-editor";
import { SubmitButton } from "@/components/app/submit-button";
import { setPriceListCargoType, type PriceListState } from "@/lib/actions/price-list";
import { t, type Locale } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { useT } from "@/components/app/locale-provider";
import { Tx } from "@/components/app/tx";
export type CargoRow = {
  id: string;
  reference: string;
  receivedLabel: string;
  receivedAt: number;
  customer: string;
  phone: string;
  goods: string;
  category: string;
  volumeLabel: string;
  countedAs: string;
  priceLabel: string | null;
  /** The same figure in shillings — what anybody here reads out loud. */
  priceTzsLabel: string | null;
  /** What is still owed on it, for the sort and the badge. */
  owing: number;
  state: "paid" | "owed" | "unpriced" | "collected" | "note";
  stateLabel: string;
  proofUrl: string | null;
  /** How many photographs there are, when there is more than one. */
  proofCount: number;
  invoiceHref: string | null;
  invoiceId: string | null;
  href: string;
  /**
   * THE BILL, READY TO GO TO THE CUSTOMER.
   *
   * Confirming a price issues the invoice and puts a notification in the
   * customer's portal. Most customers here read WhatsApp, not a portal, so the
   * bill is sent by a person from the list they are already looking at — the
   * wording composed on the server from the invoice's own pinned figures, so
   * nobody retypes an amount into a phone. Null where there is no bill yet, no
   * number to send to, or no authority to send.
   */
  send: { phone: string; message: string; kind: string } | null;
  /** True where a bill exists, is unpaid, and the viewer may take money. */
  takesPayment: boolean;
  /** The single cargo type on the lines, for the picker on the row. */
  cargoType: string | null;
  /** Lines at more than one type — changed on the consignment, not here. */
  typeMixed: boolean;
  /** The tag the Dar floor put on when the boxes came off the container. */
  damaged: boolean;
  conditionLabel: string | null;
  /**
   * WHAT THE PRICE DIALOG NEEDS, OR NULL WHERE THERE IS NOTHING TO CHANGE.
   *
   * Null once a bill has gone out or money has moved on it: a figure a
   * customer is holding is Finance's, by discount or re-price with a reason,
   * and never by a dialog that says "save the price".
   */
  edit: {
    standardRate: number | null;
    agreedRate: number | null;
    bookBasis: "PER_CBM" | "PER_KG" | "FLAT" | null;
    basis: "PER_CBM" | "PER_KG" | "FLAT" | null;
    cbm: number | null;
    weightKg: number | null;
    freight: number;
    extra: number;
    discount: number;
  } | null;
};

export type DocumentRow = {
  id: string;
  title: string;
  note: string;
  href: string | null;
};

export type TimelineRow = {
  id: string;
  title: string;
  at: string;
  by: string;
};

const SORTS = {
  received: "date received",
  owed: "most owed",
  customer: "customer",
  volume: "largest volume",
} as const;
type Sort = keyof typeof SORTS;

/**
 * THE MANIFEST, AS FINANCE READS IT.
 *
 * The same rows the floor sees, with what each one is worth and whether anybody
 * has paid for it. Filtering and sorting happen here rather than on the server
 * because a container is at most a few hundred lines and the desk re-sorts it
 * constantly — a round trip per keystroke would make the one screen somebody
 * lives on the slowest in the building.
 */
export function ContainerCargoTabs({
  containerId,
  cargo,
  documents,
  timeline,
  cargoTypes,
  priceCategories = [],
  otherContainers,
  canConfirm,
  canAmend,
  vatPercent,
  locale,
}: {
  containerId: string;
  cargo: CargoRow[];
  documents: DocumentRow[];
  timeline: TimelineRow[];
  /** The rate book's own categories, for the type picked on a row. */
  cargoTypes: string[];
  /** The same, with each one's rate per CBM, for the price dialog. */
  priceCategories?: { name: string; rate: number }[];
  /** Other landed containers, for a consignment that came off the wrong one. */
  otherContainers: { id: string; reference: string }[];
  canConfirm: boolean;
  canAmend: boolean;
  /** What the bill adds on top, so a row's dialog agrees with its own row. */
  vatPercent: number;
  locale: Locale;
}) {
  const tx = useT();
  const [tab, setTab] = useUrlState("tab", "cargo", ["cargo", "documents", "timeline"] as const);
  const [query, setQuery] = useUrlState<string>("q", "");
  const [category, setCategory] = useUrlState<string>("category", "");
  const [sort, setSort] = useUrlState<Sort>("sort", "received", Object.keys(SORTS) as Sort[]);

  const categories = useMemo(
    () =>
      [...new Set(cargo.map((c) => c.category).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [cargo]
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = cargo.filter((row) => {
      if (category && row.category !== category) return false;
      if (!needle) return true;
      return `${row.reference} ${row.customer} ${row.phone} ${row.goods}`
        .toLowerCase()
        .includes(needle);
    });
    const sorted = [...rows];
    if (sort === "received") sorted.sort((a, b) => a.receivedAt - b.receivedAt);
    if (sort === "owed") sorted.sort((a, b) => b.owing - a.owing);
    if (sort === "customer")
      sorted.sort((a, b) => a.customer.localeCompare(b.customer));
    if (sort === "volume")
      sorted.sort((a, b) => b.volumeLabel.localeCompare(a.volumeLabel));
    return sorted;
  }, [cargo, query, category, sort]);

  const tabs = [
    { key: "cargo" as const, label: "Cargo", icon: Package, count: cargo.length },
    {
      key: "documents" as const,
      label: "Documents",
      icon: FileText,
      count: documents.length,
    },
    {
      key: "timeline" as const,
      label: "Timeline",
      icon: Clock,
      count: timeline.length,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center justify-center gap-2 px-4 py-3 text-sm transition-colors",
                tab === t.key
                  ? "bg-secondary font-medium text-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              <Tx>{t.label}</Tx>
              <span className="tnum rounded bg-background/60 px-1.5 py-0.5 text-xs">
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "cargo" ? (
        <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
          <div className="flex flex-wrap gap-3 p-4">
            <div className="relative min-w-[16rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tx("Tracking number, customer, phone or goods…")}
                className="pl-9"
                aria-label={tx("Search this container")}
              />
            </div>
            <NativeSelect
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-48"
              aria-label={tx("Category")}
            >
              <option value="">{tx("All categories")}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="w-52"
              aria-label={tx("Sort")}
            >
              {(Object.keys(SORTS) as Sort[]).map((key) => (
                <option key={key} value={key}>
                  Sort: {SORTS[key]}
                </option>
              ))}
            </NativeSelect>
          </div>

          <p className="tnum border-y px-4 py-2 text-xs text-muted-foreground">
            {shown.length} of {cargo.length} consignment
            {cargo.length === 1 ? "" : "s"}
          </p>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tx("Date received")}</TableHead>
                <TableHead>{tx("Tracking")}</TableHead>
                <TableHead>{tx("Customer")}</TableHead>
                <TableHead>{tx("Goods")}</TableHead>
                <TableHead className="text-right">{tx("Volume")}</TableHead>
                <TableHead className="text-right">{tx("Counted as")}</TableHead>
                <TableHead className="w-40" />
                <TableHead className="text-right">{tx("Price")}</TableHead>
                <TableHead className="w-16">{tx("Proof")}</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => (
                <CargoTableRow
                  key={row.id}
                  containerId={containerId}
                  row={row}
                  cargoTypes={cargoTypes}
                  priceCategories={priceCategories}
                  otherContainers={otherContainers}
                  canConfirm={canConfirm}
                  canAmend={canAmend}
                  vatPercent={vatPercent}
                  locale={locale}
                />
              ))}
            </TableBody>
          </Table>

          {shown.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {tx("Nothing matches. Try the tracking number, the customer or the goods.")}
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === "documents" ? (
        <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
          {documents.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              {tx("Nothing filed against this container yet.")}
            </p>
          ) : (
            <ul className="divide-y">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div>
                    <p className="text-sm font-medium"><Tx>{doc.title}</Tx></p>
                    <p className="tnum text-xs text-muted-foreground">
                      <Tx>{doc.note}</Tx>
                    </p>
                  </div>
                  {doc.href ? (
                    <Link
                      href={doc.href}
                      className="text-sm text-brand hover:underline"
                    >
                      {tx("Open")}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "timeline" ? (
        <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
          <ul className="divide-y">
            {timeline.map((event) => (
              <li key={event.id} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />
                <div>
                  <p className="text-sm font-medium"><Tx>{event.title}</Tx></p>
                  <p className="tnum text-xs text-muted-foreground">
                    {event.at} · {event.by}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * ONE CONSIGNMENT ON THE CONTAINER, AND EVERYTHING THAT CAN BE DONE TO IT.
 *
 * The container's cargo is listed once, here, and the price work happens on
 * these rows rather than in a second table above the page: the type where it
 * is missing or wrong, the price dialog behind Edit, and Move for a bale that
 * came off a different box. Listing the same boxes twice with different columns
 * is how two screens come to disagree about one container.
 */
function CargoTableRow({
  containerId,
  row,
  cargoTypes,
  priceCategories,
  otherContainers,
  canConfirm,
  canAmend,
  vatPercent,
  locale,
}: {
  containerId: string;
  row: CargoRow;
  cargoTypes: string[];
  priceCategories: { name: string; rate: number }[];
  otherContainers: { id: string; reference: string }[];
  canConfirm: boolean;
  canAmend: boolean;
  vatPercent: number;
  locale: Locale;
}) {
  const [moving, setMoving] = useState(false);

  return (
    <>
      <TableRow
        className={cn(
          /* The stripe answers the only question the desk asks of a row at a
             glance: has this one been paid for. Damage is read before any of
             them — a bale that came off wet is the fact about it. */
          row.damaged
            ? "border-l-2 border-l-destructive"
            : row.state === "paid" || row.state === "collected"
              ? "border-l-2 border-l-emerald-500"
              : row.state === "note"
                ? "border-l-2 border-l-brand"
                : row.state === "owed"
                  ? "border-l-2 border-l-amber-500"
                  : ""
        )}
      >
        <TableCell className="tnum whitespace-nowrap text-sm text-muted-foreground">
          {row.receivedLabel}
        </TableCell>
        <TableCell className="tnum whitespace-nowrap text-sm">
          {row.reference}
          {row.damaged ? (
            <Badge tone="bad" className="ml-1.5 align-middle">
              {row.conditionLabel}
            </Badge>
          ) : null}
        </TableCell>
        <TableCell className="text-sm font-medium">
          {row.customer}
          <span className="tnum block text-xs font-normal text-muted-foreground">
            {row.phone}
          </span>
        </TableCell>
        <TableCell className="max-w-[16rem] text-sm text-muted-foreground">
          {/* The type is what the goods ARE, and it re-prices from the rate
              book — which is a thing to do to a draft, not to a bill somebody
              is holding. Once a bill has gone out the type is corrected on the
              consignment, and the price on the bill. */}
          {canConfirm &&
          !row.typeMixed &&
          row.edit &&
          !row.invoiceId &&
          cargoTypes.length > 0 ? (
            <CargoTypeCell
              cargoId={row.id}
              reference={row.reference}
              current={row.cargoType ?? ""}
              options={cargoTypes}
              locale={locale}
            />
          ) : (
            <span className="block truncate">{row.goods}</span>
          )}
        </TableCell>
        <TableCell className="tnum whitespace-nowrap text-right text-sm">
          {row.volumeLabel}
        </TableCell>
        <TableCell className="tnum whitespace-nowrap text-right text-sm text-muted-foreground">
          {row.countedAs}
        </TableCell>
        <TableCell className="whitespace-nowrap">
          <span className="flex items-center gap-1.5">
            {canAmend && otherContainers.length >= 0 ? (
              <button
                type="button"
                onClick={() => setMoving((v) => !v)}
                aria-expanded={moving}
                title={t(locale, "It came off a different box, or off none")}
                className="focus-ring inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs font-medium hover:bg-secondary"
              >
                <ArrowRightLeft className="size-3" />
                {t(locale, "Move")}
              </button>
            ) : null}
            {row.send ? (
              <WhatsAppButton
                cargoId={row.id}
                invoiceId={row.invoiceId ?? undefined}
                phone={row.send.phone}
                message={row.send.message}
                kind={row.send.kind}
                label={t(locale, row.send.kind === "cargo.arrived" ? "Tell them it is in clearance" : "Send the bill")}
                iconOnly
              />
            ) : null}
            {row.edit ? (
              <RowPriceEditor
                cargoId={row.id}
                reference={row.reference}
                currency="USD"
                standardRate={row.edit.standardRate}
                agreedRate={row.edit.agreedRate}
                bookBasis={row.edit.bookBasis}
                basis={row.edit.basis}
                cbm={row.edit.cbm}
                weightKg={row.edit.weightKg}
                freight={row.edit.freight}
                extra={row.edit.extra}
                discount={row.edit.discount}
                invoiceId={row.invoiceId}
                category={row.cargoType}
                categories={priceCategories}
                vatPercent={vatPercent}
                locale={locale}
              />
            ) : null}
          </span>
        </TableCell>
        <TableCell className="whitespace-nowrap text-right">
          {row.priceLabel ? (
            <span className="inline-flex flex-col items-end gap-0.5">
              <span className="inline-flex items-center gap-2">
              {row.invoiceHref ? (
                <Link
                  href={row.invoiceHref}
                  className="tnum text-sm font-medium hover:underline"
                >
                  {row.priceLabel}
                </Link>
              ) : (
                <span className="tnum text-sm font-medium">{row.priceLabel}</span>
              )}
              <Badge
                tone={
                  row.state === "paid" || row.state === "collected"
                    ? "good"
                    : row.state === "note"
                      ? "progress"
                      : "warn"
                }
              >
                {row.stateLabel}
              </Badge>
              </span>
              {row.priceTzsLabel ? (
                <span className="tnum text-xs text-muted-foreground">
                  {row.priceTzsLabel}
                </span>
              ) : null}
            </span>
          ) : (
            <Badge tone="neutral">{row.stateLabel}</Badge>
          )}
        </TableCell>
        <TableCell>
          {/* What the floor photographed. It is the whole damage argument
              later, so it is one click from the money. */}
          {row.proofUrl ? (
            <span className="flex items-center gap-1.5">
              <a
                href={row.proofUrl}
                target="_blank"
                rel="noreferrer"
                title={`${t(locale, "View")} ${row.proofCount} ${t(locale, row.proofCount === 1 ? "photo" : "photos")}`}
                className="focus-ring relative block size-8 shrink-0 overflow-hidden rounded border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={row.proofUrl}
                  alt={`${row.reference}`}
                  loading="lazy"
                  className="size-full object-cover"
                />
                {row.proofCount > 1 ? (
                  <span className="tnum absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[10px] font-medium text-white">
                    {row.proofCount}
                  </span>
                ) : null}
              </a>
              <a
                href={row.proofUrl}
                download={`${row.reference}.jpg`}
                aria-label={t(locale, "Download the photo")}
                className="focus-ring text-muted-foreground hover:text-foreground"
              >
                <Download className="size-3.5" />
              </a>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="p-0">
          <span className="flex items-center justify-end gap-1 pr-1">
          {row.takesPayment && row.invoiceId ? (
            /* The customer at the counter with the money is looking at this
               screen over somebody's shoulder. One press from the row to the
               till, on the bill it is standing on. */
            <button
              type="button"
              onClick={() => openRecordPayment(row.invoiceId ?? undefined)}
              title={`${t(locale, "Record a payment on")} ${row.reference}`}
              className="focus-ring inline-flex shrink-0 items-center rounded-md border border-success/40 p-1.5 text-success hover:bg-success/10"
            >
              <Banknote className="size-3.5" />
              <span className="sr-only">
                {t(locale, "Record a payment")} {row.reference}
              </span>
            </button>
          ) : null}
          <Link
            href={row.href}
            className="flex items-center gap-1 py-3 pl-2 pr-3 text-sm text-muted-foreground hover:text-foreground"
          >
            {t(locale, "Open")}
            <ChevronRight className="size-4" />
          </Link>
          </span>
        </TableCell>
      </TableRow>

      {moving ? (
        <TableRow>
          <TableCell colSpan={10} className="bg-secondary/30 px-6 py-4">
            <MoveCargo
              cargoId={row.id}
              containerId={containerId}
              reference={row.reference}
              containers={otherContainers}
            />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

/** The cargo type, chosen on the row and saved the moment it is picked. */
function CargoTypeCell({
  cargoId,
  reference,
  current,
  options,
  locale,
}: {
  cargoId: string;
  reference: string;
  current: string;
  options: string[];
  locale: Locale;
}) {
  const [state, action] = useActionState<PriceListState, FormData>(
    setPriceListCargoType,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);
  const list = current && !options.includes(current) ? [current, ...options] : options;

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="cargoId" value={cargoId} />
      <NativeSelect
        key={current}
        name="cargoType"
        defaultValue={current}
        aria-label={`${t(locale, "Cargo type for")} ${reference}`}
        className={cn("h-8 min-w-40 text-xs", !current && "border-warning text-warning")}
        onChange={(event) => {
          if (event.currentTarget.value) formRef.current?.requestSubmit();
        }}
      >
        {!current ? <option value="">{t(locale, "Choose a type…")}</option> : null}
        {list.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </NativeSelect>
      {state.error ? (
        <p className="mt-1 text-xs text-destructive">{state.error}</p>
      ) : null}
    </form>
  );
}
