"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";

import { CustomerPicker } from "@/components/app/customer-picker";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  createTicket,
  updateTicket,
  type TicketActionState,
} from "@/lib/actions/tickets";

import { useT } from "@/components/app/locale-provider";
export const TICKET_PRIORITIES = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

export const TICKET_STATUSES = [
  { value: "OPEN", label: "Open" },
  { value: "WAITING_STAFF", label: "Waiting on us" },
  { value: "WAITING_CUSTOMER", label: "Waiting for customer" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

/**
 * The queue's header, which opens into the new-ticket form.
 *
 * The desk spends its day reading the queue, not filling forms, so the form
 * stays folded until it is wanted — but it is one click away, because a ticket
 * that is awkward to open is a ticket that gets remembered instead of written.
 */
export function NewTicketPanel({
  defaultOpen = false,
  canCreate,
}: {
  defaultOpen?: boolean;
  canCreate: boolean;
}) {
  const tx = useT();
  const [open, setOpen] = useState(defaultOpen && canCreate);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 p-4">
        <span className="font-semibold">{tx("Support tickets")}</span>
        {canCreate ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="focus-ring inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-brand"
          >
            {open ? (
              <>
                {tx("Close")}
                <ChevronDown className="size-4 rotate-180" />
              </>
            ) : (
              <>
                <Plus className="size-4" />
                {tx("New ticket")}
              </>
            )}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="border-t p-4">
          <NewTicketForm />
        </div>
      ) : null}
    </Card>
  );
}

function NewTicketForm() {
  const tx = useT();
  const [state, action] = useActionState<TicketActionState, FormData>(
    createTicket,
    {}
  );

  return (
    <div className="space-y-4">
      {state.ok && state.id ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.ok}{" "}
          <Link href={`/app/support/${state.id}`} className="font-medium underline">
            Open {state.reference}
          </Link>
        </p>
      ) : null}

      {/* Keyed on the last ticket opened, so a successful save clears the form
          for the next caller instead of inviting a duplicate. */}
      <form key={state.id ?? "new"} action={action} className="space-y-4">
        <FormMessage error={state.error} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <CustomerPicker
              name="customerId"
              label={tx("Customer")}
              hint={tx("Leave empty when the cargo reference below says who it is.")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cargoReference">
              Cargo{" "}
              <span className="font-normal text-muted-foreground">optional</span>
            </Label>
            <Input
              id="cargoReference"
              name="cargoReference"
              placeholder="SWC-2026-000125"
              className="font-mono"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">{tx("Priority")}</Label>
            <NativeSelect id="priority" name="priority" defaultValue="NORMAL">
              {TICKET_PRIORITIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="subject">{tx("Summary")}</Label>
            <Input
              id="subject"
              name="subject"
              placeholder={tx("e.g. Carton arrived open, two pairs of shoes missing")}
              required
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="body">{tx("What the customer said")}</Label>
            <Textarea id="body" name="body" rows={3} required />
            <p className="text-xs text-muted-foreground">
              {tx("Kept on the thread as an internal note. The customer never sees it.")}
            </p>
          </div>
        </div>

        <SubmitButton pendingLabel="Opening…">{tx("Open ticket")}</SubmitButton>
      </form>
    </div>
  );
}

/** Status, priority and owner, on one form. */
export function TicketWorkflow({
  ticket,
  staff,
  canAssign,
}: {
  ticket: {
    id: string;
    status: string;
    priority: string;
    assignedToId: string | null;
  };
  staff: { id: string; name: string }[];
  canAssign: boolean;
}) {
  const tx = useT();
  const [state, action] = useActionState<TicketActionState, FormData>(
    updateTicket,
    {}
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="conversationId" value={ticket.id} />
      <FormMessage error={state.error} ok={state.ok} />

      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-2">
          <Label htmlFor="ticket-status">{tx("Status")}</Label>
          <NativeSelect id="ticket-status" name="status" defaultValue={ticket.status}>
            {TICKET_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ticket-priority">{tx("Priority")}</Label>
          <NativeSelect
            id="ticket-priority"
            name="priority"
            defaultValue={ticket.priority}
          >
            {TICKET_PRIORITIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ticket-assignee">{tx("Handled by")}</Label>
          {canAssign ? (
            <NativeSelect
              id="ticket-assignee"
              name="assignedToId"
              defaultValue={ticket.assignedToId ?? ""}
            >
              <option value="">{tx("Unassigned")}</option>
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <>
              {/* Posted unchanged, so saving a status is never read as taking
                  the ticket off whoever has it. */}
              <input
                type="hidden"
                name="assignedToId"
                value={ticket.assignedToId ?? ""}
              />
              <p className="text-sm text-muted-foreground">
                {staff.find((p) => p.id === ticket.assignedToId)?.name ??
                  "Unassigned"}
              </p>
            </>
          )}
        </div>
      </div>

      <SubmitButton pendingLabel="Saving…">{tx("Save ticket")}</SubmitButton>
    </form>
  );
}
