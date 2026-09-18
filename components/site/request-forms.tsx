"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import {
  submitBooking,
  submitPickupRequest,
  submitQuoteRequest,
  type ActionState,
} from "@/lib/actions/requests";
import { FormMessage } from "@/components/app/form-message";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";

const locale = DEFAULT_LOCALE;

/* A date input's floor. Yesterday's readiness date is a typing slip, and the
   server refuses one anyway — this is so the browser argues first. */
const TODAY = new Date().toISOString().slice(0, 10);

function Optional() {
  return (
    <span className="font-normal text-muted-foreground">({t(locale, "optional")})</span>
  );
}

/**
 * A run of fields under a heading.
 *
 * These forms ask for a lot, and a wall of twenty inputs is a form people
 * abandon. Grouping them the way somebody thinks about the job — who, where,
 * what, how — is the difference between a long form and an unanswerable one.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 border-t pt-5 first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <p className="text-sm font-semibold">{title}</p>
      {children}
    </fieldset>
  );
}

function Done({ message }: { message: string }) {
  return (
    <Card className="border-success/30 bg-success/5 p-7 text-center" role="status">
      <CheckCircle2 className="mx-auto size-8 text-success" />
      <p className="mt-4 font-medium">{message}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/">{t(locale, "Back to the home page")}</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/track">{t(locale, "Track cargo")}</Link>
        </Button>
      </div>
    </Card>
  );
}

/**
 * The shared frame of the three website forms.
 *
 * Submits by hand rather than through `<form action>`, because React clears an
 * action form once the action returns — so a visitor told "enter a phone
 * number we can call" would find every other field they typed wiped as well,
 * and most of them would not type it all again.
 *
 * The button is disabled from the first press until the answer comes back, and
 * the server treats the same request inside a few minutes as the one it already
 * has. The hidden field is for scripts; a person never sees or fills it.
 */
function PublicForm({
  action,
  submitLabel,
  children,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  children: React.ReactNode;
}) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(action, {});
  const [, startTransition] = useTransition();
  /* Set on the first press and cleared only when an answer arrives, so a
     double tap before React has re-rendered is still one submission. */
  const busy = useRef(false);
  useEffect(() => {
    busy.current = false;
  }, [state]);

  if (state.ok) return <Done message={state.ok} />;

  return (
    <Card className="p-5 sm:p-7">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (pending || busy.current) return;
          busy.current = true;
          const data = new FormData(event.currentTarget);
          startTransition(() => dispatch(data));
        }}
        className="space-y-5"
      >
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>

        {children}

        <FormMessage error={state.error} />
        <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
          {pending ? <Loader2 className="animate-spin" /> : null}
          {pending ? t(locale, "Sending…") : submitLabel}
        </Button>
      </form>
    </Card>
  );
}

