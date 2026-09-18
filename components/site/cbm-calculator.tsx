"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { estimateFreight, type EstimateState } from "@/lib/actions/estimate";
import { ESTIMATE_CAVEAT, FX_CAVEAT } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cbmNumber } from "@/lib/cbm";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";

type Line = {
  id: number;
  length: string;
  width: string;
  height: string;
  quantity: string;
};

/**
 * A row of the rate book, as the page read it.
 *
 * The rate and the minimum are strings, not numbers: they are Decimals in the
 * database and they are only ever displayed here. Nothing in this file
 * multiplies them — see lib/public-estimate.ts, which is where the money is
 * worked out, on the server, in Decimal.
 */
export type CalculatorRate = {
  cargoType: string;
  rate: string;
  currency: string;
  minimumCbm: string | null;
};

const blank = (id: number): Line => ({
  id,
  length: "",
  width: "",
  height: "",
  quantity: "1",
});

/**
 * THE PUBLIC CBM CALCULATOR.
 *
 * The volume comes from lib/cbm.ts — the same function the Guangzhou counter
 * uses, rounded the same way — so a customer who works out 1.152 m³ at home is
 * not told something else at the counter for any reason but the tape measure.
 * That much happens as they type, because they are standing over a pile of
 * boxes.
 *
 * THE MONEY DOES NOT HAPPEN HERE. Pressing the button asks the server, which
 * prices the volume off the live rate book in Decimal, applies the minimum the
 * invoice would apply, adds VAT at the configured percentage and converts at
 * the exchange-rate row Finance has published. A price multiplied out in a
 * browser is a price that can disagree with the bill, and the figure a customer
 * remembers is the one the website gave them.
 *
 * The price is per cargo type, because that is how the rate book charges: two
 * hundred cartons of shoes and a machine are not the same money per cubic
 * metre. A type the book cannot price says the team will quote, and never
 * invents a figure.
 */
