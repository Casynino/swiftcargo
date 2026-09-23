"use client";

import { useActionState, useState } from "react";
import { Check, DoorOpen, Search, TriangleAlert, X } from "lucide-react";

import { releaseCargo, type ActionState } from "@/lib/actions/release";
import { raiseException, type ActionState as ExceptionState } from "@/lib/actions/exceptions";
import { FormMessage } from "@/components/app/form-message";
import { PhotoCapture } from "@/components/app/photo-capture";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { useT } from "@/components/app/locale-provider";
import { Tx } from "@/components/app/tx";
/** How the receiver is described back to the clerk, once collecting-as is
    anything but the customer themselves. */
const RELATIONSHIP_WORDS: Record<string, string> = {
  SELF: "the customer",
  AGENT: "agent / transporter",
  EMPLOYEE: "their employee",
  FAMILY: "family member",
};
/**
 * The seven conditions, spelled out.
 *
 * A blocked release shows exactly which one failed, so the person at the
 * counter can tell the customer what is missing instead of "the system won't
 * let me". That sentence is what makes people work around a system.
 */
export function ReleaseChecklist({
  conditions,
}: {
  conditions: { label: string; passed: boolean; detail?: string }[];
}) {
  return (
    <ul className="space-y-2">
      {conditions.map((c) => (
        <li key={c.label} className="flex items-start gap-2.5 text-sm">
          <span
            className={cn(
              "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
              c.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
            )}
          >
            {c.passed ? <Check className="size-3" /> : <X className="size-3" />}
          </span>
          <span className={c.passed ? "" : "font-medium"}>
            <Tx>{c.label}</Tx>
            {c.detail ? (
              <span className="block text-xs font-normal text-muted-foreground">
                <Tx>{c.detail}</Tx>
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ReleaseForm({
  cargoId,
  reference,
  packages,
  receiverName,
  receiverPhone,
  pickupNoteNumber,
  boxes,
  armed,
  scanImpossible,
}: {
  cargoId: string;
  reference: string;
  packages: number;
  receiverName: string;
  receiverPhone: string;
  pickupNoteNumber: string | null;
  boxes: { done: number; total: number };
  /** Every box scanned out — the counter's own proof, not a checkbox. */
  armed: boolean;
  /** "The label cannot be read — release without scanning" was pressed. */
  scanImpossible?: boolean;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    releaseCargo,
    {}
  );
  const [receiver, setReceiver] = useState(receiverName);
  const [relationship, setRelationship] = useState<keyof typeof RELATIONSHIP_WORDS>("SELF");

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="cargoId" value={cargoId} />
      {/* This screen is the in-person counter; a home delivery is arranged
          and tracked from /app/deliveries, a different job with its own
          form. */}
      <input type="hidden" name="method" value="COLLECTION" />
      <input type="hidden" name="packagesReleased" value={packages} />
      <input
        type="hidden"
        name="relationship"
        value={relationship === "SELF" ? "" : RELATIONSHIP_WORDS[relationship]}
      />
      {scanImpossible ? <input type="hidden" name="noScan" value="1" /> : null}

      {scanImpossible ? (
        <div className="rounded-xl border-2 border-warning/50 bg-warning/10 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-warning">
            <TriangleAlert className="size-4 shrink-0" />
            {tx("Releasing without scanning the label")}
          </p>
          <p className="mt-1 text-xs text-warning/90">
            {tx(
              "You opened this from the unreadable-label list. Check the tracking number against the customer's paperwork yourself, and make sure the cargo is in the handover photograph — that photo is the only record that the right boxes left the building."
            )}
          </p>
        </div>
      ) : null}

      {boxes.total > 0 ? (
        <p className="text-xs text-muted-foreground">
          {tx("Boxes scanned out")}: {boxes.done} {tx("of")} {boxes.total}
        </p>
      ) : null}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">{tx("Who is collecting?")}</h3>

        <div className="space-y-2">
          <Label htmlFor="collectedByName">{tx("Receiver name")}</Label>
          <Input
            id="collectedByName"
            name="collectedByName"
            required
            value={receiver}
            onChange={(e) => setReceiver(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="collectedByPhone">{tx("Receiver phone")}</Label>
          <Input
            id="collectedByPhone"
            name="collectedByPhone"
            defaultValue={receiverPhone}
            inputMode="tel"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="relationship-select">{tx("Collecting as")}</Label>
            <NativeSelect
              id="relationship-select"
              value={relationship}
              onChange={(e) =>
                setRelationship(e.target.value as keyof typeof RELATIONSHIP_WORDS)
              }
            >
              <option value="SELF">{tx("The customer")}</option>
              <option value="AGENT">{tx("Agent / transporter")}</option>
              <option value="EMPLOYEE">{tx("Their employee")}</option>
              <option value="FAMILY">{tx("Family member")}</option>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="collectedByIdNo">
              {tx("ID number")}{" "}
              <span className="text-muted-foreground">
                {relationship === "SELF"
                  ? tx("if you checked one")
                  : tx("required — someone else is collecting")}
              </span>
            </Label>
            <Input id="collectedByIdNo" name="collectedByIdNo" />
          </div>
        </div>

        {pickupNoteNumber ? (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-dashed p-3 text-sm">
            <input type="checkbox" name="noPickupNote" value="1" className="mt-0.5" />
            <span>
              {tx("The customer has no printed pickup note")}
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {tx("The note on file is")} {pickupNoteNumber}. {tx("Tick this only if they cannot show it.")}
              </span>
            </span>
          </label>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="rel-notes">{tx("Note")}</Label>
          <Textarea id="rel-notes" name="notes" rows={2} />
        </div>
      </div>

      <div className="border-t pt-5">
        {/* "Expected", not "Required" — releaseCargo will not block a
            handover on a flat battery. A paying customer sent away from the
            counter is worse than a consignment recorded without a picture. */}
        <h3 className="mb-1 text-sm font-semibold">{tx("Photograph the handover")}</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          {tx(
            "Expected. This is your proof the cargo was collected, and what settles a dispute later — you can still save without one."
          )}
        </p>
        <PhotoCapture name="photos" required={false} />
      </div>

      <FormMessage error={state.error} ok={state.ok} />

      <div className="space-y-3 border-t pt-4">
        {armed ? (
          <p className="text-sm">
            {tx("Handing")} <span className="tnum font-semibold">{reference}</span>{" "}
            {tx("to")} <span className="font-semibold">{receiver || "—"}</span>
            {relationship !== "SELF" ? (
              <span className="text-muted-foreground"> ({tx(RELATIONSHIP_WORDS[relationship])})</span>
            ) : null}
            .
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{tx("Scan the box before releasing it.")}</p>
        )}
        <SubmitButton disabled={!armed} pendingLabel={tx("Releasing…")} className="w-full sm:w-auto">
          <DoorOpen />
          {tx("Release cargo")}
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * THE OTHER OUTCOME.
 *
 * Sometimes the record says the cargo is here and the shelf says otherwise,
 * and the wrong thing to do then is release it anyway and sort it out later.
 * Sits outside the release form on purpose — a form inside a form is invalid,
 * and this must never be submitted by the same tap as a handover. Raises the
 * same case the rest of the business already uses (`raiseException`), rather
 * than a parallel "cannot find it" record of its own.
 */
export function UnableToLocateCargo({
  cargoId,
  reference,
  onDone,
}: {
  cargoId: string;
  reference: string;
  onDone: () => void;
}) {
  const tx = useT();
  const [state, action] = useActionState<ExceptionState, FormData>(raiseException, {});
  const [open, setOpen] = useState(false);

  if (state.ok && !open) {
    onDone();
    return null;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring min-h-11 text-sm font-medium text-destructive underline underline-offset-2"
      >
        {tx("Unable to locate cargo")}
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-xl border-2 border-destructive/40 bg-destructive/5 p-4">
      <input type="hidden" name="type" value="MISSING_CARGO" />
      <input type="hidden" name="priority" value="URGENT" />
      <input type="hidden" name="department" value="DAR_WAREHOUSE" />
      <input type="hidden" name="cargoId" value={cargoId} />
      <input type="hidden" name="title" value={`Cannot find ${reference} at the counter`} />
      <div className="space-y-2">
        <Label htmlFor="unable-description" className="text-destructive">
          {tx("What happened")}
        </Label>
        <Textarea
          id="unable-description"
          name="description"
          rows={2}
          required
          placeholder={tx("Cleared and paid, but the boxes are not on the shelf where they should be.")}
        />
      </div>
      <FormMessage error={state.error} ok={state.ok} />
      <div className="flex gap-2">
        <SubmitButton variant="outline" className={cn("border-destructive/50 text-destructive")}>
          <Search className="size-4" />
          {tx("Report it")}
        </SubmitButton>
      </div>
    </form>
  );
}
