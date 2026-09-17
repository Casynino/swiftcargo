"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

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

export type CalculatorRate = {
  id: string;
  cargoType: string;
  rate: number;
  currency: string;
  minimumCbm: number | null;
};

const blank = (id: number): Line => ({
  id,
  length: "",
  width: "",
  height: "",
  quantity: "1",
});

/**
 * The public CBM calculator.
 *
 * The volume comes from lib/cbm.ts — the same function the Guangzhou counter
 * uses, rounded the same way — so a customer who works out 1.152 m³ at home is
 * not told something else at the counter for any reason but the tape measure.
 *
 * The price is per cargo type, because that is how the rate book charges: two
 * hundred cartons of shoes and a machine are not the same money per cubic
 * metre. No type chosen, no price — a figure at some house average would be
 * the number a customer remembers and the invoice would not match it.
 *
 * It calls no server action: the whole point is that it answers instantly while
 * somebody is standing over a pile of boxes with a tape measure.
 */
export function CbmCalculator({ rates }: { rates: CalculatorRate[] }) {
  const locale = DEFAULT_LOCALE;
  const [unit, setUnit] = useState<"CM" | "M">("CM");
  const [lines, setLines] = useState<Line[]>([blank(1)]);
  const [nextId, setNextId] = useState(2);
  const [rateId, setRateId] = useState("");

  const chosen = rates.find((r) => r.id === rateId) ?? null;

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

    const cbm = perLine.reduce((sum, v) => sum + v, 0);
    const minimum = chosen?.minimumCbm ?? null;
    const atMinimum = !!minimum && cbm > 0 && cbm < minimum;
    const billable = atMinimum ? minimum! : cbm;
    return {
      perLine,
      cbm,
      billable,
      atMinimum,
      estimate: chosen && cbm > 0 ? billable * chosen.rate : null,
    };
  }, [lines, unit, chosen]);

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
                {totals.perLine[index].toFixed(3)} m³
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
              m³
            </span>
          </p>

          {rates.length > 0 ? (
            <div className="mt-5 space-y-2 border-t pt-5">
              <Label htmlFor="cargoType">{t(locale, "What are you shipping?")}</Label>
              <NativeSelect
                id="cargoType"
                value={rateId}
                onChange={(e) => setRateId(e.target.value)}
              >
                <option value="">{t(locale, "Choose a cargo type")}</option>
                {rates.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.cargoType}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}

          {totals.atMinimum && chosen?.minimumCbm ? (
            <p className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
              {t(locale, "Below the minimum of")} {chosen.minimumCbm.toFixed(2)} m³.{" "}
              {t(locale, "You would be charged for")} {totals.billable.toFixed(3)} m³.
            </p>
          ) : null}

          {chosen && totals.estimate !== null ? (
            <div className="mt-5 border-t pt-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t(locale, "Estimated freight")}
              </p>
              <p className="tnum mt-1.5 text-2xl font-semibold text-brand">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: chosen.currency,
                }).format(totals.estimate)}
              </p>
              <p className="tnum mt-1 text-xs text-muted-foreground">
                {chosen.cargoType} · {chosen.currency} {chosen.rate}/m³
              </p>
            </div>
          ) : null}

          <p className="mt-5 border-t pt-5 text-xs leading-relaxed text-muted-foreground">
            {t(
              locale,
              "This is an estimate. Final charges are based on the measurements taken at our warehouse, the cargo type, and any duty, VAT and clearing costs."
            )}
          </p>
        </Card>
      </div>
    </div>
  );
}
