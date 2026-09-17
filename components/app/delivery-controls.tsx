"use client";

import { useActionState, useState } from "react";

import { updateDelivery, type ActionState } from "@/lib/actions/release";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

const STATUSES = [
  ["REQUESTED", "Requested"],
  ["CONFIRMED", "Confirmed"],
  ["ASSIGNED", "Driver assigned"],
  ["OUT_FOR_DELIVERY", "Out for delivery"],
  ["DELIVERED", "Delivered"],
  ["FAILED", "Failed"],
  ["CANCELLED", "Cancelled"],
] as const;

export function DeliveryControls({
  requestId,
  status,
  charge,
  driverName,
  driverPhone,
  failedReason,
}: {
  requestId: string;
  status: string;
  charge: string | null;
  driverName: string | null;
  driverPhone: string | null;
  failedReason: string | null;
}) {
  const [chosen, setChosen] = useState(status);
  const [state, action] = useActionState<ActionState, FormData>(
    updateDelivery,
    {}
  );

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <NativeSelect
        name="status"
        value={chosen}
        onChange={(e) => setChosen(e.target.value)}
        className="h-9 w-44"
        aria-label="Delivery status"
      >
        {STATUSES.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </NativeSelect>
      <Input
        name="driverName"
        placeholder="Driver"
        defaultValue={driverName ?? ""}
        className="h-9 w-32"
        aria-label="Driver"
      />
      {/* The customer rings the driver, not the office, once the van has left. */}
      <Input
        name="driverPhone"
        placeholder="Driver phone"
        inputMode="tel"
        defaultValue={driverPhone ?? ""}
        className="h-9 w-36"
        aria-label="Driver phone"
      />
      <Input
        name="charge"
        type="number"
        step="0.01"
        min={0}
        placeholder="Charge"
        defaultValue={charge ?? ""}
        className="h-9 w-28"
        aria-label="Delivery charge"
      />
      {/* A failed delivery is re-arranged from its reason. Without one the next
          person to call the customer starts the conversation from nothing. */}
      {chosen === "FAILED" ? (
        <Input
          name="failedReason"
          placeholder="Why it failed"
          required
          defaultValue={failedReason ?? ""}
          className="h-9 w-56"
          aria-label="Why the delivery failed"
        />
      ) : null}
      <SubmitButton size="sm" variant="outline">
        Save
      </SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
