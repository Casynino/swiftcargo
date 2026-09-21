"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, RotateCcw, Scale, X } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { repriceInvoice } from "@/lib/actions/invoices";
import {
  queryCountWithDar,
  savePriceListPrice,
  setPriceListCargoType,
  type PriceListState,
} from "@/lib/actions/price-list";
import { t, type Locale } from "@/lib/i18n";

import { Tx } from "@/components/app/tx";
/**
 * FIX ONE PRICE WITHOUT LEAVING THE LIST.
 *
 * The owner's flow, copied from the air side: read down a container, correct
 * the two or three lines that look wrong, confirm the rest in one press.
 * Sending the desk into the consignment and back for each correction breaks
 * that rhythm — by the fourth one they have lost their place in a list of
 * ninety.
 *
 * The rate book's own figure is shown beside the box and never replaced by it.
 * An agreed rate is a departure from the price list, so both figures survive on
 * the bill and the gap reads as what it is.
 *
 * IT OPENS OVER THE PAGE, NOT INSIDE THE ROW. A form that expands a table row
 * to the height of the form pushes every consignment under it off the screen —
 * correcting one price rearranges the list the desk is reading.
 */
export function RowPriceEditor({
  cargoId,
  reference,
  currency,
  standardRate,
  agreedRate,
  bookBasis,
  basis,
  cbm,
  weightKg,
  freight,
  extra,
  discount,
  vatPercent,
  locale,
  invoiceId = null,
  category = null,
  categories = [],
}: {
  /** The issued bill, when there is one: its category and volume are changed
      on it, the same way the Edit price dialog does everywhere else. */
  invoiceId?: string | null;
  /** The cargo's category now. */
  category?: string | null;
  /** The rate book's categories and their rate per CBM. */
  categories?: { name: string; rate: number }[];
  cargoId: string;
  reference: string;
  currency: string;
  /** The rate book's own rate, read off the draft rather than divided out. */
  standardRate: number | null;
  /** The rate somebody agreed for this consignment, where they have. */
  agreedRate: number | null;
  /** The unit the rate book prices this cargo in. */
  bookBasis: "PER_CBM" | "PER_KG" | "FLAT" | null;
  /** The unit the bill charges in now. Opens on it, so opening and saving
      changes nothing. */
  basis: "PER_CBM" | "PER_KG" | "FLAT" | null;
  /** What a per-CBM rate would be multiplied by — the billable volume. */
  cbm: number | null;
  /** What a per-kilo rate would be multiplied by. */
  weightKg: number | null;
  /** The freight on the bill as it stands. */
  freight: number;
  extra: number;
  discount: number;
  /** What the bill will add on top, so the preview is the figure that lands. */
  vatPercent: number;
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(category ?? "");
  const [volume, setVolume] = useState(cbm !== null ? cbm.toFixed(3) : "");
  /*
    CATEGORY AND VOLUME FIRST, THEN THE FIGURES.

    A new category or volume is applied to the bill before the rate, extra and
    discount are saved, so what is saved is priced on what the cargo now is —
    and the total the dialog showed is the total that lands.
  */
  const [state, action] = useActionState<PriceListState, FormData>(
    async (prev, fd) => {
      const categoryMoved = picked !== "" && picked !== (category ?? "");
      const volumeMoved =
        invoiceId !== null && !byWeight && volume.trim() !== "" && Math.abs(Number(volume) - (cbm ?? 0)) > 0.0005;
      if (categoryMoved || volumeMoved) {
        if (invoiceId) {
          const f = new FormData();
          f.set("invoiceId", invoiceId);
          f.set("rate", String(n(rate) || agreedRate || standardRate || 0));
          if (categoryMoved) f.set("category", picked);
          if (volumeMoved) f.set("cbm", volume);
          const done = await repriceInvoice({}, f);
          if (done.error) return { error: done.error };
        } else if (categoryMoved) {
          const f = new FormData();
          f.set("cargoId", cargoId);
          f.set("cargoType", picked);
          const done = await setPriceListCargoType({}, f);
          if (done.error) return { error: done.error };
        }
      }
      return savePriceListPrice(prev, fd);
    },
    {}
  );

  const bookByWeight = bookBasis === "PER_KG";
  const [byWeight, setByWeight] = useState(basis === "PER_KG");
  const [rate, setRate] = useState(agreedRate === null ? "" : String(agreedRate));
  const [typed, setTyped] = useState("");
  const [more, setMore] = useState(extra ? String(extra) : "");
  const [off, setOff] = useState(discount ? String(discount) : "");

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  const n = (v: string) => (v.trim() === "" ? 0 : Number(v) || 0);
  const unit = byWeight ? t(locale, "per kg") : t(locale, "per CBM");
  const bookUnit = bookByWeight ? t(locale, "per kg") : t(locale, "per CBM");
  /* Switched: a rate per cubic metre and a rate per kilo are not the same
     number and must not be compared as if they were. */
  const switched = byWeight !== bookByWeight;
  /* Both quantities are real, so the choice is honest to offer. */
  const canSwitch = (cbm ?? 0) > 0 && (weightKg ?? 0) > 0;
  const pricedOn =
    (byWeight ? weightKg : invoiceId && volume.trim() !== "" ? Number(volume) || 0 : cbm) ?? 0;

  /*
    EVERY OPENING STARTS FROM THE BILL.

    A desk that picked the other unit and closed the dialog would otherwise
    reopen on that unit with the boxes empty, and saving there — believing
    nothing had changed — would drop the agreed price.
  */
  const openEditor = () => {
    setByWeight(basis === "PER_KG");
    setRate(agreedRate === null ? "" : String(agreedRate));
    setTyped("");
    setMore(extra ? String(extra) : "");
    setOff(discount ? String(discount) : "");
    setPicked(category ?? "");
    setVolume(cbm !== null ? cbm.toFixed(3) : "");
    setOpen(true);
  };

  /* A typed rate wins over a typed total, exactly as it does on the server. */
  const fromRate =
    rate.trim() === "" ? null : Math.round(n(rate) * pricedOn * 100) / 100;
  const effectiveFreight =
    fromRate ?? (typed.trim() === "" ? freight : n(typed));
  const subtotal = effectiveFreight + n(more) - n(off);
  /* The dialog adds what the bill adds. `vatPercent` arrives as zero when the
     company's prices already contain VAT, and the preview is the price. */
  const vat = Math.round(subtotal * (vatPercent / 100) * 100) / 100;
  const preview = subtotal + vat;

  if (!open) {
    return (
      <button
        type="button"
        onClick={openEditor}
        /* A bordered control, not muted text with an icon in front of it: plain
           text beside a price column reads as a caption and gets skipped. */
        className="focus-ring inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full border bg-card px-2.5 text-xs font-medium shadow-sm transition-colors hover:bg-secondary hover:text-brand sm:h-7 sm:min-h-0"
      >
        <Pencil className="size-3.5" />
        {t(locale, "Edit")}
        {/* A consignment already carrying an agreed rate says so before it is
            opened: the only place on the list where that can be seen at a
            glance. */}
        {agreedRate !== null ? (
          <span className="rounded bg-brand/15 px-1 py-px text-[10px] font-semibold text-brand">
            {t(locale, "Special rate")}
          </span>
        ) : null}
        {agreedRate !== null && basis === "PER_KG" && !bookByWeight ? (
          <span className="rounded bg-warning/15 px-1 py-px text-[10px] font-semibold text-warning">
            {t(locale, "per kg")}
          </span>
        ) : null}
      </button>
    );
  }

  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl border bg-card p-4 text-left shadow-raised">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Scale className="size-4 shrink-0 text-brand" />
              {t(locale, "The price for this cargo")}
            </p>
            <p className="tnum mt-0.5 text-xs text-muted-foreground">{reference}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="focus-ring shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={t(locale, "Close")}
          >
            <X className="size-4" />
          </button>
        </div>

        <form action={action} className="space-y-3">
          <input type="hidden" name="cargoId" value={cargoId} />
          <input type="hidden" name="basis" value={byWeight ? "PER_KG" : "PER_CBM"} />

          {/* WHAT THIS CARGO IS PRICED AT, IN THREE LINES. Named the same way
              here as on the consignment, so a reader moving between the two
              screens reads one thing. */}
          <dl className="space-y-1 rounded-lg border bg-secondary/40 px-2.5 py-2 text-[11px]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">{t(locale, "Standard rate")}</dt>
              <dd className="tnum font-medium">
                {standardRate === null
                  ? t(locale, "not recorded")
                  : `${currency} ${standardRate.toFixed(2)} ${bookUnit}`}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">{t(locale, "Current rate")}</dt>
              <dd className="tnum font-medium">
                {agreedRate === null
                  ? standardRate === null
                    ? t(locale, "not recorded")
                    : `${currency} ${standardRate.toFixed(2)} ${bookUnit}`
                  : `${currency} ${agreedRate.toFixed(2)} ${
                      basis === "PER_KG" ? t(locale, "per kg") : t(locale, "per CBM")
                    }`}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">{t(locale, "Special rate")}</dt>
              <dd
                className={
                  agreedRate === null
                    ? "text-muted-foreground"
                    : "font-semibold text-brand"
                }
              >
                {agreedRate === null ? t(locale, "No") : t(locale, "Yes")}
              </dd>
            </div>
          </dl>

          {/* Kept, and told apart from the box above it. Changing the book is a
              decision about every consignment the company carries; the box is a
              decision about this one. */}
          <p className="text-[11px] text-muted-foreground">
            <a
              href="/app/finance/rates"
              className="text-brand underline underline-offset-2"
            >
              {t(locale, "Change the rate book")}
            </a>{" "}
            {t(locale, "— that price applies to every cargo, not just this one.")}
          </p>

          {/* WHAT IT IS AND HOW MUCH OF IT: the two things our prices move
              on besides the rate. A category brings its own book rate. */}
          {categories.length > 0 || invoiceId ? (
            <div className="grid grid-cols-2 gap-2">
              {categories.length > 0 ? (
                <label className="block space-y-0.5">
                  <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t(locale, "Category")}
                  </span>
                  <NativeSelect
                    value={picked}
                    onChange={(e) => {
                      setPicked(e.target.value);
                      const next = categories.find((c) => c.name === e.target.value);
                      if (next && !byWeight) {
                        setRate(next.rate.toFixed(2));
                        setTyped("");
                      }
                    }}
                    className="h-9"
                  >
                    {!picked ? <option value="">— none —</option> : null}
                    {categories.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} · USD {c.rate.toFixed(2)}
                      </option>
                    ))}
                    {picked && !categories.some((c) => c.name === picked) ? (
                      <option value={picked}>{picked}</option>
                    ) : null}
                  </NativeSelect>
                </label>
              ) : null}
              {invoiceId && !byWeight ? (
                <label className="block space-y-0.5">
                  <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t(locale, "Total CBM")}
                  </span>
                  <Input
                    type="number"
                    step="0.001"
                    min={0.001}
                    inputMode="decimal"
                    value={volume}
                    onChange={(e) => setVolume(e.target.value)}
                    className="tnum h-9"
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          {/* PER CUBIC METRE OR PER KILO, FOR THIS CONSIGNMENT ONLY. The
              quantities are printed on the buttons so the desk sees what the
              rate will be multiplied by before typing it. */}
          {canSwitch ? (
            <div className="space-y-1">
              <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                {t(locale, "Charge this cargo")}
              </span>
              <div className="flex rounded-lg border p-0.5">
                {[
                  {
                    key: false,
                    label: `${t(locale, "Per CBM")} · ${(cbm ?? 0).toFixed(3)} CBM`,
                  },
                  {
                    key: true,
                    label: `${t(locale, "Per kg")} · ${(weightKg ?? 0).toFixed(2)} kg`,
                  },
                ].map((option) => (
                  <button
                    key={String(option.key)}
                    type="button"
                    onClick={() => {
                      if (option.key !== byWeight) {
                        /* A rate agreed in one unit is not a rate in the other.
                           Clearing it makes the desk type the figure that was
                           actually agreed, instead of carrying 380 a cubic
                           metre across as 380 a kilo. */
                        setRate("");
                        setTyped("");
                      }
                      setByWeight(option.key);
                    }}
                    className={
                      "focus-ring flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors " +
                      (byWeight === option.key
                        ? "bg-brand text-brand-foreground"
                        : "text-muted-foreground hover:bg-secondary")
                    }
                  >
                    <Tx>{option.label}</Tx>
                  </button>
                ))}
              </div>
              {switched ? (
                <p className="text-[11px] text-warning">
                  {t(locale, "The rate book prices this")} {bookUnit}.{" "}
                  {t(locale, "This changes it for this consignment only.")}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* THE RATE, ON ITS OWN LINE, ABOVE THE TOTAL IT PRODUCES. The
              owner's flow is to type the rate agreed with the customer and let
              the freight follow, rather than multiplying it in their head. */}
          {pricedOn > 0 ? (
            <label className="block space-y-0.5">
              <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                {t(locale, "Freight rate")} {unit}
              </span>
              <Input
                name="rate"
                inputMode="decimal"
                value={rate}
                onChange={(event) => {
                  setRate(event.target.value);
                  /* The freight box is the derived figure while a rate is
                     typed; clearing the rate hands it back. */
                  setTyped("");
                }}
                placeholder={
                  standardRate === null || switched ? "" : standardRate.toFixed(2)
                }
                aria-label={`${t(locale, "Freight rate for")} ${reference}`}
              />
              <span className="block text-[11px] text-muted-foreground">
                {rate.trim() === "" && switched ? (
                  <span className="text-warning">
                    {t(locale, "Type the rate agreed")} {unit}.{" "}
                    {t(locale, "To price this cargo from the rate book again, choose")}{" "}
                    {bookUnit}.
                  </span>
                ) : rate.trim() === "" ? (
                  t(locale, "Leave it empty to price this cargo from the rate book.")
                ) : (
                  <span className="tnum">
                    {n(rate).toFixed(2)} ×{" "}
                    {byWeight
                      ? `${pricedOn.toFixed(2)} kg`
                      : `${pricedOn.toFixed(3)} CBM`}{" "}
                    ={" "}
                    <span className="font-semibold text-foreground">
                      {currency} {(fromRate ?? 0).toFixed(2)}
                    </span>
                    {!switched &&
                    standardRate !== null &&
                    Math.abs(standardRate - n(rate)) > 0.005 ? (
                      <>
                        {" · "}
                        <span
                          className={
                            standardRate - n(rate) > 0
                              ? "text-success"
                              : "text-warning"
                          }
                        >
                          {standardRate - n(rate) > 0 ? "−" : "+"}
                          {currency} {Math.abs(standardRate - n(rate)).toFixed(2)}{" "}
                          {unit} {t(locale, "against the book")}
                        </span>
                      </>
                    ) : null}
                  </span>
                )}
              </span>
            </label>
          ) : null}

          <div className="flex gap-2">
            {[
              {
                name: "freight",
                label: t(locale, "Freight"),
                value: fromRate === null ? typed : fromRate.toFixed(2),
                set: (v: string) => {
                  setTyped(v);
                  /* A total typed by hand is not a rate anybody agreed. */
                  setRate("");
                },
                placeholder: freight.toFixed(2),
              },
              {
                name: "extra",
                label: t(locale, "Extra"),
                value: more,
                set: setMore,
                placeholder: "0.00",
              },
              {
                name: "discount",
                label: t(locale, "Discount"),
                value: off,
                set: setOff,
                placeholder: "0.00",
              },
            ].map((box) => (
              <label key={box.name} className="flex-1 space-y-1">
                <span className="block text-xs font-medium text-muted-foreground">
                  <Tx>{box.label}</Tx>
                </span>
                <Input
                  name={box.name}
                  inputMode="decimal"
                  value={box.value}
                  onChange={(event) => box.set(event.target.value)}
                  placeholder={box.placeholder}
                  aria-label={`$<Tx>{box.label}</Tx> — ${reference}`}
                />
              </label>
            ))}
          </div>

          <div className="space-y-1">
            <Label htmlFor={`why-${cargoId}`} className="text-xs">
              {t(locale, "Note")}{" "}
              <span className="text-muted-foreground">{t(locale, "(optional)")}</span>
            </Label>
            <Input
              id={`why-${cargoId}`}
              name="reason"
              placeholder={t(locale, "e.g. agreed on the phone with the customer")}
              className="h-8 text-sm"
            />
          </div>

          {/* What the bill comes to, added up in front of the desk, above the
              press that commits it. */}
          <p className="tnum rounded-lg border bg-secondary/40 px-2.5 py-2 text-xs">
            <span className="text-muted-foreground">
              {effectiveFreight.toFixed(2)}
              {n(more) > 0 ? ` + ${n(more).toFixed(2)}` : ""}
              {n(off) > 0 ? ` − ${n(off).toFixed(2)}` : ""}
              {vat > 0 ? ` + ${vat.toFixed(2)} ${t(locale, "VAT")}` : ""} ={" "}
            </span>
            <span className="font-semibold text-foreground">
              {currency} {preview.toFixed(2)}
            </span>
          </p>

          <div className="flex items-center gap-2">
            <SubmitButton
              size="sm"
              variant="accent"
              pendingLabel={t(locale, "Saving…")}
              disabled={switched && rate.trim() === "" && typed.trim() === ""}
            >
              {t(locale, "Save the price")}
            </SubmitButton>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="focus-ring rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {t(locale, "Leave it")}
            </button>
          </div>

          <FormMessage error={state.error} ok={state.ok} />
        </form>

        <QueryTheCount cargoId={cargoId} reference={reference} locale={locale} />
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(dialog, document.body);
}

/**
 * THE OTHER ANSWER TO A PRICE THAT LOOKS WRONG.
 *
 * Every box above this one changes what is charged. None of them changes the
 * volume, the weight or the count, because those are the warehouse's figures
 * and a desk reading money is not the desk that can see the boxes. When the
 * measurement itself is what looks wrong, the honest move is to send it back —
 * so it sits here, behind one line, under the prices rather than beside them.
 */
function QueryTheCount({
  cargoId,
  reference,
  locale,
}: {
  cargoId: string;
  reference: string;
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<PriceListState, FormData>(
    queryCountWithDar,
    {}
  );

  if (!open) {
    return (
      <div className="mt-3 border-t pt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="focus-ring inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground underline-offset-2 hover:text-warning hover:underline"
        >
          <RotateCcw className="size-3.5" />
          {t(locale, "The measurement looks wrong — send it back to Dar")}
        </button>
        <FormMessage error={state.error} ok={state.ok} />
      </div>
    );
  }

  return (
    <form action={action} className="mt-3 space-y-2 border-t pt-3">
      <input type="hidden" name="cargoId" value={cargoId} />
      <p className="text-xs text-muted-foreground">
        {t(
          locale,
          "Dar's signature comes off the count and a case goes to the floor. It is priced again once they have re-checked it."
        )}
      </p>
      <label className="block space-y-1">
        <span className="block text-xs font-medium text-muted-foreground">
          {t(locale, "What looks wrong")}
        </span>
        <NativeSelect
          name="kind"
          defaultValue="CBM_DIFFERENCE"
          className="h-8 text-sm"
          aria-label={`${t(locale, "What looks wrong")} — ${reference}`}
        >
          <option value="CBM_DIFFERENCE">{t(locale, "The volume")}</option>
          <option value="WEIGHT_DIFFERENCE">{t(locale, "The weight")}</option>
          <option value="PACKAGE_MISMATCH">{t(locale, "The package count")}</option>
          <option value="OTHER">{t(locale, "Something else")}</option>
        </NativeSelect>
      </label>
      <Input
        name="reason"
        placeholder={t(locale, "e.g. 6 CBM for four cartons cannot be right")}
        className="h-8 text-sm"
        aria-label={`${t(locale, "Why")} — ${reference}`}
      />
      <div className="flex items-center gap-2">
        <SubmitButton size="sm" variant="ghost" pendingLabel={t(locale, "Sending…")}>
          {t(locale, "Send it back to Dar")}
        </SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="focus-ring rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {t(locale, "Leave it")}
        </button>
      </div>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
