"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil } from "lucide-react";

import { saveInvoiceAdjustments } from "@/lib/actions/invoices";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { useT } from "@/components/app/locale-provider";
/**
 * ADJUST THIS INVOICE.
 *
 * Every figure a desk may correct on one card, shut until it is wanted: the rate
 * per CBM, storage, an additional charge, a discount, the exchange rate and the
 * note printed on the bill. Only what changed is sent, and one reason covers
 * the save — it is written against each change with the name of who made it.
 */
export function InvoiceEditor({
  invoiceId,
  appliedRate,
  standardRate,
  cbm,
  storage,
  discount,
  fxRate,
  notes,
  total,
}: {
  invoiceId: string;
  appliedRate: number | null;
  standardRate: number | null;
  cbm: number | null;
  storage: { configured: boolean; onBill: boolean; clock: string; chargeableDays: number };
  /** Already taken off, in dollars. */
  discount: number;
  fxRate: number | null;
  notes: string | null;
  total: number;
}) {
  const tx = useT();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<{ error?: string; ok?: string }, FormData>(saveInvoiceAdjustments, {});
  const [rate, setRate] = useState(appliedRate !== null ? appliedRate.toFixed(2) : "");
  const [fx, setFx] = useState(fxRate ? String(fxRate) : "");

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  const freight = cbm && Number(rate) > 0 ? Math.round(Number(rate) * cbm * 100) / 100 : null;

  return (
    <section className="rounded-xl border bg-card shadow-soft print:hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="font-semibold">{tx("Adjust this invoice")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {tx("Rate per CBM, storage, extra charges, discount, exchange rate and notes — before it is paid.")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            /* Taken from the bill each time it opens: the rate or the exchange
               rate may have been changed from another card since this one was
               last open, and saving a stale figure would put the old one back. */
            if (!open) {
              setRate(appliedRate !== null ? appliedRate.toFixed(2) : "");
              setFx(fxRate ? String(fxRate) : "");
            }
            setOpen((v) => !v);
          }}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand hover:underline"
        >
          <Pencil className="size-4" />
          {open ? "Close" : "Edit"}
        </button>
      </div>
      {state.ok && !open ? <p className="border-t px-5 py-2.5 text-sm text-success">{state.ok}</p> : null}

      {open ? (
        <form action={action} className="space-y-5 border-t px-5 py-5">
          <input type="hidden" name="invoiceId" value={invoiceId} />

          <div className="space-y-4 rounded-lg border p-4">
            <div className="space-y-1.5">
              <Label>{tx("Storage")}</Label>
              {storage.configured ? (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="storage" defaultChecked={storage.onBill} className="mt-0.5 size-4" />
                  <span>
                    {tx("Charge storage on this bill")}
                    <span className="block text-xs text-muted-foreground">
                      The clock says {storage.clock}
                      {storage.chargeableDays > 0 ? ` — ${storage.chargeableDays} day(s) past the free window` : " — still inside the free days"}.
                      Untick to waive it; either way it is recorded against your name.
                    </span>
                  </span>
                </label>
              ) : (
                <>
                  <input type="hidden" name="storage" value={storage.onBill ? "on" : ""} />
                  <p className="text-xs text-muted-foreground">{tx("No storage rate is set in Settings.")}</p>
                </>
              )}
            </div>

            <div className="space-y-1.5 border-t pt-4">
              <Label htmlFor="appliedRate">{tx("Sea freight rate (USD per CBM)")}</Label>
              <Input
                id="appliedRate"
                name="appliedRate"
                type="number"
                step="0.01"
                min={0}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="tnum h-11 font-mono"
              />
              <p className="text-xs text-muted-foreground">
                The rate book says {standardRate !== null ? `USD ${standardRate.toFixed(2)}` : "nothing recorded"}
                {freight !== null ? ` · ${Number(rate).toFixed(2)} × ${cbm!.toFixed(3)} CBM = USD ${freight.toFixed(2)} before VAT` : ""}.
                Anything else is recorded as a variance against the rate book, with your reason.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="additionalCharge">{tx("Additional charge (USD)")}</Label>
              <Input id="additionalCharge" name="additionalCharge" type="number" step="0.01" min={0} placeholder="0.00" className="tnum h-11 font-mono" />
              <Input name="chargeDescription" placeholder={tx("Repacking, special handling, delivery")} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="discount">{tx("Discount (USD)")}</Label>
              <Input id="discount" name="discount" type="number" step="0.01" min={0} max={total} placeholder="0.00" className="tnum h-11 font-mono" />
              <p className="text-xs text-muted-foreground">
                {discount > 0 ? `USD ${discount.toFixed(2)} already off. ` : ""}Added as its own line, against your name.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fxRate">{tx("Exchange rate (TZS per USD)")}</Label>
              <Input id="fxRate" name="fxRate" inputMode="decimal" value={fx} onChange={(e) => setFx(e.target.value)} className="tnum h-11 font-mono" />
              <p className="text-xs text-muted-foreground">{tx("Changes this invoice only. The dollar total does not move.")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-notes">{tx("Note on the invoice")}</Label>
              <Textarea id="invoice-notes" name="notes" defaultValue={notes ?? ""} placeholder={tx("Shown to the customer on the printed invoice.")} rows={3} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adjust-reason">{tx("Why")}</Label>
            <Input id="adjust-reason" name="reason" placeholder={tx("Agreed with the customer, re-measured, bank rate on the day…")} className="h-10" />
          </div>

          <FormMessage error={state.error} />
          <div className="flex items-center gap-3">
            <SubmitButton pendingLabel="Saving…">{tx("Save changes")}</SubmitButton>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">
              {tx("Cancel")}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
