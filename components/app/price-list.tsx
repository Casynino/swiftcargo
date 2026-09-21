"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { ClipboardCheck } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { RowPriceEditor } from "@/components/app/row-price-editor";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import {
  confirmPrices,
  setPriceListCargoType,
  type PriceListState,
} from "@/lib/actions/price-list";
import { t, type Locale } from "@/lib/i18n";
import type { PriceList as PriceListData, PriceListRow } from "@/lib/price-list";
import { cn } from "@/lib/utils";

import { Tx } from "@/components/app/tx";
/** What the Dar floor wrote on the receiving row, said in words. */
const CONDITION_LABEL: Record<string, string> = {
  GOOD: "Good",
  MINOR_DAMAGE: "Minor damage",
  DAMAGED: "Damaged",
  WET: "Wet",
  REPACKED: "Repacked",
};

const cbm = (value: string | null) => (value === null ? "—" : `${Number(value).toFixed(3)} CBM`);
const usd = (value: string | null) =>
  value === null
    ? "—"
    : `USD ${Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 })}`;

/**
 * THE FIRST THING ASKED OF WHOEVER CONFIRMS PRICES.
 *
 * Every consignment Dar counted was priced from the rate book when it was
 * checked in, so the list opens with figures nobody has looked at yet. The job
 * is to read down it, correct anything that looks wrong right here on the row,
 * and sign the rest off in one press — the page says that once, at the top, and
 * gives it one button. Not a modal: agreeing to a list is only honest when the
 * list is on the screen.
 */
export function PriceList({
  heading,
  containerId,
  list,
  cargoTypes,
  canConfirm,
  locale,
}: {
  /** What this list is — a container, or the group with none. */
  heading?: React.ReactNode;
  containerId: string | null;
  list: PriceListData;
  cargoTypes: string[];
  canConfirm: boolean;
  locale: Locale;
}) {
  if (list.rows.length === 0) return null;

  return (
    <ConfirmPricesBanner
      heading={heading}
      containerId={containerId}
      list={list}
      canConfirm={canConfirm}
      locale={locale}
    >
      <div className="overflow-x-auto border-t bg-card">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 font-medium">{t(locale, "Cargo")}</th>
              <th className="px-4 py-2 font-medium">{t(locale, "Cargo type")}</th>
              <th className="px-4 py-2 text-right font-medium">{t(locale, "CBM")}</th>
              <th className="px-4 py-2 font-medium">{t(locale, "Rate per CBM")}</th>
              <th className="px-4 py-2 text-right font-medium">{t(locale, "Amount")}</th>
            </tr>
          </thead>
          <tbody>
            {list.rows.map((row) => (
              <PriceRow
                key={row.cargoId}
                row={row}
                cargoTypes={cargoTypes}
                canEdit={canConfirm}
                vatPercent={list.vatIncluded ? 0 : Number(list.vatPercent)}
                locale={locale}
              />
            ))}
          </tbody>
        </table>
      </div>
    </ConfirmPricesBanner>
  );
}

/**
 * THE BANNER, AND THE ONE PRESS.
 *
 * On a container page the cargo is already on the screen once, in the
 * container's own table, and a second table of the same consignments above the
 * financial overview is the same boxes listed twice with different columns.
 * So the card is a banner there: what is waiting, what it comes to, and the
 * button. The corrections happen on the rows of the table that was already
 * there.
 *
 * The group with no container has no such table, so it keeps its own — passed
 * in as children.
 */
