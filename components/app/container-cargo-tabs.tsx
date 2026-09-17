"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ChevronRight,
  Clock,
  Download,
  FileText,
  Package,
  Search,
} from "lucide-react";

import { useUrlState } from "@/components/app/use-url-state";
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
  /** What is still owed on it, for the sort and the badge. */
  owing: number;
  state: "paid" | "owed" | "unpriced" | "collected" | "note";
  stateLabel: string;
  proofUrl: string | null;
  invoiceHref: string | null;
  href: string;
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
  cargo,
  documents,
  timeline,
}: {
  cargo: CargoRow[];
  documents: DocumentRow[];
  timeline: TimelineRow[];
}) {
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
              {t.label}
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
                placeholder="Tracking number, customer, phone or goods…"
                className="pl-9"
                aria-label="Search this container"
              />
            </div>
            <NativeSelect
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-48"
              aria-label="Category"
            >
              <option value="">All categories</option>
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
              aria-label="Sort"
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
                <TableHead>Date received</TableHead>
                <TableHead>Tracking</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Goods</TableHead>
                <TableHead className="text-right">Volume</TableHead>
                <TableHead className="text-right">Counted as</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="w-16">Proof</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    /* The stripe answers the only question the desk asks of a
                       row at a glance: has this one been paid for. */
                    row.state === "paid" || row.state === "collected"
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
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {row.customer}
                    <span className="tnum block text-xs font-normal text-muted-foreground">
                      {row.phone}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[14rem] truncate text-sm text-muted-foreground">
                    {row.goods}
                  </TableCell>
                  <TableCell className="tnum whitespace-nowrap text-right text-sm">
                    {row.volumeLabel}
                  </TableCell>
                  <TableCell className="tnum whitespace-nowrap text-right text-sm text-muted-foreground">
                    {row.countedAs}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {row.priceLabel ? (
                      <span className="inline-flex items-center gap-2">
                        {row.invoiceHref ? (
                          <Link
                            href={row.invoiceHref}
                            className="tnum text-sm font-medium hover:underline"
                          >
                            {row.priceLabel}
                          </Link>
                        ) : (
                          <span className="tnum text-sm font-medium">
                            {row.priceLabel}
                          </span>
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
                    ) : (
                      <Badge tone="neutral">{row.stateLabel}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {/* What the floor photographed. It is the whole damage
                        argument later, so it is one click from the money. */}
                    {row.proofUrl ? (
                      <a
                        href={row.proofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                      >
                        <Download className="size-3.5" />
                        View
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="p-0">
                    <Link
                      href={row.href}
                      className="flex items-center justify-end gap-1 px-4 py-3 text-sm text-muted-foreground hover:text-foreground"
                    >
                      Open
                      <ChevronRight className="size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {shown.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nothing matches. Try the tracking number, the customer or the
              goods.
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === "documents" ? (
        <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
          {documents.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              Nothing filed against this container yet.
            </p>
          ) : (
            <ul className="divide-y">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{doc.title}</p>
                    <p className="tnum text-xs text-muted-foreground">
                      {doc.note}
                    </p>
                  </div>
                  {doc.href ? (
                    <Link
                      href={doc.href}
                      className="text-sm text-brand hover:underline"
                    >
                      Open
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
                  <p className="text-sm font-medium">{event.title}</p>
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
