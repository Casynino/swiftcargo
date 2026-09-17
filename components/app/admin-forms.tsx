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
  };
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    upsertWarehouse,
    {}
  );
  const [open, setOpen] = useState(!!warehouse);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Add a warehouse
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
            <Label htmlFor={`code-${warehouse?.id ?? "new"}`}>Code</Label>
            <Input
              id={`code-${warehouse?.id ?? "new"}`}
              name="code"
              required
              placeholder="GZ"
              defaultValue={warehouse?.code}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`name-${warehouse?.id ?? "new"}`}>Name</Label>
            <Input
              id={`name-${warehouse?.id ?? "new"}`}
              name="name"
              required
              defaultValue={warehouse?.name}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`kind-${warehouse?.id ?? "new"}`}>Country</Label>
            <NativeSelect
              id={`kind-${warehouse?.id ?? "new"}`}
              name="kind"
              defaultValue={warehouse?.kind ?? "CHINA"}
            >
              <option value="CHINA">China</option>
              <option value="TANZANIA">Tanzania</option>
            </NativeSelect>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`local-${warehouse?.id ?? "new"}`}>
            Address, in the local script
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
            Address, in English
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
            <Label htmlFor={`city-${warehouse?.id ?? "new"}`}>City</Label>
            <Input
              id={`city-${warehouse?.id ?? "new"}`}
              name="city"
              defaultValue={warehouse?.city ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`country-${warehouse?.id ?? "new"}`}>Country</Label>
            <Input
              id={`country-${warehouse?.id ?? "new"}`}
              name="country"
              defaultValue={warehouse?.country ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`phone-${warehouse?.id ?? "new"}`}>Phone</Label>
            <Input
              id={`phone-${warehouse?.id ?? "new"}`}
              name="phone"
              defaultValue={warehouse?.phone ?? ""}
            />
          </div>
        </div>

        <FormMessage error={state.error} ok={state.ok} />
        <div className="flex gap-2">
          <SubmitButton>{warehouse ? "Save" : "Add warehouse"}</SubmitButton>
          {!warehouse ? (
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

export function ScheduleForm() {
  const [state, action] = useActionState<ActionState, FormData>(
    upsertSchedule,
    {}
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Publish a sailing
      </Button>
    );
  }

  return (
    <Card className="p-6">
      <form action={action} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="vessel">Vessel</Label>
            <Input id="vessel" name="vessel" placeholder="MSC Kalamata" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="voyage">Voyage</Label>
            <Input id="voyage" name="voyage" placeholder="FR429A" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shippingLine">Shipping line</Label>
            <Input id="shippingLine" name="shippingLine" placeholder="MSC" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cargoDeadline">Cargo deadline</Label>
            <Input id="cargoDeadline" name="cargoDeadline" type="date" min="2000-01-01" max="2099-12-31" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="departureDate">Departs</Label>
            <Input id="departureDate" name="departureDate" type="date" min="2000-01-01" max="2099-12-31" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="estimatedArrival">Arrives</Label>
            <Input
              id="estimatedArrival"
              name="estimatedArrival"
              type="date"
              min="2000-01-01"
              max="2099-12-31"
              required
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="published" defaultChecked />
          Show on the public website
        </label>

        <FormMessage error={state.error} ok={state.ok} />
        <div className="flex gap-2">
          <SubmitButton>Publish</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function DeleteScheduleButton({ id }: { id: string }) {
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
      <SubmitButton variant="ghost" size="icon" aria-label="Remove sailing">
        <Trash2 />
      </SubmitButton>
      {state.error ? (
        <p className="text-xs text-destructive">{state.error}</p>
      ) : null}
    </form>
  );
}
