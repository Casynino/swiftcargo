"use client";

import { useState } from "react";
import Link from "next/link";
import type { CargoStatus, ExceptionStatus, ExceptionType } from "@prisma/client";
import {
  ArrowRight,
  ChevronRight,
  CircleHelp,
  Clock,
  Landmark,
  PackageCheck,
  PackageMinus,
  PackageOpen,
  PackageSearch,
  PackageX,
  Replace,
  Scale,
  Ship,
  Shuffle,
  Box,
  Receipt,
  MessageSquareWarning,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { CargoStatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { EXCEPTION_STATUS_LABELS } from "@/lib/constants";
import { EXCEPTION_TYPE_LABELS, cargoIsHere, daysOpen } from "@/lib/exception-groups";
import { formatDate, formatDateTime } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";

import { Tx } from "@/components/app/tx";
/**
 * The issues queue, as a table.
 *
 * One line per case with the detail folded away behind it, so a busy desk sees
 * every open case at once and picks the one to chase. The things that decide
 * which case to chase are all in the row: how old it is, what kind of problem
 * it is, where the case has got to, whose cargo it is, and how many packages
 * Dar actually counted against what China sent.
 *
 * No money reaches this component. The warehouse reads this page too.
 */

export type ExceptionQueueRecord = {
  id: string;
  reference: string;
  type: ExceptionType;
  status: ExceptionStatus;
  title: string;
  description: string;
  openedAt: Date;
  finishedAt: Date | null;
  raisedByName: string | null;
  assignedToName: string | null;
  resolution: string | null;
  evidence: string[];
  customerName: string | null;
  customerPhone: string | null;
  container: { id: string; reference: string } | null;
  events: {
    id: string;
    note: string;
    to: ExceptionStatus | null;
    actorName: string | null;
    createdAt: Date;
  }[];
  cargo: {
    id: string;
    reference: string;
    status: CargoStatus;
    description: string;
    /** What China counted, or what was declared when China has not counted. */
    expected: number | null;
    /** Dar's own count. Null until the consignment is booked in at Dar. */
    atDar: number | null;
  } | null;
};

const TYPE_ICON: Record<ExceptionType, LucideIcon> = {
  MISSING_CARGO: PackageX,
  DAMAGED_CARGO: PackageOpen,
  PACKAGE_MISMATCH: PackageMinus,
  WEIGHT_DIFFERENCE: Scale,
  CBM_DIFFERENCE: Box,
  WRONG_CUSTOMER: Replace,
  WRONG_CONTAINER: Shuffle,
  UNIDENTIFIED_CARGO: PackageSearch,
  CUSTOMS_HOLD: Landmark,
  SHIPMENT_DELAY: Ship,
  PAYMENT_DISCREPANCY: Receipt,
  CUSTOMER_COMPLAINT: MessageSquareWarning,
  DELIVERY_FAILURE: Truck,
  OTHER: CircleHelp,
};

const STATUS_TONE: Record<ExceptionStatus, "neutral" | "progress" | "good" | "warn" | "bad"> = {
  OPEN: "bad",
  INVESTIGATING: "progress",
  WAITING_CUSTOMER: "warn",
  WAITING_FINANCE: "warn",
  WAITING_WAREHOUSE: "warn",
  ESCALATED: "bad",
  RESOLVED: "good",
  CLOSED: "neutral",
};

const COLUMNS = 9;

/**
 * The figures every view of a case needs, worked out once — so the phone card
 * and the desk row cannot say "3 of 4" and "3 of 5" about the same consignment.
 */
function caseFacts(record: ExceptionQueueRecord) {
  const cargo = record.cargo;
  const expected = cargo?.expected ?? null;
  /* Nothing came off the container: that is a count of zero, not an unknown.
     Cargo that has not reached Dar yet has no Dar count to show. */
  const atDar =
    cargo?.atDar ?? (cargo?.status === "MISSING_AT_DAR" ? 0 : null);
  const short = expected !== null && atDar !== null && atDar < expected;
  return {
    expected,
    atDar,
    short,
    age: daysOpen(new Date(record.openedAt), record.finishedAt ? new Date(record.finishedAt) : null),
  };
}

export function ExceptionTable({
  records,
  locale,
  closed = false,
}: {
  records: ExceptionQueueRecord[];
  locale: Locale;
  /** A history rather than a live queue — styled back. */
  closed?: boolean;
}) {
  if (records.length === 0) return null;

  return (
    <>
      {/* Below md the row becomes a card — a damaged consignment is usually
          reported from the floor, on the phone that took the photograph. */}
      <ul className="space-y-2 md:hidden">
        {records.map((record) => (
          <li key={record.id}>
            <ExceptionCard record={record} locale={locale} closed={closed} />
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-2" />
                <th className="px-3 py-2 font-medium">{t(locale, "Problem")}</th>
                <th className="px-3 py-2 font-medium">{t(locale, "Case")}</th>
                <th className="px-3 py-2 font-medium">{t(locale, "Tracking")}</th>
                <th className="px-3 py-2 font-medium">{t(locale, "Customer")}</th>
                <th className="hidden px-3 py-2 font-medium xl:table-cell">
                  {t(locale, "Goods")}
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                  {t(locale, "Boxes here")}
                </th>
                <th className="hidden px-3 py-2 font-medium lg:table-cell">
                  {t(locale, "Cargo status")}
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                  {closed ? t(locale, "Closed") : t(locale, "Open for")}
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <ExceptionRow
                  key={record.id}
                  record={record}
                  locale={locale}
                  closed={closed}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/**
 * Where the boxes are, beside what is wrong with them. "Damaged" alone does not
 * say the carton is on the shelf, and "Cargo present" alone does not say why it
 * is flagged. Amber, not red, for absent: most absent cargo is late, not lost.
 */
function PresenceBadge({ status, locale }: { status: CargoStatus; locale: Locale }) {
  const here = cargoIsHere(status);
  const Icon = here ? PackageCheck : PackageX;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${
        here
          ? "border-success/40 bg-success/10 text-success"
          : "border-warning/40 bg-warning/10 text-warning"
      }`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {here ? t(locale, "Cargo present") : t(locale, "Not in the warehouse")}
    </span>
  );
}

function BoxesHere({
  record,
  locale,
}: {
  record: ExceptionQueueRecord;
  locale: Locale;
}) {
  const { expected, atDar, short } = caseFacts(record);
  if (atDar === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className={short ? "font-semibold text-warning" : undefined}>
      {atDar} {t(locale, "of")} {expected ?? "—"}
    </span>
  );
}

function Age({
  record,
  locale,
  closed,
}: {
  record: ExceptionQueueRecord;
  locale: Locale;
  closed: boolean;
}) {
  const { age } = caseFacts(record);
  if (closed) return <>{formatDate(record.finishedAt)}</>;
  return (
    <span className={age >= 7 ? "font-semibold text-destructive" : ""}>
      {age === 0 ? t(locale, "today") : `${age}d`}
    </span>
  );
}

function ExceptionCard({
  record,
  locale,
  closed,
}: {
  record: ExceptionQueueRecord;
  locale: Locale;
  closed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const detailId = `case-card-${record.id}`;
  const Icon = TYPE_ICON[record.type];

  return (
    <div
      className={`rounded-xl border bg-card p-3 shadow-soft ${
        closed ? "text-muted-foreground" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex flex-wrap items-center gap-2">
          <Icon
            className={`h-4 w-4 shrink-0 ${closed ? "text-muted-foreground" : "text-destructive"}`}
          />
          <Badge tone={closed ? "neutral" : "bad"}>
            {t(locale, EXCEPTION_TYPE_LABELS[record.type])}
          </Badge>
          {!closed && record.cargo ? (
            <PresenceBadge status={record.cargo.status} locale={locale} />
          ) : null}
        </span>
        <span className="shrink-0 text-right text-xs">
          <span className="block text-muted-foreground">
            {closed ? t(locale, "Closed") : t(locale, "Open for")}
          </span>
          <span className="tnum">
            <Age record={record} locale={locale} closed={closed} />
          </span>
        </span>
      </div>

      <div className="mt-2">
        <Badge tone={STATUS_TONE[record.status]}>
          {t(locale, EXCEPTION_STATUS_LABELS[record.status])}
        </Badge>
      </div>

      {record.cargo ? (
        <p className="mt-2">
          <Link
            href={`/app/cargo/${record.cargo.id}`}
            className="focus-ring tnum rounded font-mono text-sm font-semibold hover:text-brand"
          >
            {record.cargo.reference}
          </Link>
        </p>
      ) : null}
      <p className="truncate text-sm">{record.customerName ?? "—"}</p>
      <p className="line-clamp-2 text-xs text-muted-foreground">
        {record.cargo?.description ?? record.title}
      </p>

      {record.cargo ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-muted-foreground">
            {t(locale, "Boxes here")}{" "}
            <span className="tnum text-foreground">
              <BoxesHere record={record} locale={locale} />
            </span>
          </span>
          <CargoStatusBadge status={record.cargo.status} />
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={detailId}
        className="focus-ring mt-3 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
      >
        <ChevronRight
          className={`h-4 w-4 transition-transform motion-reduce:transition-none ${
            open ? "rotate-90" : ""
          }`}
        />
        {open ? t(locale, "Hide case detail") : t(locale, "Show case detail")}
      </button>

      {open ? (
        <div id={detailId} className="mt-1">
          <CaseRecord record={record} locale={locale} />
        </div>
      ) : null}
    </div>
  );
}

function ExceptionRow({
  record,
  locale,
  closed,
}: {
  record: ExceptionQueueRecord;
  locale: Locale;
  closed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const detailId = `case-${record.id}`;
  const Icon = TYPE_ICON[record.type];

  return (
    <>
      <tr
        className={`border-t align-middle ${
          closed ? "text-muted-foreground" : "hover:bg-muted/40"
        }`}
      >
        <td className="px-2 py-1.5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={detailId}
            className="focus-ring relative flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <ChevronRight
              className={`h-4 w-4 transition-transform motion-reduce:transition-none ${
                open ? "rotate-90" : ""
              }`}
            />
            <span className="sr-only">
              {open ? t(locale, "Hide case detail") : t(locale, "Show case detail")}
            </span>
          </button>
        </td>

        <td className="whitespace-nowrap px-3 py-1.5">
          <span className="flex items-center gap-2">
            <Icon
              className={`h-4 w-4 shrink-0 ${closed ? "text-muted-foreground" : "text-destructive"}`}
            />
            <Badge tone={closed ? "neutral" : "bad"}>
              {t(locale, EXCEPTION_TYPE_LABELS[record.type])}
            </Badge>
            {!closed && record.cargo ? (
              <PresenceBadge status={record.cargo.status} locale={locale} />
            ) : null}
          </span>
        </td>

        {/* Where the case has got to. Without it the queue could only say a
            case existed, not whether anybody had picked it up. */}
        <td className="whitespace-nowrap px-3 py-1.5">
          <Badge tone={STATUS_TONE[record.status]}>
            {t(locale, EXCEPTION_STATUS_LABELS[record.status])}
          </Badge>
        </td>

        <td className="whitespace-nowrap px-3 py-1.5">
          {record.cargo ? (
            <Link
              href={`/app/cargo/${record.cargo.id}`}
              className="focus-ring tnum rounded font-mono text-xs font-semibold hover:text-brand hover:underline"
            >
              {record.cargo.reference}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>

        <td className="max-w-[10rem] truncate px-3 py-1.5">
          {record.customerName ?? "—"}
        </td>

        <td className="hidden max-w-[14rem] truncate px-3 py-1.5 xl:table-cell">
          {record.cargo?.description ?? record.title}
        </td>

        {/* The number that decides whether this is a search or a claim. */}
        <td className="tnum whitespace-nowrap px-3 py-1.5 text-right">
          {record.cargo ? (
            <BoxesHere record={record} locale={locale} />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>

        <td className="hidden whitespace-nowrap px-3 py-1.5 lg:table-cell">
          {record.cargo ? <CargoStatusBadge status={record.cargo.status} /> : "—"}
        </td>

        <td className="tnum whitespace-nowrap px-3 py-1.5 text-right">
          <Age record={record} locale={locale} closed={closed} />
        </td>
      </tr>

      {open ? (
        <tr className="border-t-0">
          <td colSpan={COLUMNS} id={detailId} className="bg-muted/20 px-3 pb-4 pt-0">
            <CaseRecord record={record} locale={locale} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * The case, read back. What may be done to it lives on the case page, where the
 * controls are gated per action; this is the summary that tells a desk whether
 * the case is theirs to open.
 */
function CaseRecord({
  record,
  locale,
}: {
  record: ExceptionQueueRecord;
  locale: Locale;
}) {
  const { expected, atDar } = caseFacts(record);
  const cargo = record.cargo;

  return (
    <div className="space-y-3 pt-3">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Panel
            title={t(locale, "Reported issue")}
            aside={
              <span className="tnum text-xs text-muted-foreground">{record.reference}</span>
            }
          >
            <p className="text-sm font-medium"><Tx>{record.title}</Tx></p>
            <p className="mt-1 whitespace-pre-wrap text-sm"><Tx>{record.description}</Tx></p>
            {record.evidence.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {record.evidence.map((url, index) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="focus-ring rounded text-xs text-brand underline-offset-4 hover:underline"
                    >
                      {t(locale, "Evidence")} {index + 1}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>

          <Panel title={t(locale, "The case")}>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
              <Fact label={t(locale, "Reported by")}>
                {record.raisedByName ?? "—"}
                <span className="block text-muted-foreground">
                  {formatDateTime(record.openedAt)}
                </span>
              </Fact>
              <Fact label={t(locale, "Carried by")}>
                {record.assignedToName ?? t(locale, "Nobody yet")}
              </Fact>
              <Fact label={t(locale, "Customer")}>
                {record.customerName ?? "—"}
                <span className="block text-muted-foreground">
                  {record.customerPhone ?? t(locale, "no phone on file")}
                </span>
              </Fact>
              <Fact label={t(locale, "Cargo")}>
                {cargo ? (
                  <>
                    <span className="tnum font-mono">{cargo.reference}</span>
                    <span className="block text-muted-foreground"><Tx>{cargo.description}</Tx></span>
                  </>
                ) : (
                  t(locale, "Not on a consignment")
                )}
              </Fact>
              <Fact label={t(locale, "Container")}>
                {record.container ? (
                  <Link
                    href={`/app/containers/${record.container.id}`}
                    className="focus-ring tnum rounded font-mono hover:text-brand"
                  >
                    {record.container.reference}
                  </Link>
                ) : (
                  t(locale, "Not in a container")
                )}
              </Fact>
              <Fact label={t(locale, "Where the cargo is")}>
                {!cargo
                  ? "—"
                  : atDar === null
                    ? t(locale, "Not counted at Dar yet.")
                    : expected !== null && atDar < expected
                      ? `${expected - atDar} ${t(locale, "of")} ${expected} ${t(locale, "packages not accounted for.")}`
                      : t(locale, "Every package is in the Dar warehouse.")}
              </Fact>
            </dl>
          </Panel>
        </div>

        <div className="space-y-3">
          <Panel
            title={t(locale, "Timeline")}
            aside={<span className="text-xs text-muted-foreground">{t(locale, "oldest first")}</span>}
          >
            {record.events.length === 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {t(locale, "Opened")} {formatDateTime(record.openedAt)}
              </p>
            ) : (
              <ol className="space-y-3">
                {record.events.map((event) => (
                  <li key={event.id} className="border-l-2 border-border pl-3">
                    <p className="text-sm"><Tx>{event.note}</Tx></p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDateTime(event.createdAt)}
                      {event.actorName ? ` · ${event.actorName}` : ""}
                      {event.to ? ` · ${t(locale, EXCEPTION_STATUS_LABELS[event.to])}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {record.resolution ? (
            <p className="rounded-md bg-muted/60 p-2 text-xs">
              <span className="font-medium">{t(locale, "Outcome:")} </span>
              {record.resolution}
            </p>
          ) : null}

          <Link
            href={`/app/exceptions/${record.id}`}
            className="focus-ring inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            {t(locale, "Open the case")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h4>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground"><Tx>{label}</Tx></dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}