export function ConfirmPricesBanner({
  heading,
  containerId,
  list,
  canConfirm,
  locale,
  children,
}: {
  heading?: React.ReactNode;
  containerId: string | null;
  list: PriceListData;
  canConfirm: boolean;
  locale: Locale;
  children?: React.ReactNode;
}) {
  const [state, action] = useActionState<PriceListState, FormData>(confirmPrices, {});
  /* Two different reasons a row is not in the press, said as two different
     sentences. "The rate book cannot price this" is Finance's to fix here; "Dar
     is still counting" is somebody else's and there is nothing to do but wait,
     and telling a desk to look at a row it cannot act on wastes its morning. */
  const waiting = list.rows.filter((r) => !r.darConfirmed).length;
  const blocked = list.rows.length - list.ready - waiting;
  if (list.rows.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-signal/40 bg-signal/5">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          {heading ? <div className="mb-1 text-sm text-muted-foreground">{heading}</div> : null}
          <h2 className="flex items-center gap-2 font-semibold">
            <ClipboardCheck className="size-4 text-signal" />
            {list.ready}{" "}
            {t(locale, list.ready === 1 ? "price waiting for you" : "prices waiting for you")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {t(
              locale,
              "The system priced every consignment from the rate book when it was checked in —"
            )}{" "}
            <span className="tnum font-medium text-foreground">
              {list.totalUsdLabel}
              {list.totalTzsLabel ? ` (${list.totalTzsLabel})` : ""}
            </span>{" "}
            {t(
              locale,
              children
                ? "in total. Read down the list below, correct anything that looks wrong on its row, then confirm the rest in one go. Confirming issues each bill at today's exchange rate, sends it to the customer and moves it to Collections."
                : "in total. Read down the cargo below, open anything that looks wrong and correct it, then confirm the rest in one go. Confirming issues each bill at today's exchange rate, sends it to the customer and moves it to Collections."
            )}
          </p>
          {blocked > 0 ? (
            <p className="mt-2 text-sm text-warning">
              {blocked}{" "}
              {t(
                locale,
                blocked === 1
                  ? "consignment cannot be priced yet and is left out until it can — see its row."
                  : "consignments cannot be priced yet and are left out until they can — see their rows."
              )}
            </p>
          ) : null}
          {waiting > 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {waiting}{" "}
              {t(
                locale,
                waiting === 1
                  ? "consignment is still with the Dar floor. It joins this press once Dar confirms the count."
                  : "consignments are still with the Dar floor. They join this press once Dar confirms the count."
              )}
            </p>
          ) : null}
        </div>

        {canConfirm && list.ready > 0 ? (
          <form action={action} className="shrink-0">
            {containerId ? <input type="hidden" name="containerId" value={containerId} /> : null}
            {/* Exactly the rows the button counts. Without them the press would
                reach the whole container and come back reporting the rows still
                with Dar as failures, which reads as a fault rather than as the
                floor not having finished. The server narrows this against what
                is actually waiting and re-checks each one, so a stale list can
                only ask for less than it should, never more. */}
            {list.rows
              .filter((row) => !row.blockedReason && row.darConfirmed)
              .map((row) => (
                <input key={row.cargoId} type="hidden" name="cargoIds" value={row.cargoId} />
              ))}
            <SubmitButton variant="accent" pendingLabel={t(locale, "Confirming…")}>
              {list.ready === 1
                ? t(locale, "Confirm 1 price")
                : `${t(locale, "Confirm all")} ${list.ready} ${t(locale, "prices")}`}
            </SubmitButton>
          </form>
        ) : null}
      </div>
      {state.error || state.ok ? (
        <div className="px-5 pb-3">
          <FormMessage error={state.error} ok={state.ok} />
        </div>
      ) : null}

      {children}
    </section>
  );
}

