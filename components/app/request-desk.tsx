"use client";

import { useActionState, useState } from "react";

import {
  assignRequest,
  convertBookingToCustomer,
  linkPickupToCargo,
  quoteServiceRequest,
  schedulePickup,
  type DeskState,
} from "@/lib/actions/request-desk";
import { attachRequestFile } from "@/lib/actions/request-files";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

import { useT } from "@/components/app/locale-provider";
/**
 * WHAT A DESK DOES WITH A WEBSITE REQUEST.
 *
 * Small forms rather than one large one: each of these is a separate act with
 * its own audit line, and a single Save that assigned, scheduled, priced and
 * converted at once would leave one line saying "updated" for four different
 * decisions.
 */

export type StaffOption = { id: string; name: string; role: string };

export function AssignControl({
  kind,
  id,
  assignedToId,
  staff,
}: {
  kind: "pickup" | "booking";
  id: string;
  assignedToId: string | null;
  staff: StaffOption[];
}) {
  const tx = useT();
  const [state, action] = useActionState<DeskState, FormData>(assignRequest, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <NativeSelect
        name="assignedToId"
        defaultValue={assignedToId ?? ""}
        className="h-9 w-48"
        aria-label={tx("Assign to")}
      >
        <option value="">{tx("Unassigned")}</option>
        {staff.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name} · {person.role}
          </option>
        ))}
      </NativeSelect>
      <SubmitButton size="sm" variant="outline">
        {tx("Assign")}
      </SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}

export function ScheduleControl({
  id,
  scheduledDate,
}: {
  id: string;
  scheduledDate: string | null;
}) {
  const tx = useT();
  const [state, action] = useActionState<DeskState, FormData>(schedulePickup, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <Input
        name="scheduledDate"
        type="date"
        min="2000-01-01"
        max="2099-12-31"
        defaultValue={scheduledDate ?? ""}
        className="h-9 w-44"
        aria-label={tx("Collection date")}
      />
      <SubmitButton size="sm" variant="outline">
        {tx("Set collection day")}
      </SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}

export function QuoteControl({
  id,
  quotedAmount,
  quotedCurrency,
}: {
  id: string;
  quotedAmount: string | null;
  quotedCurrency: string;
}) {
  const tx = useT();
  const [state, action] = useActionState<DeskState, FormData>(
    quoteServiceRequest,
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <Input
        name="amount"
        type="number"
        step="0.01"
        min={0}
        defaultValue={quotedAmount ?? ""}
        className="h-9 w-32"
        aria-label={tx("Quoted amount")}
        placeholder="0.00"
      />
      <NativeSelect
        name="currency"
        defaultValue={quotedCurrency}
        className="h-9 w-24"
        aria-label={tx("Currency")}
      >
        <option value="USD">USD</option>
        <option value="TZS">TZS</option>
      </NativeSelect>
      <Input
        name="notes"
        placeholder={tx("What you told them")}
        className="h-9 min-w-[12rem] flex-1"
        aria-label={tx("Quotation note")}
      />
      <SubmitButton size="sm" variant="outline">
        {tx("Record quotation")}
      </SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
      <p className="w-full text-xs text-muted-foreground">
        {tx("A quotation is an answer to an enquiry. Nothing is owed until cargo exists and Finance issues a bill against it.")}
      </p>
    </form>
  );
}

export function ConvertControl({
  id,
  status,
  convertedTo,
}: {
  id: string;
  status: string;
  convertedTo: { code: string; name: string } | null;
}) {
  const tx = useT();
  const [state, action] = useActionState<DeskState, FormData>(
    convertBookingToCustomer,
    {}
  );

  if (convertedTo) {
    return (
      <p className="text-xs text-muted-foreground">
        Converted — {convertedTo.name} ({convertedTo.code})
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <SubmitButton size="sm" disabled={status !== "APPROVED"}>
        {tx("Convert to a customer")}
      </SubmitButton>
      <span className="text-xs text-muted-foreground">
        {status === "APPROVED"
          ? "Finds them by phone first; only makes a customer if there is none."
          : "Approve the request first."}
      </span>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}

export function LinkCargoControl({
  id,
  cargoReference,
}: {
  id: string;
  cargoReference: string | null;
}) {
  const tx = useT();
  const [state, action] = useActionState<DeskState, FormData>(
    linkPickupToCargo,
    {}
  );
  const [open, setOpen] = useState(false);

  if (cargoReference) {
    return (
      <p className="text-xs text-muted-foreground">
        Goods received as{" "}
        <span className="tnum font-medium">{cargoReference}</span>
      </p>
    );
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {tx("Goods received — link the consignment")}
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <Input
        name="cargoReference"
        placeholder="SC0042"
        className="tnum h-9 w-32"
        aria-label={tx("Consignment reference")}
      />
      <SubmitButton size="sm" variant="outline">
        {tx("Link")}
      </SubmitButton>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        {tx("Cancel")}
      </Button>
      <FormMessage error={state.error} ok={state.ok} />
      <p className="w-full text-xs text-muted-foreground">
        Take the goods in at the receiving counter first. This attaches the
        consignment that came of the request; it does not create one.
      </p>
    </form>
  );
}

export type RequestFile = {
  id: string;
  url: string;
  kind: string;
  label: string | null;
};

/**
 * Papers and proof against a request.
 *
 * Staff-side only. A customer sends documents on WhatsApp against the reference
 * they were given; whoever works the request puts them here, which is also the
 * only way there is a record of who did.
 */
export function RequestFiles({
  pickupRequestId,
  bookingId,
  files,
}: {
  pickupRequestId?: string;
  bookingId?: string;
  files: RequestFile[];
}) {
  const tx = useT();
  const [state, action] = useActionState<DeskState, FormData>(
    attachRequestFile,
    {}
  );
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      {files.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {files.map((file) => (
            <li key={file.id}>
              <a
                href={file.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border px-2 py-1 text-xs underline"
              >
                {file.label ?? (file.kind === "PROOF" ? "Proof" : "Document")}
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <form action={action} className="flex flex-wrap items-end gap-2">
          {pickupRequestId ? (
            <input type="hidden" name="pickupRequestId" value={pickupRequestId} />
          ) : null}
          {bookingId ? <input type="hidden" name="bookingId" value={bookingId} /> : null}
          <NativeSelect
            name="kind"
            defaultValue="DOCUMENT"
            className="h-9 w-32"
            aria-label={tx("Kind of file")}
          >
            <option value="DOCUMENT">{tx("Document")}</option>
            <option value="PROOF">{tx("Proof")}</option>
          </NativeSelect>
          <Input name="label" placeholder={tx("What it is")} className="h-9 w-40" aria-label={tx("Label")} />
          <Input
            name="files"
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="h-9 w-56"
            aria-label={tx("Files")}
          />
          <SubmitButton size="sm" variant="outline">
            {tx("Attach")}
          </SubmitButton>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            {tx("Cancel")}
          </Button>
          <FormMessage error={state.error} ok={state.ok} />
        </form>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          {tx("Attach a document or proof")}
        </Button>
      )}
    </div>
  );
}
