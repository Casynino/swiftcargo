"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useTransition } from "react";
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
          <Label htmlFor="q-estimatedCbm">{t(locale, "Estimated volume (m³)")}</Label>
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

export function PickupForm() {
  return (
    <PublicForm action={submitPickupRequest} submitLabel={t(locale, "Request a pickup")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="p-pickupLocation">{t(locale, "Collect from")}</Label>
          <Input
            id="p-pickupLocation"
            name="pickupLocation"
            required
            maxLength={300}
            placeholder={t(locale, "Factory name and address in China")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-contactName">{t(locale, "Ask for")}</Label>
          <Input id="p-contactName" name="contactName" required maxLength={120} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-contactPhone">{t(locale, "Their phone")}</Label>
          <Input id="p-contactPhone" name="contactPhone" type="tel" inputMode="tel" required maxLength={40} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-commodity">{t(locale, "Goods")}</Label>
          <Input id="p-commodity" name="commodity" maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-packages">{t(locale, "Packages")}</Label>
          <Input id="p-packages" name="packages" type="number" inputMode="numeric" min={0} step={1} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-preferredDate">{t(locale, "Preferred date")}</Label>
          <Input id="p-preferredDate" name="preferredDate" type="date" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-preferredTime">{t(locale, "Preferred time")}</Label>
          <Input id="p-preferredTime" name="preferredTime" maxLength={60} placeholder={t(locale, "Morning")} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-cargoDescription">{t(locale, "Describe the cargo")}</Label>
        <Textarea id="p-cargoDescription" name="cargoDescription" rows={3} maxLength={2000} />
      </div>

      <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
        {t(
          locale,
          "This is a request. Nothing is scheduled until we have spoken to you and confirmed the collection."
        )}
      </p>
    </PublicForm>
  );
}

export function BookingForm() {
  return (
    <PublicForm action={submitBooking} submitLabel={t(locale, "Submit booking request")}>
      <div className="space-y-2">
        <Label htmlFor="b-type">{t(locale, "What do you need?")}</Label>
        <NativeSelect id="b-type" name="type" defaultValue="SHARED_CARGO">
          <option value="SHARED_CARGO">{t(locale, "Shared container — I have loose cargo")}</option>
          <option value="FULL_CONTAINER">{t(locale, "Full container — I want the whole box")}</option>
        </NativeSelect>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="b-contactName">{t(locale, "Your name")}</Label>
          <Input id="b-contactName" name="contactName" required maxLength={120} autoComplete="name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="b-contactPhone">{t(locale, "Phone")}</Label>
          <Input id="b-contactPhone" name="contactPhone" type="tel" inputMode="tel" required maxLength={40} autoComplete="tel" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="b-contactEmail">
            {t(locale, "Email")}{" "}
            <span className="font-normal text-muted-foreground">({t(locale, "optional")})</span>
          </Label>
          <Input id="b-contactEmail" name="contactEmail" type="email" maxLength={200} autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="b-containerType">{t(locale, "Container size")}</Label>
          <NativeSelect id="b-containerType" name="containerType" defaultValue="">
            <option value="">{t(locale, "Not sure / shared")}</option>
            <option value="GP_20">{t(locale, "20ft general purpose")}</option>
            <option value="GP_40">{t(locale, "40ft general purpose")}</option>
            <option value="HQ_40">{t(locale, "40ft high cube")}</option>
            <option value="HQ_45">{t(locale, "45ft high cube")}</option>
          </NativeSelect>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="b-pickupAddress">{t(locale, "Loading address")}</Label>
          <Input id="b-pickupAddress" name="pickupAddress" maxLength={300} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="b-destination">{t(locale, "Destination")}</Label>
          <Input id="b-destination" name="destination" maxLength={200} defaultValue="Dar es Salaam" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="b-commodity">{t(locale, "Commodity")}</Label>
          <Input id="b-commodity" name="commodity" maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="b-packages">{t(locale, "Packages")}</Label>
          <Input id="b-packages" name="packages" type="number" inputMode="numeric" min={0} step={1} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="b-quantity">{t(locale, "Quantity")}</Label>
          <Input id="b-quantity" name="quantity" type="number" inputMode="numeric" min={0} step={1} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="b-estimatedCbm">{t(locale, "Estimated CBM")}</Label>
          <Input id="b-estimatedCbm" name="estimatedCbm" type="number" inputMode="decimal" step="0.001" min={0} max={10000} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="b-estimatedWeightKg">{t(locale, "Estimated weight (kg)")}</Label>
          <Input id="b-estimatedWeightKg" name="estimatedWeightKg" type="number" inputMode="decimal" step="0.01" min={0} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="b-dimensions">{t(locale, "Dimensions")}</Label>
          <Input id="b-dimensions" name="dimensions" maxLength={200} placeholder={t(locale, "e.g. 20 cartons at 60×40×40 cm")} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="b-preferredShipment">{t(locale, "Preferred sailing")}</Label>
          <Input id="b-preferredShipment" name="preferredShipment" maxLength={200} placeholder={t(locale, "Next available")} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="dangerousGoods" className="size-4" />
        {t(locale, "Contains dangerous or restricted goods")}
      </label>

      <div className="space-y-2">
        <Label htmlFor="b-requirements">{t(locale, "Special requirements")}</Label>
        <Textarea id="b-requirements" name="requirements" rows={3} maxLength={2000} />
      </div>

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