export function CbmCalculator({ rates }: { rates: CalculatorRate[] }) {
  const locale = DEFAULT_LOCALE;
  const [unit, setUnit] = useState<"CM" | "M">("CM");
  const [lines, setLines] = useState<Line[]>([blank(1)]);
  const [nextId, setNextId] = useState(2);
  const [cargoType, setCargoType] = useState("");

  const [state, price, pending] = useActionState<EstimateState, FormData>(
    estimateFreight,
    {}
  );
  const [, startTransition] = useTransition();

  const chosen = rates.find((r) => r.cargoType === cargoType) ?? null;

  const totals = useMemo(() => {
    const perLine = lines.map((line) => {
      const quantity = Number(line.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) return 0;
      const value = cbmNumber({
        length: line.length || null,
        width: line.width || null,
        height: line.height || null,
        quantity: Math.floor(quantity),
        unit,
      });
      return value && value > 0 ? value : 0;
    });

    return { perLine, cbm: perLine.reduce((sum, v) => sum + v, 0) };
  }, [lines, unit]);

  /* A figure worked out for one volume must not sit under a different one, so
     the answer is stamped with what was asked and hidden the moment the boxes
     or the goods change. Somebody who adds a carton and does not press again
     would otherwise be reading a price for the pile they had before. */
  const [pricedFor, setPricedFor] = useState<string | null>(null);
  const key = `${totals.cbm.toFixed(3)}:${cargoType}`;
  const current = pricedFor === key;
  const answer = current ? state.estimate : undefined;

  const update = (id: number, field: keyof Line, value: string) =>
    setLines((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );

  const labels: Record<"length" | "width" | "height", string> = {
    length: t(locale, "Length"),
    width: t(locale, "Width"),
    height: t(locale, "Height"),
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="min-w-0 space-y-4 lg:col-span-2">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="w-44 space-y-2">
            <Label htmlFor="unit">{t(locale, "Measured in")}</Label>
            <NativeSelect
              id="unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as "CM" | "M")}
            >
              <option value="CM">{t(locale, "Centimetres")}</option>
              <option value="M">{t(locale, "Metres")}</option>
            </NativeSelect>
          </div>
          <p className="pb-2.5 text-xs text-muted-foreground">
            {t(locale, "Get this wrong and the answer is out by a million.")}
          </p>
        </div>

        {lines.map((line, index) => (
          <Card key={line.id} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {t(locale, "Item")} {index + 1}
              </p>
              {lines.length > 1 ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${t(locale, "Remove item")} ${index + 1}`}
                  onClick={() =>
                    setLines((rows) => rows.filter((r) => r.id !== line.id))
                  }
                >
                  <Trash2 />
                </Button>
              ) : null}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(["length", "width", "height"] as const).map((field) => (
                <div key={field} className="space-y-1.5">
                  <Label htmlFor={`${field}-${line.id}`}>
                    {labels[field]} ({unit === "CM" ? "cm" : "m"})
                  </Label>
                  <Input
                    id={`${field}-${line.id}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={line[field]}
                    onChange={(e) => update(line.id, field, e.target.value)}
                  />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label htmlFor={`qty-${line.id}`}>{t(locale, "Boxes")}</Label>
                <Input
                  id={`qty-${line.id}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={line.quantity}
                  onChange={(e) => update(line.id, "quantity", e.target.value)}
                />
              </div>
            </div>

            {totals.perLine[index] > 0 ? (
              <p className="tnum mt-3 text-sm text-muted-foreground">
                {totals.perLine[index].toFixed(3)} CBM
              </p>
            ) : null}
          </Card>
        ))}

        <Button
          variant="outline"
          onClick={() => {
            setLines((rows) => [...rows, blank(nextId)]);
            setNextId((n) => n + 1);
          }}
        >
          <Plus />
          {t(locale, "Add another item")}
        </Button>
      </div>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <Card className="p-6" aria-live="polite">
          <p className="eyebrow text-marine">{t(locale, "Your total")}</p>
          <p className="tnum mt-3 text-4xl font-semibold tracking-tight">
            {totals.cbm.toFixed(3)}
            <span className="ml-1.5 text-lg font-medium text-muted-foreground">
              CBM
            </span>
          </p>

          {rates.length > 0 ? (
            <div className="mt-5 space-y-2 border-t pt-5">
              <Label htmlFor="cargoType">{t(locale, "What are you shipping?")}</Label>
              <NativeSelect
                id="cargoType"
                value={cargoType}
                onChange={(e) => setCargoType(e.target.value)}
              >
                <option value="">{t(locale, "Choose a cargo type")}</option>
                {rates.map((r) => (
                  <option key={r.cargoType} value={r.cargoType}>
                    {r.cargoType}
                  </option>
                ))}
              </NativeSelect>
              {chosen ? (
                <p className="tnum text-xs text-muted-foreground">
                  {chosen.currency} {chosen.rate}/CBM
                  {chosen.minimumCbm
                    ? ` · ${t(locale, "minimum")} ${chosen.minimumCbm} CBM`
                    : ""}
                </p>
              ) : null}
            </div>
          ) : null}

          <Button
            className="mt-5 w-full"
            disabled={pending || totals.cbm <= 0}
            onClick={() => {
              const data = new FormData();
              data.set("cbm", totals.cbm.toFixed(4));
              if (cargoType) data.set("cargoType", cargoType);
              setPricedFor(key);
              startTransition(() => price(data));
            }}
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            {pending ? t(locale, "Working it out…") : t(locale, "Estimate the cost")}
          </Button>

          {state.error && current ? (
            <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {state.error}
            </p>
          ) : null}

          {answer?.kind === "quote-required" ? (
            <div className="mt-5 border-t pt-5">
              <p className="text-sm font-medium">
                {t(locale, "We will quote this one by hand")}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {t(
                  locale,
                  "There is no standing rate for this cargo, so our team will look at it and come back to you with a price."
                )}
              </p>
            </div>
          ) : null}

          {answer?.kind === "priced" ? (
            <div className="mt-5 space-y-3 border-t pt-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t(locale, "Estimated shipping charge")}
              </p>
              <p className="tnum text-2xl font-semibold text-brand">{answer.total}</p>
              {answer.totalTzs ? (
                <p className="tnum text-sm text-muted-foreground">
                  ≈ {answer.totalTzs}
                </p>
              ) : null}
              <dl className="tnum space-y-1 text-xs text-muted-foreground">
                {answer.lines.map((line) => (
                  <div key={line.label} className="flex justify-between gap-3">
                    <dt>{t(locale, line.label)}</dt>
                    <dd>{line.amount}</dd>
                  </div>
                ))}
              </dl>
              <p className="tnum text-xs text-muted-foreground">{answer.explanation}</p>
              {answer.minimumApplied && answer.billableCbm ? (
                <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                  {t(locale, "Below the minimum — you would be charged for")}{" "}
                  {answer.billableCbm} CBM.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">{t(locale, FX_CAVEAT)}</p>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link
                  href={`/book?service=SHARED_CARGO&cbm=${totals.cbm.toFixed(3)}${
                    cargoType ? `&commodity=${encodeURIComponent(cargoType)}` : ""
                  }`}
                >
                  {t(locale, "Request a booking")}
                </Link>
              </Button>
            </div>
          ) : null}

          <p className="mt-5 border-t pt-5 text-xs leading-relaxed text-muted-foreground">
            {t(locale, ESTIMATE_CAVEAT)}
          </p>
        </Card>
      </div>
    </div>
  );
}
