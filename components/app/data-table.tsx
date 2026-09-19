"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  Columns3,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { t, type Locale } from "@/lib/i18n";
import { visit } from "@/lib/nav-trail";
import { cn } from "@/lib/utils";

import { Tx } from "@/components/app/tx";
export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Provide to make the column sortable. */
  sortValue?: (row: T) => string | number | Date | null | undefined;
  className?: string;
  /** Hide below this breakpoint, so a narrow screen stays readable. */
  hideBelow?: "sm" | "md" | "lg" | "xl";
  /** Start hidden; the reader can switch it on from the column menu. */
  defaultHidden?: boolean;
  align?: "left" | "right" | "center";
};

export type TableFilter<T> = {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  match: (row: T, value: string) => boolean;
};

const HIDE_BELOW: Record<string, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

const ALIGN: Record<string, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

/**
 * The table every operational list uses.
 *
 * Sorting, filtering, search, column visibility and pagination, all client-side
 * over a page of rows the server already sent — the alternative is a round trip
 * every time somebody clicks a column heading, which on a warehouse phone over
 * mobile data is the difference between usable and abandoned.
 *
 * Two deliberate decisions:
 *
 *  - Below `md` the table becomes a list of cards via `renderCard`. Warehouse
 *    staff work on phones; a horizontally scrolling table is unusable there,
 *    and hiding columns until a row means nothing is worse than either.
 *
 *  - Sort state is by column id and search is a plain substring over the text
 *    the caller supplies, so a clerk searching a shipping mark finds it whether
 *    or not that column happens to be visible.
 */
