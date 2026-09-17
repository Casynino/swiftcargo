"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import {
  raiseException,
  updateException,
  type ActionState,
} from "@/lib/actions/exceptions";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

const TYPES = [
  ["MISSING_CARGO", "Missing cargo"],
  ["DAMAGED_CARGO", "Damaged cargo"],
  ["PACKAGE_MISMATCH", "Package count mismatch"],
  ["WEIGHT_DIFFERENCE", "Weight difference"],
  ["CBM_DIFFERENCE", "Volume difference"],
  ["WRONG_CUSTOMER", "Wrong customer"],
  ["WRONG_CONTAINER", "Wrong container"],
  ["UNIDENTIFIED_CARGO", "Unidentified cargo"],
  ["CUSTOMS_HOLD", "Customs hold"],
  ["SHIPMENT_DELAY", "Shipment delay"],
  ["PAYMENT_DISCREPANCY", "Payment discrepancy"],
  ["CUSTOMER_COMPLAINT", "Customer complaint"],
  ["DELIVERY_FAILURE", "Delivery failure"],
  ["OTHER", "Something else"],
] as const;

const DEPARTMENTS = [
  ["", "Whoever picks it up"],
  ["CHINA_WAREHOUSE", "China Warehouse"],
  ["DAR_WAREHOUSE", "Dar Warehouse"],
  ["FINANCE", "Finance"],
  ["CUSTOMER_SUPPORT", "Customer Support"],
  ["MANAGEMENT", "Management"],
] as const;

export function NewExceptionForm({
  cargo,
  fixedCargoId,
  defaultCargoId,
}: {
  cargo: { id: string; label: string }[];
  fixedCargoId?: string;
  /** The consignment the desk arrived here looking at, chosen but changeable. */
  defaultCargoId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(
    raiseException,
    {}
  );

  useEffect(() => {
    if (state.id) {
      setOpen(false);
      router.push(`/app/exceptions/${state.id}`);
    }
  }, [state.id, router]);

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus />
        Raise an issue
      </Button>
    );
  }

  return (
    <Card className="w-full p-6">
      <form action={action} className="space-y-4">
        {fixedCargoId ? (
          <input type="hidden" name="cargoId" value={fixedCargoId} />
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="type">What kind of issue?</Label>
            <NativeSelect id="type" name="type" defaultValue="OTHER">
              {TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <NativeSelect id="priority" name="priority" defaultValue="NORMAL">
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="department">Whose desk?</Label>
            <NativeSelect id="department" name="department" defaultValue="">
              {DEPARTMENTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        {!fixedCargoId ? (
          <div className="space-y-2">
            <Label htmlFor="cargoId">Which consignment? (optional)</Label>
            <NativeSelect
              id="cargoId"
              name="cargoId"
              defaultValue={
                defaultCargoId && cargo.some((c) => c.id === defaultCargoId)
                  ? defaultCargoId
                  : ""
              }
            >
              <option value="">Not about one consignment</option>
              {cargo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            required
            placeholder="Two cartons short on MSCU7741203"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">What happened?</Label>
          <Textarea id="description" name="description" required rows={4} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="evidence">Photos or documents</Label>
          <Input
            id="evidence"
            name="evidence"
            type="file"
            accept="image/*,application/pdf"
            multiple
          />
        </div>

        <FormMessage error={state.error} ok={state.ok} />
        <div className="flex gap-2">
          <SubmitButton>Open case</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function CaseActions({
  caseId,
  status,
  staff,
  canResolve,
  canClose,
  canAssign,
}: {
  caseId: string;
  status: string;
  staff: { id: string; name: string }[];
  canResolve: boolean;
  canClose: boolean;
  canAssign: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    updateException,
    {}
  );

  /* The case's own status is always offered even to a desk that could not have
     set it. Without it the select falls back to "Open", and a note added to a
     resolved case quietly reopens it. */
  const statuses = [
    ["OPEN", "Open"],
    ["INVESTIGATING", "Investigating"],
    ["WAITING_CUSTOMER", "Waiting on customer"],
    ["WAITING_FINANCE", "Waiting on Finance"],
    ["WAITING_WAREHOUSE", "Waiting on warehouse"],
    ["ESCALATED", "Escalated"],
    ...(canResolve || status === "RESOLVED" ? ([["RESOLVED", "Resolved"]] as const) : []),
    ...(canClose || status === "CLOSED" ? ([["CLOSED", "Closed"]] as const) : []),
  ] as const;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="caseId" value={caseId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <NativeSelect id="status" name="status" defaultValue={status}>
            {statuses.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        {canAssign ? (
          <div className="space-y-2">
            <Label htmlFor="assignedToId">Assign to</Label>
            <NativeSelect id="assignedToId" name="assignedToId" defaultValue="">
              <option value="">Leave as is</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">Add a note</Label>
        <Textarea id="note" name="note" rows={3} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="case-evidence">Add photos or documents</Label>
        <Input
          id="case-evidence"
          name="evidence"
          type="file"
          accept="image/*,application/pdf"
          multiple
        />
      </div>

      {canResolve ? (
        <div className="space-y-2">
          <Label htmlFor="resolution">Resolution</Label>
          <Textarea
            id="resolution"
            name="resolution"
            rows={2}
            placeholder="What was actually done about it."
          />
          <p className="text-xs text-muted-foreground">
            Resolving or closing clears the warehouse flag, so the cargo can be
            verified and released again.
          </p>
        </div>
      ) : null}

      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton>Record</SubmitButton>
    </form>
  );
}
