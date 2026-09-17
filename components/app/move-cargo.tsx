"use client";

import { useActionState } from "react";
import { ArrowRightLeft, PackageX } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  putOnArrivedContainer,
  takeOffArrivedContainer,
  type ActionState,
} from "@/lib/actions/containers";

/**
 * PUT A CONSIGNMENT ON THE CONTAINER IT ACTUALLY CAME OFF.
 *
 * The packing list is written in Guangzhou and read in Dar, and the first
 * person to check one against real cargo is standing on the Dar floor with the
 * box open. What they find is a bale on the paper that never came off, or one
 * in front of them that is on nobody's list. Until now they could only leave
 * the manifest wrong — and a wrong manifest is a wrong price list, because the
 * container is what Finance confirms prices against.
 *
 * A reason is asked for and kept. "Which container was this on" is a question
 * somebody asks about one specific bale six months from now, and the answer has
 * to be more than that it changed.
 */
export function MoveCargo({
  cargoId,
  containerId,
  reference,
  containers,
}: {
  cargoId: string;
  /** The container it is on now. */
  containerId: string;
  reference: string;
  /** Landed containers it could belong to instead, this one excluded. */
  containers: { id: string; reference: string }[];
}) {
  const [moveState, move] = useActionState<ActionState, FormData>(
    putOnArrivedContainer,
    {}
  );
  const [offState, takeOff] = useActionState<ActionState, FormData>(
    takeOffArrivedContainer,
    {}
  );

  return (
    <div className="space-y-4 text-left">
      <p className="tnum text-xs font-semibold">{reference}</p>

      {containers.length > 0 ? (
        <form action={move} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="cargoId" value={cargoId} />
          <NativeSelect name="containerId" required className="w-56" aria-label="Move it to">
            <option value="">Move it to…</option>
            {containers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.reference}
              </option>
            ))}
          </NativeSelect>
          <Input
            name="reason"
            required
            minLength={3}
            placeholder="Why — e.g. came off the next box down"
            className="min-w-[16rem] flex-1"
          />
          <SubmitButton size="sm" pendingLabel="Moving…">
            <ArrowRightLeft />
            Move
          </SubmitButton>
          <p className="w-full text-xs text-muted-foreground">
            Its draft bill and its history move with it, and both containers&rsquo;
            figures follow.
          </p>
          <FormMessage error={moveState.error} ok={moveState.ok} />
        </form>
      ) : null}

      <form action={takeOff} className="flex flex-wrap items-end gap-2 border-t pt-3">
        <input type="hidden" name="cargoId" value={cargoId} />
        <input type="hidden" name="containerId" value={containerId} />
        <Input
          name="reason"
          required
          minLength={3}
          placeholder="Why it is not on this container"
          className="min-w-[16rem] flex-1"
        />
        {/* NOTHING CLOSES THIS PANEL ON THE WAY OUT.

            The button used to collapse the row in its own click handler, which
            unmounted the form React was about to submit from — so the press
            looked like it worked and the consignment stayed on the manifest.
            The row closes when the answer comes back and the page re-renders,
            and the answer is read here first. */}
        <SubmitButton size="sm" variant="outline" pendingLabel="Taking it off…">
          <PackageX />
          Take it off the manifest
        </SubmitButton>
        <p className="w-full text-xs text-muted-foreground">
          For a consignment that was on the paper and not in the box. It goes back
          to being Guangzhou&rsquo;s until somebody finds it.
        </p>
        <FormMessage error={offState.error} ok={offState.ok} />
      </form>
    </div>
  );
}

/**
 * THE OTHER HALF: A CONSIGNMENT IN THE BOX THAT IS ON NOBODY'S LIST.
 *
 * Picked off what already exists, never retyped. A bale that came off this
 * container with a mark the packing list does not carry is still a consignment
 * Guangzhou took in, with its own reference and its own measurements.
 */
export function AddToContainer({
  containerId,
  candidates,
}: {
  containerId: string;
  candidates: { id: string; label: string }[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    putOnArrivedContainer,
    {}
  );

  if (candidates.length === 0) return null;

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="containerId" value={containerId} />
      <NativeSelect
        name="cargoId"
        required
        className="w-72"
        aria-label="Consignment to add to this container"
      >
        <option value="">Add a consignment that came off this box…</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </NativeSelect>
      <Input
        name="reason"
        required
        minLength={3}
        placeholder="Why — e.g. mark not on the packing list"
        className="min-w-[14rem] flex-1"
      />
      <SubmitButton size="sm" variant="outline" pendingLabel="Adding…">
        Add to the manifest
      </SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