export function DataTable<T>({
  rows,
  columns,
  getRowId,
  searchValue,
  searchPlaceholder = "Search…",
  filters = [],
  pageSize = 25,
  renderCard,
  rowHref,
  emptyTitle = "Nothing here",
  emptyDescription,
  emptyIcon = "Inbox",
  toolbar,
  initialSort,
  columnsKey,
  locale,
  className,
}: {
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  /** The text a search matches against. Omit to hide the search box. */
  searchValue?: (row: T) => string;
  searchPlaceholder?: string;
  filters?: TableFilter<T>[];
  pageSize?: number;
  renderCard?: (row: T) => React.ReactNode;
  rowHref?: (row: T) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: string;
  toolbar?: React.ReactNode;
  initialSort?: { id: string; dir: "asc" | "desc" };
  /**
   * Remembers which columns this viewer switched off, in this browser. Omit and
   * the choice lasts until the page is left.
   */
  columnsKey?: string;
  locale?: Locale;
  className?: string;
}) {
  /* The reader's sort, filters, search and page live in the address, under a
     `t.` prefix so they cannot collide with the page's own server-side query.
     Kept only in state, they were gone the moment somebody opened a row and came
     back — the list was reset to its first page, unsorted, and they had to find
     their place again. Written with replaceState: a filter change is not a step
     the browser's Back button should have to walk through. */
  const params = useSearchParams();
  const [query, setQuery] = React.useState(() => params.get("t.q") ?? "");
  const [sort, setSort] = React.useState<{ id: string; dir: "asc" | "desc" } | null>(() => {
    const raw = params.get("t.sort");
    if (raw === "none") return null;
    const [id, dir] = raw ? raw.split(":") : [];
    if (id && columns.some((c) => c.id === id && c.sortValue)) {
      return { id, dir: dir === "desc" ? "desc" : "asc" };
    }
    return initialSort ?? null;
  });
  const [active, setActive] = React.useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const filter of filters) {
      const value = params.get(`t.${filter.id}`);
      if (value && filter.options.some((o) => o.value === value)) out[filter.id] = value;
    }
    return out;
  });
  const [hidden, setHidden] = React.useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.id))
  );
  const [showColumns, setShowColumns] = React.useState(false);
  const [showFilters, setShowFilters] = React.useState(false);
  const [page, setPage] = React.useState(() => {
    const n = Number(params.get("t.page"));
    return Number.isInteger(n) && n > 1 ? n - 1 : 0;
  });

  React.useEffect(() => {
    const url = new URL(window.location.href);
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("t.")) url.searchParams.delete(key);
    }
    if (query.trim()) url.searchParams.set("t.q", query.trim());
    const sameAsDefault =
      (!sort && !initialSort) ||
      (sort && initialSort && sort.id === initialSort.id && sort.dir === initialSort.dir);
    if (!sameAsDefault) url.searchParams.set("t.sort", sort ? `${sort.id}:${sort.dir}` : "none");
    for (const [id, value] of Object.entries(active)) {
      if (value) url.searchParams.set(`t.${id}`, value);
    }
    if (page > 0) url.searchParams.set("t.page", String(page + 1));
    if (url.href !== window.location.href) {
      window.history.replaceState(window.history.state, "", url.href);
      /* The trail records the address when the page is reached; a sort changed
         afterwards has to be written there too, or Back returns to the list as
         it was first opened. */
      visit(url.pathname + url.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sort, active, page]);

  /* Read after mount, not in the initial state: the server has no storage, and
     a first render that differs between the two is a hydration error. Storage
     can be missing or refuse outright (a private window, blocked site data), and
     the table has to work the same without it. */
  React.useEffect(() => {
    if (!columnsKey) return;
    try {
      const saved = window.localStorage.getItem(`columns:${columnsKey}`);
      if (!saved) return;
      const ids = JSON.parse(saved);
      if (Array.isArray(ids)) {
        const known = new Set(columns.map((c) => c.id));
        setHidden(new Set(ids.filter((id): id is string => typeof id === "string" && known.has(id))));
      }
    } catch {
      /* Defaults stand. */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnsKey]);

  const toggleColumn = (id: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(id)) next.delete(id);
      /* Never the last one: a table with no columns shows nothing to read. */
      else if (columns.length - next.size > 1) next.add(id);
      if (columnsKey) {
        try {
          window.localStorage.setItem(`columns:${columnsKey}`, JSON.stringify([...next]));
        } catch {
          /* Remembered for this visit only. */
        }
      }
      return next;
    });

  const activeFilterCount = Object.values(active).filter(Boolean).length;

  const visible = columns.filter((c) => !hidden.has(c.id));

  const filtered = React.useMemo(() => {
    let out = rows;

    const q = query.trim().toLowerCase();
    if (q && searchValue) {
      out = out.filter((row) => searchValue(row).toLowerCase().includes(q));
    }

    for (const filter of filters) {
      const value = active[filter.id];
      if (value) out = out.filter((row) => filter.match(row, value));
    }

    if (sort) {
      const column = columns.find((c) => c.id === sort.id);
      if (column?.sortValue) {
        out = [...out].sort((a, b) => {
          const av = column.sortValue!(a);
          const bv = column.sortValue!(b);
          /* Nulls sort last in both directions. A blank ETA is not "earliest";
             it is unknown, and putting it at the top of an ascending sort makes
             the column look wrong. */
          if (av === null || av === undefined) return 1;
          if (bv === null || bv === undefined) return -1;
          const cmp =
            av instanceof Date && bv instanceof Date
              ? av.getTime() - bv.getTime()
              : typeof av === "number" && typeof bv === "number"
                ? av - bv
                : String(av).localeCompare(String(bv), undefined, {
                    numeric: true,
                  });
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }

    return out;
  }, [rows, query, active, sort, columns, filters, searchValue]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const shown = filtered.slice(current * pageSize, current * pageSize + pageSize);

  const toggleSort = (id: string) => {
    setPage(0);
    setSort((s) =>
      s?.id === id
        ? s.dir === "asc"
          ? { id, dir: "desc" }
          : null
        : { id, dir: "asc" }
    );
  };

  const hasToolbar = !!searchValue || filters.length > 0 || !!toolbar;

  return (
    <div className={cn("space-y-3", className)}>
      {hasToolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          {searchValue ? (
            <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                className="h-9 pl-9 pr-8"
                aria-label={searchPlaceholder}
              />
              {query ? (
                <button
                  type="button"
                  aria-label={t(locale, "Clear search")}
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            {toolbar}
            {filters.length > 0 ? (
              <Button
                type="button"
                variant={activeFilterCount ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowFilters((v) => !v)}
                className="h-9"
                aria-expanded={showFilters}
              >
                <SlidersHorizontal />
                {t(locale, "Filters")}
                {activeFilterCount ? (
                  <span className="tnum rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-foreground">
                    {activeFilterCount}
                  </span>
                ) : null}
              </Button>
            ) : null}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowColumns((v) => !v)}
                className="h-9"
                aria-label={t(locale, "Columns")}
                aria-expanded={showColumns}
              >
                <Columns3 />
                <span className="hidden sm:inline">{t(locale, "Columns")}</span>
              </Button>
              {showColumns ? (
                <>
                  <button
                    type="button"
                    aria-label={t(locale, "Close")}
                    className="fixed inset-0 z-10 cursor-default"
                    onClick={() => setShowColumns(false)}
                  />
                  <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border bg-popover p-1.5 shadow-raised">
                    <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t(locale, "Show columns")}
                    </p>
                    {columns.map((column) => (
                      <label
                        key={column.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-secondary"
                      >
                        <input
                          type="checkbox"
                          checked={!hidden.has(column.id)}
                          onChange={() => toggleColumn(column.id)}
                        />
                        {column.header}
                      </label>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showFilters && filters.length > 0 ? (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3 shadow-soft">
          {filters.map((filter) => (
            <div key={filter.id} className="min-w-[10rem] flex-1 space-y-1.5">
              <label
                htmlFor={`filter-${filter.id}`}
                className="text-xs font-medium text-muted-foreground"
              >
                <Tx>{filter.label}</Tx>
              </label>
              <NativeSelect
                id={`filter-${filter.id}`}
                value={active[filter.id] ?? ""}
                onChange={(e) => {
                  setActive((a) => ({ ...a, [filter.id]: e.target.value }));
                  setPage(0);
                }}
                className="h-9"
              >
                <option value="">{t(locale, "All")}</option>
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    <Tx>{option.label}</Tx>
                  </option>
                ))}
              </NativeSelect>
            </div>
          ))}
          {activeFilterCount ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setActive({});
                setPage(0);
              }}
            >
              {t(locale, "Clear all")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {shown.length === 0 ? (
        <div className="rounded-xl border bg-card shadow-soft">
          <EmptyState
            icon={emptyIcon}
            title={query || activeFilterCount ? t(locale, "Nothing matches") : emptyTitle}
            description={
              query || activeFilterCount
                ? t(locale, "Try a different search, or clear the filters.")
                : emptyDescription
            }
          />
        </div>
      ) : (
        <>
          {/* Cards on a phone. */}
          {renderCard ? (
            <ul className="space-y-2 md:hidden">
              {shown.map((row) => (
                <li key={getRowId(row)}>
                  {rowHref ? (
                    <Link
                      href={rowHref(row)}
                      className="focus-ring block rounded-xl border bg-card p-4 shadow-soft transition-colors hover:bg-secondary/50"
                    >
                      {renderCard(row)}
                    </Link>
                  ) : (
                    <div className="rounded-xl border bg-card p-4 shadow-soft">
                      {renderCard(row)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          <div
            className={cn(
              "overflow-hidden rounded-xl border bg-card shadow-soft",
              renderCard && "hidden md:block"
            )}
          >
            <div className="relative overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-surface-2/60">
                    {visible.map((column) => {
                      const sorted = sort?.id === column.id;
                      return (
                        <th
                          key={column.id}
                          scope="col"
                          className={cn(
                            "h-10 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
                            column.hideBelow && HIDE_BELOW[column.hideBelow],
                            column.align && ALIGN[column.align],
                            column.className
                          )}
                        >
                          {column.sortValue ? (
                            <button
                              type="button"
                              onClick={() => toggleSort(column.id)}
                              className={cn(
                                "focus-ring -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-foreground",
                                sorted && "text-foreground",
                                column.align === "right" && "flex-row-reverse"
                              )}
                            >
                              {column.header}
                              {sorted ? (
                                sort!.dir === "asc" ? (
                                  <ChevronUp className="size-3" />
                                ) : (
                                  <ChevronDown className="size-3" />
                                )
                              ) : (
                                <ChevronsUpDown className="size-3 opacity-40" />
                              )}
                            </button>
                          ) : (
                            column.header
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr
                      key={getRowId(row)}
                      className="border-b transition-colors last:border-0 hover:bg-secondary/50"
                    >
                      {visible.map((column) => (
                        <td
                          key={column.id}
                          className={cn(
                            "px-3 py-2.5 align-middle",
                            column.hideBelow && HIDE_BELOW[column.hideBelow],
                            column.align && ALIGN[column.align],
                            column.className
                          )}
                        >
                          {column.cell(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {filtered.length > pageSize ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="tnum text-muted-foreground">
                {current * pageSize + 1}–
                {Math.min((current + 1) * pageSize, filtered.length)} {t(locale, "of")}{" "}
                {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={t(locale, "Previous page")}
                  disabled={current === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft />
                </Button>
                <span className="tnum px-2 text-xs text-muted-foreground">
                  {current + 1} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={t(locale, "Next page")}
                  disabled={current >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
