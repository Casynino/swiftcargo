"use client";

import { useActionState, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import {
  updateCompanySettings,
  type ActionState,
} from "@/lib/actions/finance-config";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { t, type Locale } from "@/lib/i18n";

export type CompanySettingsValues = {
  name: string;
  tagline: string;
  chinaEntity: string;
  darEntity: string;
  tin: string;
  vrn: string;
  phone: string;
  altPhone: string;
  whatsapp: string;
  email: string;
  chinaAddress: string;
  darAddress: string;
  darPostal: string;
  vatPercent: string;
  pricesIncludeVat: boolean;
  freeStorageDays: number;
  storagePerDay: string;
  invoiceTerms: string;
};

/**
 * What every customer is told, and the numbers every bill is worked out with.
 *
 * Read before it is edited: each field says where it prints, because a
 * mistyped phone number or VAT rate is not a typo on this screen, it is a typo
 * on every document the company sends from the moment of saving.
 */
export function CompanySettingsForm({
  settings,
  locale,
}: {
  settings: CompanySettingsValues;
  locale: Locale;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    updateCompanySettings,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);
  /* Watched rather than read on save, so the terms warning below can say what
     is out of step while the figures are still being typed. */
  const [vat, setVat] = useState(settings.vatPercent);
  const [freeDays, setFreeDays] = useState(String(settings.freeStorageDays));
  const [perDay, setPerDay] = useState(settings.storagePerDay);
  const [terms, setTerms] = useState(settings.invoiceTerms);

  const stale = staleTerms(terms, { vat, freeDays, perDay });

  return (
    <form ref={formRef} action={action} className="space-y-6">
      <Panel
        title={t(locale, "The company")}
        hint={t(
          locale,
          "The name on every invoice, receipt, delivery note and packing list, the two companies behind it at each end, and the tax numbers printed on bills."
        )}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="name" label={t(locale, "Trading name")}>
            <Input id="name" name="name" required defaultValue={settings.name} className="h-11" />
          </Field>
          <Field id="tagline" label={t(locale, "Tagline")}>
            <Input id="tagline" name="tagline" defaultValue={settings.tagline} className="h-11" />
          </Field>
          <Field
            id="darEntity"
            label={t(locale, "Tanzania company")}
            hint={t(locale, "The legal company in Dar es Salaam, which the bank accounts are held in.")}
          >
            <Input id="darEntity" name="darEntity" defaultValue={settings.darEntity} className="h-11" />
          </Field>
          <Field
            id="chinaEntity"
            label={t(locale, "Guangzhou company")}
            hint={t(locale, "The legal company that receives in Guangzhou.")}
          >
            <Input id="chinaEntity" name="chinaEntity" defaultValue={settings.chinaEntity} className="h-11" />
          </Field>
          <Field id="tin" label={t(locale, "TIN")} hint={t(locale, "Printed under the name on every invoice.")}>
            <Input id="tin" name="tin" defaultValue={settings.tin} className="h-11" />
          </Field>
          <Field id="vrn" label={t(locale, "VRN")}>
            <Input id="vrn" name="vrn" defaultValue={settings.vrn} className="h-11" />
          </Field>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel
          title={t(locale, "Tanzania office")}
          hint={t(locale, "Where customers collect, as it is printed on the invoice.")}
        >
          <div className="space-y-4">
            <Field id="darAddress" label={t(locale, "Address")}>
              <Textarea id="darAddress" name="darAddress" rows={3} defaultValue={settings.darAddress} />
            </Field>
            <Field
              id="darPostal"
              label={t(locale, "Postal address")}
              hint={t(locale, "The P.O. Box, kept with the office address.")}
            >
              <Input id="darPostal" name="darPostal" defaultValue={settings.darPostal} className="h-11" />
            </Field>
          </div>
        </Panel>
        <Panel
          title={t(locale, "China office")}
          hint={t(
            locale,
            "Customers forward this to their supplier, so keep it in the script a driver in Baiyun can read."
          )}
        >
          <Field id="chinaAddress" label={t(locale, "Address")}>
            <Textarea id="chinaAddress" name="chinaAddress" rows={5} defaultValue={settings.chinaAddress} />
          </Field>
        </Panel>
      </div>

      <Panel
        title={t(locale, "Contact")}
        hint={t(locale, "On the invoice, the public site and the footer of every page customers see.")}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="phone" label={t(locale, "Phone")}>
            <Input id="phone" name="phone" defaultValue={settings.phone} className="h-11" />
          </Field>
          <Field id="altPhone" label={t(locale, "Second phone")}>
            <Input id="altPhone" name="altPhone" defaultValue={settings.altPhone} className="h-11" />
          </Field>
          <Field id="whatsapp" label={t(locale, "WhatsApp (digits only)")}>
            <Input
              id="whatsapp"
              name="whatsapp"
              inputMode="numeric"
              placeholder="255767852126"
              defaultValue={settings.whatsapp}
              className="h-11"
            />
          </Field>
          <Field id="email" label={t(locale, "Email")}>
            <Input id="email" name="email" type="email" defaultValue={settings.email} className="h-11" />
          </Field>
        </div>
      </Panel>

      <Panel
        title={t(locale, "Tax and storage")}
        hint={t(
          locale,
          "The figures bills are worked out with. Bills already issued keep the VAT they were raised at; storage is offered on a bill, never added by itself."
        )}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field id="vatPercent" label={t(locale, "VAT (%)")} hint={t(locale, "Applied to invoices raised from now on.")}>
            <Input
              id="vatPercent"
              name="vatPercent"
              type="number"
              step="0.01"
              min={0}
              max={100}
              required
              value={vat}
              onChange={(e) => setVat(e.target.value)}
              className="money-input h-11"
            />
            {/* Ticked: a rate of 380 is 380 on the bill, VAT inside it.
                Unticked: VAT is added on top. Bills already issued keep the
                way they were priced. */}
            <label className="mt-2 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="pricesIncludeVat"
                defaultChecked={settings.pricesIncludeVat}
                className="mt-0.5 size-4 shrink-0"
              />
              <span>{t(locale, "Our prices already include VAT — do not add it on top")}</span>
            </label>
          </Field>
          <Field
            id="freeStorageDays"
            label={t(locale, "Free storage days")}
            hint={t(locale, "How long cargo sits in Dar before storage starts to count.")}
          >
            <Input
              id="freeStorageDays"
              name="freeStorageDays"
              type="number"
              min={0}
              max={365}
              step={1}
              required
              value={freeDays}
              onChange={(e) => setFreeDays(e.target.value)}
              className="money-input h-11"
            />
          </Field>
          <Field
            id="storagePerDay"
            label={t(locale, "Storage per day (USD)")}
            hint={t(locale, "Per consignment, after the free days. Zero means storage is not charged.")}
          >
            <Input
              id="storagePerDay"
              name="storagePerDay"
              type="number"
              step="0.01"
              min={0}
              value={perDay}
              onChange={(e) => setPerDay(e.target.value)}
              className="money-input h-11"
            />
          </Field>
        </div>
      </Panel>

      <Panel
        title={t(locale, "Invoice terms")}
        hint={t(
          locale,
          "Printed under every invoice, one line each. While a daily storage rate is set the bill carries its own storage box, so a terms line about the storage fee is left off."
        )}
      >
        <Textarea
          id="invoiceTerms"
          name="invoiceTerms"
          rows={6}
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          aria-label={t(locale, "Invoice terms")}
        />
        {stale.length > 0 ? (
          <p className="mt-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
            {t(locale, "The terms still say")} {stale.join(", ")}.{" "}
            {t(locale, "Change the wording too, or the bill will contradict itself.")}
          </p>
        ) : null}
      </Panel>

      <FormMessage error={state.error} ok={state.ok} />

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <SubmitButton pendingLabel={t(locale, "Saving…")}>{t(locale, "Save settings")}</SubmitButton>
        <button
          type="button"
          onClick={() => {
            formRef.current?.reset();
            setVat(settings.vatPercent);
            setFreeDays(String(settings.freeStorageDays));
            setPerDay(settings.storagePerDay);
            setTerms(settings.invoiceTerms);
          }}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3.5" />
          {t(locale, "Undo my changes")}
        </button>
        <p className="text-xs text-muted-foreground">
          {t(
            locale,
            "Bills already issued keep their VAT and exchange rate — this changes what goes out from now on."
          )}
        </p>
      </div>
    </form>
  );
}

/**
 * Figures the terms state in words that no longer agree with the settings.
 *
 * The terms are free text somebody typed once, and "plus 18% VAT" does not
 * change itself when VAT does. Only the obvious phrasings are checked; this is
 * a prompt to reread, not a parser.
 */
function staleTerms(
  terms: string,
  now: { vat: string; freeDays: string; perDay: string }
): string[] {
  const out: string[] = [];
  const vat = /(\d+(?:\.\d+)?)\s*%\s*VAT/i.exec(terms);
  if (vat && now.vat !== "" && Number(now.vat) !== Number(vat[1])) out.push(`${vat[1]}% VAT`);
  /* While a daily rate is set the storage line is not printed, so it cannot
     contradict anything; with none set it prints and must agree. */
  if (Number(now.perDay) <= 0) {
    const fee = /\$\s*(\d+(?:\.\d+)?)\s*per day/i.exec(terms);
    if (fee) out.push(`$${fee[1]} per day`);
    const days = /after\s+(\d+)\s+days/i.exec(terms);
    if (days && Number(now.freeDays) !== Number(days[1])) out.push(`${days[1]} days`);
  }
  return out;
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-soft">
      <h2 className="font-semibold">{title}</h2>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