export function QuoteForm() {
  return (
    <PublicForm action={submitQuoteRequest} submitLabel={t(locale, "Request a quote")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="q-contactName">{t(locale, "Your name")}</Label>
          <Input id="q-contactName" name="contactName" required maxLength={120} autoComplete="name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="q-contactPhone">{t(locale, "Phone")}</Label>
          <Input
            id="q-contactPhone"
            name="contactPhone"
            type="tel"
            required
            maxLength={40}
            autoComplete="tel"
            inputMode="tel"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="q-contactEmail">
            {t(locale, "Email")}{" "}
            <span className="font-normal text-muted-foreground">({t(locale, "optional")})</span>
          </Label>
          <Input id="q-contactEmail" name="contactEmail" type="email" maxLength={200} autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="q-service">{t(locale, "Service")}</Label>
          <NativeSelect id="q-service" name="service" defaultValue="LCL">
            <option value="LCL">{t(locale, "Loose cargo (shared container)")}</option>
            <option value="FCL">{t(locale, "Full container")}</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="q-commodity">{t(locale, "What are you shipping?")}</Label>
          <Input id="q-commodity" name="commodity" maxLength={200} placeholder={t(locale, "Shoes, electronics…")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="q-originCity">{t(locale, "Collecting from")}</Label>
          <Input id="q-originCity" name="originCity" maxLength={200} defaultValue="Guangzhou" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="q-estimatedCbm">{t(locale, "Estimated volume (CBM)")}</Label>
          <Input id="q-estimatedCbm" name="estimatedCbm" type="number" inputMode="decimal" step="0.001" min={0} max={10000} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="q-estimatedWeightKg">{t(locale, "Estimated weight (kg)")}</Label>
          <Input id="q-estimatedWeightKg" name="estimatedWeightKg" type="number" inputMode="decimal" step="0.01" min={0} />
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="hazardous" className="size-4" />
          {t(locale, "Dangerous or restricted goods")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="fragile" className="size-4" />
          {t(locale, "Fragile")}
        </label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="q-notes">{t(locale, "Anything else?")}</Label>
        <Textarea id="q-notes" name="notes" rows={3} maxLength={2000} />
      </div>
    </PublicForm>
  );
}


/**
 * THE CHINA COLLECTION FORM.
 *
 * Everything the Guangzhou floor needs before it sends a van: who is asking,
 * which factory, where, when, and roughly what is waiting. Every measurement on
 * it is the customer's estimate and is labelled as one — the counter measures
 * when the boxes land, and nothing typed here becomes a receiving record.
 *
 * `cargoTypes` are the rate book's own categories, offered as suggestions
 * rather than a closed list: the floor would rather be told "engine parts" than
 * be given "General" because nothing else fitted.
 */
export function PickupForm({ cargoTypes = [] }: { cargoTypes?: string[] }) {
  return (
    <PublicForm action={submitPickupRequest} submitLabel={t(locale, "Request a pickup")}>
      <Section title={t(locale, "Who we are collecting for")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="p-contactName">{t(locale, "Your name")}</Label>
            <Input id="p-contactName" name="contactName" required maxLength={120} autoComplete="name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-contactPhone">{t(locale, "Phone")}</Label>
            <Input
              id="p-contactPhone"
              name="contactPhone"
              type="tel"
              inputMode="tel"
              required
              maxLength={40}
              autoComplete="tel"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-contactWhatsapp">
              {t(locale, "WhatsApp")} <Optional />
            </Label>
            <Input id="p-contactWhatsapp" name="contactWhatsapp" type="tel" inputMode="tel" maxLength={40} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-contactEmail">
              {t(locale, "Email")} <Optional />
            </Label>
            <Input id="p-contactEmail" name="contactEmail" type="email" maxLength={200} autoComplete="email" />
          </div>
        </div>
      </Section>

      <Section title={t(locale, "Where in China")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="p-supplierName">
              {t(locale, "Supplier or factory")} <Optional />
            </Label>
            <Input id="p-supplierName" name="supplierName" maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-supplierContact">
              {t(locale, "Who to ask for, and their number")} <Optional />
            </Label>
            <Input id="p-supplierContact" name="supplierContact" maxLength={120} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="p-pickupLocation">{t(locale, "Collection address")}</Label>
            <Input
              id="p-pickupLocation"
              name="pickupLocation"
              required
              maxLength={300}
              placeholder={t(locale, "Building, street and district")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-city">{t(locale, "City")}</Label>
            <Input id="p-city" name="city" maxLength={200} defaultValue="Guangzhou" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-preferredDate">{t(locale, "Ready for collection on")}</Label>
            <Input id="p-preferredDate" name="preferredDate" type="date" min={TODAY} max="2099-12-31" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-preferredTime">
              {t(locale, "Preferred time")} <Optional />
            </Label>
            <Input id="p-preferredTime" name="preferredTime" maxLength={60} placeholder={t(locale, "Morning")} />
          </div>
        </div>
      </Section>

      <Section title={t(locale, "What is waiting")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="p-commodity">{t(locale, "Cargo category")}</Label>
            <Input
              id="p-commodity"
              name="commodity"
              maxLength={200}
              list="pickup-cargo-types"
              placeholder={t(locale, "Shoes, electronics, machinery…")}
            />
            <datalist id="pickup-cargo-types">
              {cargoTypes.map((type) => (
                <option key={type} value={type} />
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-shippingMark">
              {t(locale, "Shipping mark")} <Optional />
            </Label>
            <Input id="p-shippingMark" name="shippingMark" maxLength={120} placeholder={t(locale, "What is written on the boxes")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-packages">{t(locale, "Packages")}</Label>
            <Input id="p-packages" name="packages" type="number" inputMode="numeric" min={0} step={1} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-estimatedCbm">{t(locale, "Estimated volume (CBM)")}</Label>
            <Input id="p-estimatedCbm" name="estimatedCbm" type="number" inputMode="decimal" step="0.001" min={0} max={10000} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-estimatedWeightKg">{t(locale, "Estimated weight (kg)")}</Label>
            <Input id="p-estimatedWeightKg" name="estimatedWeightKg" type="number" inputMode="decimal" step="0.01" min={0} />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="p-cargoDescription">{t(locale, "Describe the cargo")}</Label>
          <Textarea id="p-cargoDescription" name="cargoDescription" rows={3} maxLength={2000} />
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="p-notes">
            {t(locale, "Anything else we should know")} <Optional />
          </Label>
          <Textarea id="p-notes" name="notes" rows={2} maxLength={2000} />
        </div>
      </Section>

      <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
        {t(
          locale,
          "Have a proforma, a packing list or photographs? Send them to us on WhatsApp with your reference once you have it — we will put them on the job."
        )}
      </p>

      <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
        {t(
          locale,
          "This is a request. Nothing is scheduled until we have spoken to you and confirmed the collection, and the measurements above are yours until our counter takes the goods in."
        )}
      </p>
    </PublicForm>
  );
}

/** One sailing, as the booking form offers it. */
export type SailingOption = {
  /** The Monday, as a date string. What the form posts. */
  weekOf: string;
  label: string;
};

export type BookingDefaults = {
  service?: string;
  sailing?: string;
  commodity?: string;
  cbm?: string;
};

const SERVICES = [
  ["SHARED_CARGO", "Loose cargo — shared container", "Priced by the cubic metre off our rate book."],
  ["FULL_CONTAINER", "Full container — the whole box", "Your own 20ft, 40ft or high cube."],
  ["SPECIAL_CARGO", "Special cargo — out of gauge, heavy or delicate", "Machines, vehicles, anything that needs looking at."],
  ["CUSTOMS_CLEARANCE", "Customs clearance only", "Your container, our clearing agents at Dar."],
] as const;

type Service = (typeof SERVICES)[number][0];

/**
 * THE FOUR SERVICES, ON ONE FORM.
 *
 * A customer does not know which of our four forms they need; they know what
 * they have. So the service is the first question and the form changes under
 * it — a clearance job is never asked for a cubic metre, and special cargo is
 * never shown a price. Whatever the service, one submission, one queue, one
 * reference.
 *
 * Every field the server writes is named on the server. Nothing here can set a
 * status, a price or a customer, whatever is posted.
 */
export function BookingForm({
  sailings = [],
  cargoTypes = [],
  defaults = {},
}: {
  sailings?: SailingOption[];
  cargoTypes?: string[];
  defaults?: BookingDefaults;
}) {
  const initial = SERVICES.some(([value]) => value === defaults.service)
    ? (defaults.service as Service)
    : "SHARED_CARGO";
  const [service, setService] = useState<Service>(initial);

  const freight = service !== "CUSTOMS_CLEARANCE";
  const chosen = SERVICES.find(([value]) => value === service)!;

  return (
    <PublicForm action={submitBooking} submitLabel={t(locale, "Submit request")}>
      <Section title={t(locale, "What do you need?")}>
        <NativeSelect
          id="b-type"
          name="type"
          value={service}
          onChange={(e) => setService(e.target.value as Service)}
          aria-label={t(locale, "Service")}
        >
          {SERVICES.map(([value, label]) => (
            <option key={value} value={value}>
              {t(locale, label)}
            </option>
          ))}
        </NativeSelect>
        <p className="mt-2 text-xs text-muted-foreground">{t(locale, chosen[2])}</p>
      </Section>

      <Section title={t(locale, "How to reach you")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="b-contactName">{t(locale, "Your name")}</Label>
            <Input id="b-contactName" name="contactName" required maxLength={120} autoComplete="name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="b-contactPhone">{t(locale, "Phone")}</Label>
            <Input id="b-contactPhone" name="contactPhone" type="tel" inputMode="tel" required maxLength={40} autoComplete="tel" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="b-contactEmail">
              {t(locale, "Email")} <Optional />
            </Label>
            <Input id="b-contactEmail" name="contactEmail" type="email" maxLength={200} autoComplete="email" />
          </div>
        </div>
      </Section>

      {freight ? (
        <>
          <Section title={t(locale, "Route and readiness")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="b-originCity">{t(locale, "Where the cargo is")}</Label>
                <Input id="b-originCity" name="originCity" maxLength={200} defaultValue="Guangzhou" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-destination">{t(locale, "Destination")}</Label>
                <Input id="b-destination" name="destination" maxLength={200} defaultValue="Dar es Salaam" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-readinessDate">{t(locale, "Cargo ready on")}</Label>
                <Input id="b-readinessDate" name="readinessDate" type="date" min={TODAY} max="2099-12-31" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-supplierName">
                  {t(locale, "Supplier")} <Optional />
                </Label>
                <Input id="b-supplierName" name="supplierName" maxLength={200} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="b-pickupAddress">
                  {t(locale, "Loading address")} <Optional />
                </Label>
                <Input id="b-pickupAddress" name="pickupAddress" maxLength={300} />
              </div>
              {sailings.length > 0 ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="b-preferredSailingWeek">{t(locale, "Preferred sailing")}</Label>
                  <NativeSelect
                    id="b-preferredSailingWeek"
                    name="preferredSailingWeek"
                    defaultValue={defaults.sailing ?? ""}
                  >
                    <option value="">{t(locale, "The next one with space")}</option>
                    {sailings.map((sailing) => (
                      <option key={sailing.weekOf} value={sailing.weekOf}>
                        {sailing.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ) : (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="b-preferredShipment">
                    {t(locale, "Preferred sailing")} <Optional />
                  </Label>
                  <Input id="b-preferredShipment" name="preferredShipment" maxLength={200} placeholder={t(locale, "Next available")} />
                </div>
              )}
            </div>
          </Section>

          <Section title={t(locale, "Measurements")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="b-commodity">{t(locale, "Cargo type")}</Label>
                <Input
                  id="b-commodity"
                  name="commodity"
                  maxLength={200}
                  required
                  list="booking-cargo-types"
                  defaultValue={defaults.commodity ?? ""}
                  placeholder={t(locale, "Shoes, electronics, machinery…")}
                />
                <datalist id="booking-cargo-types">
                  {cargoTypes.map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
              </div>
              {service === "FULL_CONTAINER" ? (
                <div className="space-y-2">
                  <Label htmlFor="b-containerType">{t(locale, "Container type")}</Label>
                  <NativeSelect id="b-containerType" name="containerType" defaultValue="GP_40">
                    <option value="GP_20">{t(locale, "20ft general purpose")}</option>
                    <option value="GP_40">{t(locale, "40ft general purpose")}</option>
                    <option value="HQ_40">{t(locale, "40ft high cube")}</option>
                    <option value="HQ_45">{t(locale, "45ft high cube")}</option>
                  </NativeSelect>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="b-packages">{t(locale, "Countable units")}</Label>
                <Input id="b-packages" name="packages" type="number" inputMode="numeric" min={0} step={1} placeholder={t(locale, "Cartons, pallets, crates")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-quantity">
                  {t(locale, "Total units inside")} <Optional />
                </Label>
                <Input id="b-quantity" name="quantity" type="number" inputMode="numeric" min={0} step={1} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-estimatedCbm">{t(locale, "Estimated volume (CBM)")}</Label>
                <Input
                  id="b-estimatedCbm"
                  name="estimatedCbm"
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  min={0}
                  max={10000}
                  defaultValue={defaults.cbm ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-estimatedWeightKg">{t(locale, "Total estimated weight (kg)")}</Label>
                <Input id="b-estimatedWeightKg" name="estimatedWeightKg" type="number" inputMode="decimal" step="0.01" min={0} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="b-dimensions">
                  {service === "SPECIAL_CARGO"
                    ? t(locale, "Dimensions")
                    : `${t(locale, "Dimensions")} ${t(locale, "(optional)")}`}
                </Label>
                <Input id="b-dimensions" name="dimensions" maxLength={200} placeholder={t(locale, "e.g. 20 cartons at 60×40×40 cm")} />
              </div>
            </div>
          </Section>

          <Section title={t(locale, "Shipment conditions")}>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="dangerousGoods" className="size-4" />
                {t(locale, "Hazardous")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="fragile" className="size-4" />
                {t(locale, "Fragile")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="perishable" className="size-4" />
                {t(locale, "Perishable")}
              </label>
            </div>
            {service === "SPECIAL_CARGO" ? (
              <div className="mt-4 space-y-2">
                <Label htmlFor="b-handling">{t(locale, "How does it have to be handled?")}</Label>
                <Textarea
                  id="b-handling"
                  name="handling"
                  rows={2}
                  maxLength={2000}
                  placeholder={t(locale, "Lifting points, cradles, temperature, escorts")}
                />
              </div>
            ) : null}
          </Section>
        </>
      ) : (
        <Section title={t(locale, "The shipment to clear")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="b-commodity-clearance">{t(locale, "What is the cargo?")}</Label>
              <Input
                id="b-commodity-clearance"
                name="commodity"
                required
                maxLength={200}
                defaultValue={defaults.commodity ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-portOfDischarge">{t(locale, "Port of discharge")}</Label>
              <Input id="b-portOfDischarge" name="portOfDischarge" required maxLength={200} defaultValue="Dar es Salaam" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-shipmentRef">
                {t(locale, "Bill of lading or shipment reference")} <Optional />
              </Label>
              <Input id="b-shipmentRef" name="shipmentRef" maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-declaredValue">
                {t(locale, "Estimated value of the goods")} <Optional />
              </Label>
              <Input id="b-declaredValue" name="declaredValue" type="number" inputMode="decimal" step="0.01" min={0} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-declaredValueCurrency">{t(locale, "Currency")}</Label>
              <NativeSelect id="b-declaredValueCurrency" name="declaredValueCurrency" defaultValue="USD">
                <option value="USD">USD</option>
                <option value="TZS">TZS</option>
              </NativeSelect>
            </div>
          </div>
          <p className="mt-4 rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
            {t(
              locale,
              "Swift Cargo reviews the shipment and its documents and comes back to you with a clearance quotation. Send the bill of lading, the packing list and the invoice on WhatsApp with your reference once you have it."
            )}
          </p>
        </Section>
      )}

      <div className="space-y-2">
        <Label htmlFor="b-requirements">
          {t(locale, "Additional details")} <Optional />
        </Label>
        <Textarea id="b-requirements" name="requirements" rows={3} maxLength={2000} />
      </div>

      {service === "SPECIAL_CARGO" ? (
        <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
          {t(
            locale,
            "Special cargo is never priced off the rate book. Our team will review what you have described and come back to you with a price."
          )}
        </p>
      ) : null}

      <label className="flex items-start gap-2.5 rounded-md border p-3 text-sm">
        <input type="checkbox" name="termsAccepted" className="mt-0.5 size-4" required />
        <span>
          {t(locale, "I understand this is a request, not a confirmed booking")}
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {t(locale, "Space and price are confirmed by our team before anything is reserved.")}
          </span>
        </span>
      </label>
    </PublicForm>
  );
}
