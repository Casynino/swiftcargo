"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  deleteSchedule,
  upsertSchedule,
  upsertWarehouse,
  type ActionState,
} from "@/lib/actions/admin";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

import { useT } from "@/components/app/locale-provider";
const SAILING_STATUSES = [
  ["OPEN_FOR_BOOKING", "Open for booking"],
  ["CUTOFF_APPROACHING", "Cut-off approaching"],
  ["CLOSED", "Closed for cargo"],
  ["DEPARTED", "Departed China"],
  ["IN_TRANSIT", "In transit"],
  ["ARRIVED", "Arrived"],
  ["DELAYED", "Delayed"],
  ["CANCELLED", "Cancelled"],
] as const;

export function WarehouseForm({
  warehouse,
}: {
  warehouse?: {
    id: string;
    code: string;
    name: string;
    kind: string;
    addressLocal: string | null;
    addressEnglish: string | null;
    city: string | null;
    country: string | null;
    phone: string | null;
    contactName?: string | null;
  };
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    upsertWarehouse,
    {}
  );
  const [open, setOpen] = useState(!!warehouse);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {tx("Add a warehouse")}
      </Button>
    );
  }

  return (
    <Card className="p-6">
      <form action={action} className="space-y-4">
        {warehouse ? (
          <input type="hidden" name="warehouseId" value={warehouse.id} />
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor={`code-${warehouse?.id ?? "new"}`}>{tx("Code")}</Label>
            <Input
              id={`code-${warehouse?.id ?? "new"}`}
              name="code"
              required
              placeholder="GZ"
              defaultValue={warehouse?.code}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`name-${warehouse?.id ?? "new"}`}>{tx("Name")}</Label>
            <Input
              id={`name-${warehouse?.id ?? "new"}`}
              name="name"
              required
              defaultValue={warehouse?.name}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`kind-${warehouse?.id ?? "new"}`}>{tx("Country")}</Label>
            <NativeSelect
              id={`kind-${warehouse?.id ?? "new"}`}
              name="kind"
              defaultValue={warehouse?.kind ?? "CHINA"}
            >
              <option value="CHINA">{tx("China")}</option>
              <option value="TANZANIA">{tx("Tanzania")}</option>
            </NativeSelect>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`local-${warehouse?.id ?? "new"}`}>
            {tx("Address, in the local script")}
          </Label>
          <Textarea
            id={`local-${warehouse?.id ?? "new"}`}
            name="addressLocal"
            rows={2}
            defaultValue={warehouse?.addressLocal ?? ""}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`english-${warehouse?.id ?? "new"}`}>
            {tx("Address, in English")}
          </Label>
          <Textarea
            id={`english-${warehouse?.id ?? "new"}`}
            name="addressEnglish"
            rows={2}
            defaultValue={warehouse?.addressEnglish ?? ""}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor={`city-${warehouse?.id ?? "new"}`}>{tx("City")}</Label>
            <Input
              id={`city-${warehouse?.id ?? "new"}`}
              name="city"
              defaultValue={warehouse?.city ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`country-${warehouse?.id ?? "new"}`}>{tx("Country")}</Label>
            <Input
              id={`country-${warehouse?.id ?? "new"}`}
              name="country"
              defaultValue={warehouse?.country ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`phone-${warehouse?.id ?? "new"}`}>{tx("Phone")}</Label>
            <Input
              id={`phone-${warehouse?.id ?? "new"}`}
              name="phone"
              defaultValue={warehouse?.phone ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`contact-${warehouse?.id ?? "new"}`}>{tx("Receiver at the door (收货人)")}</Label>
            <Input
              id={`contact-${warehouse?.id ?? "new"}`}
              name="contactName"
              defaultValue={warehouse?.contactName ?? ""}
            />
          </div>
        </div>

        <FormMessage error={state.error} ok={state.ok} />
        <div className="flex gap-2">
          <SubmitButton>{warehouse ? "Save" : "Add warehouse"}</SubmitButton>
          {!warehouse ? (
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {tx("Cancel")}
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

/**
 * OVERRIDE ONE WEEK OF THE PUBLISHED SCHEDULE.
 *
 * The public page needs nothing here to be right — it is generated from the
 * weekly rule. This is for the week that is not ordinary: a sailing that
 * slipped, a vessel worth naming, a week nobody is sailing. Picking the week
 * fills the dates the rule would have given, so the only thing left to type is
 * whatever differs.
 */
export function ScheduleForm({
  weeks,
  defaultTransitDays,
}: {
  /** The generated weeks, newest first, as the public page would show them. */
  weeks: {
    weekOf: string;
    label: string;
    cargoDeadline: string;
    loadingDate: string;
    departureDate: string;
    taken: boolean;
  }[];
  defaultTransitDays: number;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    upsertSchedule,
    {}
  );
  const [open, setOpen] = useState(false);
  const free = weeks.filter((w) => !w.taken);
  const [weekOf, setWeekOf] = useState(free[0]?.weekOf ?? "");

  const chosen = weeks.find((w) => w.weekOf === weekOf) ?? null;

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {tx("Override a sailing week")}
      </Button>
    );
  }

  return (
    <Card className="p-6">
      {/* Keyed on the week so picking a different one refills the date inputs:
          an uncontrolled input keeps the first defaultValue it was given. */}
      <form action={action} className="space-y-4" key={weekOf}>
        <div className="space-y-2">
          <Label htmlFor="weekOf">{tx("Which sailing week")}</Label>
          <NativeSelect
            id="weekOf"
            name="weekOf"
            value={weekOf}
            onChange={(e) => setWeekOf(e.target.value)}
          >
            <option value="">{tx("An extra sailing — no generated week")}</option>
            {weeks.map((week) => (
              <option key={week.weekOf} value={week.weekOf} disabled={week.taken}>
                {week.label}
                {week.taken ? " — already published" : ""}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            {tx("The week this row stands in for. Everything else that week is generated from the rule: cargo in by Friday, packed that Friday, sails Monday.")}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="vessel">{tx("Vessel")}</Label>
            <Input id="vessel" name="vessel" placeholder={tx("MSC Kalamata")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="voyage">{tx("Voyage reference")}</Label>
            <Input id="voyage" name="voyage" placeholder="FR429A" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shippingLine">{tx("Shipping line")}</Label>
            <Input id="shippingLine" name="shippingLine" placeholder="MSC" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="origin">{tx("Origin")}</Label>
            <Input id="origin" name="origin" defaultValue="Guangzhou" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="destination">{tx("Destination")}</Label>
            <Input id="destination" name="destination" defaultValue="Dar es Salaam" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">{tx("Status")}</Label>
            <NativeSelect id="status" name="status" defaultValue="OPEN_FOR_BOOKING">
              {SAILING_STATUSES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cargoDeadline">{tx("Last day to receive cargo")}</Label>
            <Input
              id="cargoDeadline"
              name="cargoDeadline"
              type="date"
              min="2000-01-01"
              max="2099-12-31"
              defaultValue={chosen?.cargoDeadline}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="loadingDate">{tx("Container packed")}</Label>
            <Input
              id="loadingDate"
              name="loadingDate"
              type="date"
              min="2000-01-01"
              max="2099-12-31"
              defaultValue={chosen?.loadingDate}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="departureDate">{tx("Departs China")}</Label>
            <Input
              id="departureDate"
              name="departureDate"
              type="date"
              min="2000-01-01"
              max="2099-12-31"
              defaultValue={chosen?.departureDate}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="transitDays">{tx("Days at sea")}</Label>
            <Input
              id="transitDays"
              name="transitDays"
              type="number"
              min={1}
              max={120}
              step={1}
              defaultValue={defaultTransitDays}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="estimatedArrival">
              Estimated arrival{" "}
              <span className="font-normal text-muted-foreground">
                (left blank: departure plus the days at sea)
              </span>
            </Label>
            <Input
              id="estimatedArrival"
              name="estimatedArrival"
              type="date"
              min="2000-01-01"
              max="2099-12-31"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">{tx("Note for the website")}</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={2}
            maxLength={500}
            placeholder={tx("Deadline brought forward for the public holiday.")}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="published" defaultChecked />
          {tx("Show on the public website")}
          <span className="text-xs text-muted-foreground">
            — unticked, this week comes off the schedule altogether
          </span>
        </label>

        <FormMessage error={state.error} ok={state.ok} />
        <div className="flex gap-2">
          <SubmitButton>{tx("Save")}</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {tx("Cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function DeleteScheduleButton({ id }: { id: string }) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(deleteSchedule, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        /* The public schedule is what customers plan a shipment around, and
           this bin sits one row away from the next sailing's. */
        if (!window.confirm("Remove this sailing from the public schedule?")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="scheduleId" value={id} />
      <SubmitButton variant="ghost" size="icon" aria-label={tx("Remove sailing")}>
        <Trash2 />
      </SubmitButton>
      {state.error ? (
        <p className="text-xs text-destructive">{state.error}</p>
      ) : null}
    </form>
  );
}