function PriceRow({
  row,
  cargoTypes,
  canEdit,
  vatPercent,
  locale,
}: {
  row: PriceListRow;
  cargoTypes: string[];
  canEdit: boolean;
  vatPercent: number;
  locale: Locale;
}) {
  return (
    <tr className={cn("border-b align-top last:border-0", row.blockedReason && "bg-warning/[0.04]")}>
      <td className="px-4 py-3">
        <Link href={`/app/cargo/${row.cargoId}`} className="tnum font-medium hover:underline">
          {row.reference}
        </Link>
        {row.damaged ? (
          /* The tag the Dar floor put on when the boxes came off the container.
             It follows the cargo to whoever prices it, so nobody quotes a clean
             bill for a bale that arrived soaked. */
          <Badge tone="bad" className="ml-2 align-middle">
            {CONDITION_LABEL[row.condition ?? "DAMAGED"]}
          </Badge>
        ) : null}
        {row.darFlagged && !row.damaged ? (
          /* Short or over against the manifest, on boxes that are otherwise
             sound. Without this the only flagged rows that say anything are the
             damaged ones, and a count eight against a manifest of ten reads on
             the list exactly like a count everybody agrees with. */
          <Badge tone="warn" className="ml-2 align-middle">
            {t(locale, "Difference")}
          </Badge>
        ) : null}
        <span className="block text-xs text-muted-foreground"><Tx>{row.description}</Tx></span>
        <span className="block text-xs text-muted-foreground">
          {row.customer} · {row.customerCode}
        </span>
      </td>
      <td className="px-4 py-3">
        {canEdit && !row.mixed ? (
          <TypeCell row={row} cargoTypes={cargoTypes} locale={locale} />
        ) : row.types.length > 0 ? (
          <span>{row.types.join(", ")}</span>
        ) : (
          <span className="text-muted-foreground">{t(locale, "No type")}</span>
        )}
        {row.mixed && canEdit ? (
          <Link
            href={`/app/cargo/${row.cargoId}`}
            className="mt-1 block text-xs text-brand hover:underline"
          >
            {t(locale, "Lines differ — change them on the cargo")}
          </Link>
        ) : null}
      </td>
      <td className="tnum px-4 py-3 text-right">
        {cbm(row.billableCbm ?? row.cbm)}
        {row.billableCbm && row.cbm && Number(row.billableCbm) !== Number(row.cbm) ? (
          <span className="block text-xs text-muted-foreground">
            {t(locale, "measured")} {cbm(row.cbm)}
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <RateCell
          row={row}
          canEdit={canEdit}
          vatPercent={vatPercent}
          locale={locale}
        />
      </td>
      <td className="tnum px-4 py-3 text-right">
        {row.blockedReason ? (
          <span className="block max-w-56 text-left text-xs text-warning sm:ml-auto sm:text-right">
            {t(locale, "Cannot be priced:")} {row.blockedReason}
          </span>
        ) : (
          <>
            <span className="font-semibold">{row.totalLabel}</span>
            {row.totalTzsLabel ? (
              <span className="block text-xs text-muted-foreground">{row.totalTzsLabel}</span>
            ) : null}
            <span className="mt-1 block">
              {/* The figure is shown either way — Finance reads what the sailing
                  will come to before the floor has finished — but a row Dar has
                  not signed off says so rather than offering itself. */}
              {!row.darConfirmed ? (
                <Badge tone="warn">{t(locale, row.darWaiting ?? "With Dar")}</Badge>
              ) : row.invoiceNumber ? (
                <Badge tone="warn">
                  {t(locale, "Draft")} {row.invoiceNumber}
                </Badge>
              ) : (
                <Badge tone="neutral">{t(locale, "Priced now, raised on confirm")}</Badge>
              )}
            </span>
          </>
        )}
      </td>
    </tr>
  );
}

/** The type, changed on the row and saved the moment it is picked. */
function TypeCell({
  row,
  cargoTypes,
  locale,
}: {
  row: PriceListRow;
  cargoTypes: string[];
  locale: Locale;
}) {
  const [state, action] = useActionState<PriceListState, FormData>(setPriceListCargoType, {});
  const formRef = useRef<HTMLFormElement>(null);
  const current = row.types[0] ?? "";
  const options = current && !cargoTypes.includes(current) ? [current, ...cargoTypes] : cargoTypes;

  return (
    <form ref={formRef} action={action} className="space-y-1">
      <input type="hidden" name="cargoId" value={row.cargoId} />
      <NativeSelect
        key={current}
        name="cargoType"
        defaultValue={current}
        aria-label={`${t(locale, "Cargo type for")} ${row.reference}`}
        className={cn("h-9 min-w-44", !current && "border-warning text-warning")}
        onChange={(event) => {
          if (event.currentTarget.value) formRef.current?.requestSubmit();
        }}
      >
        {!current ? <option value="">{t(locale, "Choose a type…")}</option> : null}
        {options.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </NativeSelect>
      {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
    </form>
  );
}

/** The rate, the book's beside it, and the door to the whole price. */
function RateCell({
  row,
  canEdit,
  vatPercent,
  locale,
}: {
  row: PriceListRow;
  canEdit: boolean;
  vatPercent: number;
  locale: Locale;
}) {
  const shown = (
    <div>
      <span className="tnum">
        {row.rate ? usd(row.rate) : row.blockedReason ? "—" : t(locale, "Mixed")}
      </span>
      {row.agreed ? (
        <span className="ml-2 inline-block rounded bg-brand/15 px-1 py-px text-[10px] font-semibold text-brand">
          {t(locale, "Special rate")}
        </span>
      ) : null}
      {row.agreed && row.standardRate ? (
        <span className="block text-xs text-muted-foreground">
          {t(locale, "Book")} {usd(row.standardRate)}
        </span>
      ) : null}
    </div>
  );

  if (!canEdit || row.blockedReason) return shown;

  return (
    <div className="flex flex-wrap items-start gap-2">
      {shown}
      <RowPriceEditor
        cargoId={row.cargoId}
        reference={row.reference}
        currency="USD"
        standardRate={row.standardRate === null ? null : Number(row.standardRate)}
        agreedRate={row.agreed && row.rate !== null ? Number(row.rate) : null}
        bookBasis={row.bookBasis}
        basis={row.basis}
        cbm={row.billableCbm === null ? null : Number(row.billableCbm)}
        weightKg={row.weightKg === null ? null : Number(row.weightKg)}
        freight={Number(row.freight)}
        extra={Number(row.extra)}
        discount={Number(row.discountOff)}
        vatPercent={vatPercent}
        locale={locale}
      />
    </div>
  );
}
