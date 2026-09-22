"use client";

import { useActionState, useState } from "react";
import { ArrowRightLeft, Lock, PackageX, TriangleAlert } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { useT } from "@/components/app/locale-provider";
import { NativeSelect } from "@/components/ui/native-select";
import {
  advanceContainer,
  putOnArrivedContainer,
  type ActionState,
} from "@/lib/actions/containers";
import { reportMissingAtDar } from "@/lib/actions/dar";

export type RemainingLine = {
  cargoId: string;
  reference: string;
  customer: string;
  /** What the packing list says should have come off. */
  packages: number;
};

/**
 * SHUTTING THE BOX, AND THE QUESTION THAT COMES FIRST.
 *
 * A container is closed when everything on its manifest has been accounted
 * for. Anything nobody has counted is a question, not a rounding error, and
 * this panel asks it by name: for each consignment still open, either it
 * travelled on another box and moves there, or it did not come off at all and
 * is reported missing with a case.
 *
 * MOVING CARRIES THE CONSIGNMENT ACROSS UNCHANGED. Its measurements are the
 * ones the warehouse recorded, its bill is its own, and its storage clock runs
 * from the day Dar booked it in — none of which this touches. What moves is
 * which box it is listed against, written down with the old value and a
 * reason. A consignment with a bill already issued is refused: the invoice
 * names the sailing, so Finance unpicks that first.
 *
 * Nothing is deleted to make a container add up, here or anywhere else.
 */
export function ClosePanel({
  containerId,
  remaining,
  targets,
  canClose,
  canMove,
  canReportMissing,
  summary,
}: {
  containerId: string;
  remaining: RemainingLine[];
  /** Other sailings a consignment could have travelled on. */
  targets: { id: string; label: string }[];
  canClose: boolean;
  canMove: boolean;
  canReportMissing: boolean;
  /** Expected, received and missing packages, already counted. */
  summary: { expected: number; received: number; missing: number };
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    advanceContainer,
    {}
  );

  const open = remaining.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-lg font-semibold tracking-tight">
            {tx("Close the container")}
          </p>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {open
              ? tx("Every consignment on the manifest has to be accounted for first. Move the ones that travelled on another box, and report the ones that never came off.")
              : tx("Everything on the manifest is accounted for. Closing is the last word on this sailing — nothing more can happen to a closed container.")}
          </p>
        </div>
        {/* The box's own arithmetic, so whoever shuts it sees what they are
            signing for without opening the dock. */}
        <dl className="flex gap-5 text-sm">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {tx("Expected")}
            </dt>
            <dd className="tnum font-semibold">{summary.expected}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {tx("Received")}
            </dt>
            <dd className="tnum font-semibold">{summary.received}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {tx("Missing")}
            </dt>
            <dd
              className={
                summary.missing > 0
                  ? "tnum font-semibold text-destructive"
                  : "tnum font-semibold"
              }
            >
              {summary.missing}
            </dd>
          </div>
        </dl>
      </div>

      {open ? (
        <div className="rounded-xl border border-warning/40 bg-warning/5">
          <p className="flex items-center gap-2 border-b border-warning/30 px-4 py-2.5 text-sm font-medium">
            <TriangleAlert className="size-4 text-warning" />
            {remaining.length}{" "}
            {remaining.length === 1
              ? tx("consignment is still not accounted for")
              : tx("consignments are still not accounted for")}
          </p>
          {!canReportMissing ? (
            /* The desk that looked in the box is the desk that can say a thing
               was not in it. Finance shuts the sailing; it does not declare a
               consignment missing on the floor's behalf. */
            <p className="border-b border-warning/20 px-4 py-2 text-xs text-muted-foreground">
              {tx("Dar reports what never came off. Move a consignment that sailed on another box, or ask the floor to finish this one on the receiving dock.")}
            </p>
          ) : null}
          <ul className="divide-y divide-warning/20">
            {remaining.map((line) => (
              <RemainingRow
                key={line.cargoId}
                containerId={containerId}
                line={line}
                targets={targets}
                canMove={canMove}
                canReportMissing={canReportMissing}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {canClose ? (
        <form action={action} className="space-y-3">
          <input type="hidden" name="containerId" value={containerId} />
          <input type="hidden" name="to" value="CLOSED" />
          <FormMessage error={state.error} ok={state.ok} />
          <SubmitButton
            size="lg"
            disabled={open}
            className="h-12 w-full gap-2 text-base sm:w-auto sm:px-6"
            pendingLabel={tx("Closing the container…")}
          >
            <Lock />
            {tx("Close the container")}
          </SubmitButton>
          <p className="text-xs text-muted-foreground">
            {open
              ? tx("Deal with the consignments above first.")
              : tx("Today's date and time are recorded with your name.")}
          </p>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          {tx("Finance, the manager or the owner closes the container once Dar has checked everything off it.")}
        </p>
      )}
    </div>
  );
}

/**
 * One consignment nobody has counted, and the two honest answers.
 *
 * "It sailed on another box" moves it there as it stands. "It never came off"
 * opens a case and leaves it on this manifest, marked missing — which is what
 * keeps a container's received count honest instead of quietly shrinking the
 * list until the arithmetic works.
 */
function RemainingRow({
  containerId,
  line,
  targets,
  canMove,
  canReportMissing,
}: {
  containerId: string;
  line: RemainingLine;
  targets: { id: string; label: string }[];
  canMove: boolean;
  canReportMissing: boolean;
}) {
  const tx = useT();
  const [moveState, move] = useActionState<ActionState, FormData>(
    putOnArrivedContainer,
    {}
  );
  const [missingState, missing] = useActionState<ActionState, FormData>(
    reportMissingAtDar,
    {}
  );
  const [target, setTarget] = useState("");

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-[12rem] flex-1">
        <p className="tnum text-sm font-semibold">{line.reference}</p>
        <p className="text-xs text-muted-foreground">
          {line.customer} · {line.packages}{" "}
          {line.packages === 1 ? tx("package") : tx("packages")}{" "}
          {tx("expected")}
        </p>
      </div>

      {canMove && targets.length > 0 ? (
        <form action={move} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="cargoId" value={line.cargoId} />
          {/* The box it is moving TO. The one it is leaving is recorded from
              the consignment itself, old value first. */}
          <input type="hidden" name="containerId" value={target} />
          <input
            type="hidden"
            name="reason"
            value={`Moved while the container was being closed`}
          />
          <NativeSelect
            aria-label={tx("Move to another container")}
            className="w-64"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">{tx("Sailed on another box…")}</option>
            {targets
              .filter((t) => t.id !== containerId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
          </NativeSelect>
          <SubmitButton size="sm" variant="outline" disabled={!target} pendingLabel={tx("Moving it…")}>
            <ArrowRightLeft />
            {tx("Move")}
          </SubmitButton>
        </form>
      ) : null}

      {canReportMissing ? (
        <form action={missing}>
          <input type="hidden" name="cargoId" value={line.cargoId} />
          <input
            type="hidden"
            name="note"
            value={`Not found when the container was closed.`}
          />
          <SubmitButton
            size="sm"
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
            pendingLabel={tx("Reporting…")}
          >
            <PackageX />
            {tx("Never came off")}
          </SubmitButton>
        </form>
      ) : null}

      <div className="w-full">
        <FormMessage error={moveState.error ?? missingState.error} ok={moveState.ok ?? missingState.ok} />
      </div>
    </li>
  );
}
