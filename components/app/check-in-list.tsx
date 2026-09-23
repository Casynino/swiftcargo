"use client";

import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Camera,
  Check,
  CheckCheck,
  ChevronRight,
  PackageOpen,
  Scale,
} from "lucide-react";

import { DamageTag } from "@/components/app/damage-tag";
import { DarReceiveForm } from "@/components/app/dar-receive-form";
import { FormMessage } from "@/components/app/form-message";
import { MissingCargoButton } from "@/components/app/missing-cargo-button";
import { AddToContainer, MoveCargo } from "@/components/app/move-cargo";
import { RowDialog } from "@/components/app/row-dialog";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  acceptAsExpected,
  setCheckInCargoType,
  verifyContainer,
  type ActionState,
} from "@/lib/actions/dar";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { distinctMark } from "@/lib/customer-name";

import { Tx } from "@/components/app/tx";
export type CheckInRow = {
  id: string;
  reference: string;
  shippingMark: string | null;
  customer: string;
  customerPhone: string | null;
  description: string;
  cargoTypes: string[];
  photos: number;
  /** What Guangzhou recorded, or what was declared if they recorded nothing. */
  expectedPackages: number;
  expectedPieces: number;
  expectedCbm: string | null;
  expectedWeight: string | null;
  /** What Dar actually counted. Null until somebody has. */
  arrivedPackages: number | null;
  arrivedPieces: number | null;
  arrivedCbm: string | null;
  arrivedWeight: string | null;
  discrepancy: boolean;
  verified: boolean;
  missing: boolean;
  /** Not GOOD on the Dar receiving row: the tag stays visible from here on. */
  condition: string | null;
  damaged: boolean;
  hasCase: boolean;
  /** Put on this manifest at Dar, not loaded into the box in Guangzhou. */
  added: boolean;
  china: {
    packagesCount: number;
    piecesCount: number | null;
    weightKg: string | null;
    cbm: string;
  } | null;
  existing: {
    packagesCount: number;
    piecesCount: number | null;
    weightKg: string | null;
    cbm: string | null;
    condition: string;
    location: string | null;
    notes: string | null;
    discrepancyNotes: string | null;
    warehouseId: string;
  } | null;
};

/** The questions the floor asks of one container, in the order it asks them. */
type Lens =
  | "all"
  | "unchecked"
  | "checked"
  | "verified"
  | "damaged"
  | "missing"
  | "discrepancies"
  | "added";

const LENSES: { key: Lens; label: string }[] = [
  { key: "all", label: "Expected" },
  { key: "unchecked", label: "Unchecked" },
  { key: "checked", label: "Received" },
  { key: "verified", label: "Signed off" },
  { key: "damaged", label: "Damaged" },
  { key: "missing", label: "Missing" },
  { key: "discrepancies", label: "Discrepancies" },
  { key: "added", label: "Added here" },
];

function matchesLens(row: CheckInRow, lens: Lens) {
  switch (lens) {
    case "unchecked":
      return row.arrivedPackages === null && !row.missing;
    case "checked":
      return row.arrivedPackages !== null;
    case "verified":
      return row.verified;
    case "damaged":
      return row.damaged;
    case "missing":
      return row.missing;
    case "discrepancies":
      return !row.missing && (row.discrepancy || row.hasCase);
    case "added":
      return row.added;
    default:
      return true;
  }
}

/**
 * CHECKING A CONTAINER OFF.
 *
 * One row per consignment, one press for the answer. The overwhelming majority
 * came exactly as Guangzhou sent them, so the tick means "what China recorded is
 * what is in front of me" and writes that count under the clerk's name — no form
 * for the ninety that are fine, a form only for the ten that are not.
 *
 * Three answers, in the order they actually happen: it is here and correct, the
 * count is different, something is wrong with it. The row expands for the detail
 * somebody needs before deciding, and "Open" is the way to the whole record.
 */
export function CheckInList({
  containerId,
  rows,
  warehouses,
  defaultWarehouseId,
  cargoTypes,
  otherContainers,
  addable,
  canAmend,
  canConfirmUnchecked,
}: {
  containerId: string;
  rows: CheckInRow[];
  warehouses: { id: string; name: string }[];
  defaultWarehouseId: string | null;
  /** The rate book's own categories, for the type picked on the row. */
  cargoTypes: string[];
  /** Other landed containers, for a consignment that came off the wrong one. */
  otherContainers: { id: string; reference: string }[];
  /** Consignments that could be added to this manifest. */
  addable: { id: string; label: string }[];
  canAmend: boolean;
  /** May this desk sign the box off over cargo nobody counted? */
  canConfirmUnchecked: boolean;
}) {
  /* Everything still open starts ticked — the common case is one answer for
     the whole container, and unticking the few that do not apply is less
     work than ticking eighty-eight of ninety by hand. */
  const [picked, setPicked] = useState<Set<string>>(
    () =>
      new Set(
        rows
          .filter((r) => r.arrivedPackages === null && !r.missing)
          .map((r) => r.id)
      )
  );
  const [lens, setLens] = useState<Lens>("all");

  const checked = rows.filter((r) => r.arrivedPackages !== null || r.missing).length;
  const flagged = rows.filter((r) => r.discrepancy || r.missing || r.hasCase).length;
  const open = rows.filter((r) => r.arrivedPackages === null && !r.missing);
  const pickedOpen = open.filter((r) => picked.has(r.id));
  const allOpenPicked = open.length > 0 && pickedOpen.length === open.length;

  /*
    THE SAME LIST, SEEN THROUGH ONE QUESTION AT A TIME.

    A container of ninety is worked as a series of small jobs — tick the clean
    ones, photograph the wet ones, chase the three nobody can find — and hunting
    for them in one flat table of ninety is how a bale gets missed. These are
    not other lists: they are the rows already on screen, with everything that
    is not the current question hidden. The counts are the answer to "how much
    of each is there", which is the question the floor is asked on the phone.
  */
  const counts: Record<Lens, number> = {
    all: rows.length,
    unchecked: open.length,
    checked: rows.filter((r) => r.arrivedPackages !== null).length,
    verified: rows.filter((r) => r.verified).length,
    damaged: rows.filter((r) => r.damaged).length,
    missing: rows.filter((r) => r.missing).length,
    /* The same rule the container's own counter above uses, so the chip and
       the strip can never disagree about the box in front of the clerk. */
    discrepancies: rows.filter((r) => !r.missing && (r.discrepancy || r.hasCase))
      .length,
    added: rows.filter((r) => r.added).length,
  };
  const shown = rows.filter((r) => matchesLens(r, lens));

  const pick = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setPicked((current) =>
      current.size === open.length && open.every((r) => current.has(r.id))
        ? new Set()
        : new Set(open.map((r) => r.id))
    );

  return (
    <div className="space-y-4">
      {/* Stays put while the list scrolls: the clerk needs to know how far off
          finishing they are without scrolling back to the top of ninety rows. */}
      <div className="sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 p-4 shadow-soft backdrop-blur">
        <div className="flex-1">
          <p className="tnum text-sm font-medium">
            {checked} of {rows.length} checked
            {flagged > 0 ? ` · ${flagged} flagged` : ""}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{
                width: `${rows.length ? (checked / rows.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {open.length > 0 ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setPicked(new Set())}
                disabled={pickedOpen.length === 0}
              >
                Clear
              </Button>
              <AcceptPicked
                cargoIds={pickedOpen.map((r) => r.id)}
                onDone={() => setPicked(new Set())}
              />
            </>
          ) : null}
          <FinishCheckIn
            containerId={containerId}
            remaining={open.map((r) => r.id)}
            toVerify={
              rows.filter((r) => r.arrivedPackages !== null && !r.verified && !r.discrepancy)
                .length
            }
            canConfirmUnchecked={canConfirmUnchecked}
          />
        </div>
        <div className="flex w-full flex-wrap items-center gap-1.5 border-t pt-3">
          {LENSES.map((option) => {
            const n = counts[option.key];
            if (option.key !== "all" && n === 0) return null;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setLens(option.key)}
                aria-pressed={lens === option.key}
                className={cn(
                  "focus-ring inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  lens === option.key
                    ? "border-brand bg-brand/10 text-brand"
                    : "text-muted-foreground hover:bg-secondary"
                )}
              >
                <Tx>{option.label}</Tx>
                <span className="tnum rounded-full bg-secondary px-1.5 text-[0.7rem] text-foreground">
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-2">
                  {open.length > 0 ? (
                    <input
                      type="checkbox"
                      checked={allOpenPicked}
                      onChange={toggleAll}
                      aria-label="Pick every unchecked row"
                      className="size-4 accent-[var(--brand)]"
                    />
                  ) : null}
                </th>
                <th className="px-3 py-2 font-medium">Tracking</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Goods</th>
                <th className="hidden px-3 py-2 font-medium lg:table-cell">
                  Type
                </th>
                <th className="px-3 py-2 text-right font-medium">Expected</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                  Counted as
                </th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">
                  Proof
                </th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">
                  Status
                </th>
                <th className="w-28 px-3 py-2 text-center font-medium">Check</th>
                <th className="w-16 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <CheckInRowView
                  key={row.id}
                  containerId={containerId}
                  row={row}
                  warehouses={warehouses}
                  defaultWarehouseId={defaultWarehouseId}
                  cargoTypes={cargoTypes}
                  otherContainers={otherContainers}
                  canAmend={canAmend}
                  picked={picked.has(row.id)}
                  onPick={
                    row.arrivedPackages === null && !row.missing
                      ? () => pick(row.id)
                      : undefined
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
        {canAmend ? (
          /* A bale comes off with a mark the packing list does not carry. It is
             already a consignment somebody took in — it is picked, never
             retyped — and from here it is checked in with the rest of the box. */
          <div className="border-t bg-secondary/30 px-4 py-3">
            <AddToContainer containerId={containerId} candidates={addable} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * THE LAST PRESS OF THE JOB.
 *
 * Confirming the container is the floor saying every consignment on the
 * manifest has been accounted for. Signing off what is counted and shutting the
 * box are both that one sentence, so they are one press.
 *
 * IT DOES NOT RULE ON ROWS NOBODY LOOKED AT. This press used to record every
 * untouched consignment as present and undamaged on its way past, warned about
 * in small type that read like a footnote rather than a decision about real
 * cartons on a real floor. Ticking them through is still one press — it is just
 * a press that says what it is doing, and the clerk chooses it.
 *
 * The confirmation refuses while anything is unchecked; the server decides
 * that, not this component, and the override below only puts a reason in front
 * of a desk that already holds the authority for it.
 */
function FinishCheckIn({
  containerId,
  remaining,
  toVerify,
  canConfirmUnchecked,
}: {
  containerId: string;
  remaining: string[];
  toVerify: number;
  canConfirmUnchecked: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  if (remaining.length === 0 && toVerify === 0) return null;

  /** Tick the untouched rows through as sent, then confirm the container. */
  function tickThroughAndConfirm() {
    setError(null);
    start(async () => {
      const body = new FormData();
      for (const id of remaining) body.append("cargoIds", id);
      const accepted = await acceptAsExpected({}, body);
      if (accepted.error) {
        setError(accepted.error);
        return;
      }
      await confirm();
    });
  }

  async function confirm(overrideReason?: string) {
    const sign = new FormData();
    sign.set("containerId", containerId);
    if (overrideReason) sign.set("overrideReason", overrideReason);
    const signed = await verifyContainer({}, sign);
    if (signed.error) {
      setError(signed.error);
      return;
    }
    setAsking(false);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {asking ? (
        <div className="w-80 rounded-lg border bg-card p-3 shadow-raised">
          <p className="text-sm font-medium">Confirm this container?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Everything counted and clean is signed off, and the box is closed.
            Anything missing or damaged keeps its case and does not hold the rest
            up.
          </p>

          {remaining.length > 0 ? (
            <>
              <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                <span className="font-semibold">
                  {remaining.length} not yet checked.
                </span>{" "}
                They are either on the floor or they are a case, and the
                container cannot be confirmed until somebody says which.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2 w-full"
                onClick={tickThroughAndConfirm}
                disabled={pending}
              >
                {pending
                  ? "Checking in…"
                  : `Tick the ${remaining.length} through as sent, then confirm`}
              </Button>
              {canConfirmUnchecked ? (
                /* The evening decision, with a name on it. Every consignment it
                   rules over keeps a case, so none of them leaves the dock
                   without a list it is still on. */
                <div className="mt-3 border-t pt-3">
                  <label
                    htmlFor="override-reason"
                    className="text-xs font-medium"
                  >
                    Or confirm over them (a note, if you want one)
                  </label>
                  <Input
                    id="override-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Optional note"
                    className="mt-1.5 h-8 text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="mt-2 w-full"
                    disabled={pending}
                    onClick={() => {
                      setError(null);
                      start(async () => {
                        await confirm(reason.trim());
                      });
                    }}
                  >
                    Confirm over {remaining.length} unchecked
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}

          {error ? (
            <p className="mt-2 text-xs font-medium text-destructive">{error}</p>
          ) : null}

          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setAsking(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            {remaining.length === 0 ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setError(null);
                  start(async () => {
                    await confirm();
                  });
                }}
                disabled={pending}
              >
                {pending ? "Confirming…" : "Yes, confirm"}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" onClick={() => setAsking(true)}>
          <CheckCheck />
          Confirm container
        </Button>
      )}
      {!asking && error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

/** The armful: twenty ticked before lunch, the rest after. */
function AcceptPicked({
  cargoIds,
  onDone,
}: {
  cargoIds: string[];
  onDone: () => void;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    acceptAsExpected,
    {}
  );
  return (
    <form action={action} onSubmit={() => setTimeout(onDone, 0)}>
      {cargoIds.map((id) => (
        <input key={id} type="hidden" name="cargoIds" value={id} />
      ))}
      <SubmitButton size="sm" pendingLabel="Checking in…" disabled={cargoIds.length === 0}>
        <CheckCheck />
        Check in {cargoIds.length} picked
      </SubmitButton>
      {state.error ? (
        <p className="mt-1 text-xs text-destructive">{state.error}</p>
      ) : null}
    </form>
  );
}

function CheckInRowView({
  containerId,
  row,
  warehouses,
  defaultWarehouseId,
  cargoTypes,
  otherContainers,
  canAmend,
  picked,
  onPick,
}: {
  containerId: string;
  row: CheckInRow;
  warehouses: { id: string; name: string }[];
  defaultWarehouseId: string | null;
  cargoTypes: string[];
  otherContainers: { id: string; reference: string }[];
  canAmend: boolean;
  picked: boolean;
  onPick?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [counting, setCounting] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [moving, setMoving] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(
    acceptAsExpected,
    {}
  );

  const done = row.arrivedPackages !== null;
  const short =
    done && row.arrivedPackages !== null
      ? row.expectedPackages - row.arrivedPackages
      : 0;

  return (
    <>
      <tr
        className={cn(
          "border-t align-middle",
          row.missing && "bg-destructive/5",
          done && !row.discrepancy && "bg-success/[0.04]",
          row.discrepancy && "bg-warning/5"
        )}
      >
        <td className="px-2 py-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={`Details for ${row.reference}`}
              className="focus-ring rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <ChevronRight
                className={cn("size-4 transition-transform", expanded && "rotate-90")}
              />
            </button>
          </div>
          {onPick ? (
            <input
              type="checkbox"
              checked={picked}
              onChange={onPick}
              aria-label={`Pick ${row.reference}`}
              className="ml-1 size-4 accent-[var(--brand)]"
            />
          ) : null}
        </td>

        <td className="px-3 py-2">
          <span className="tnum flex items-center gap-1.5 font-medium">
            {done && !row.discrepancy ? (
              <Check className="size-3.5 shrink-0 text-success" />
            ) : row.missing || row.discrepancy ? (
              <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
            ) : null}
            {row.reference}
          </span>
          {distinctMark(row.customer, row.shippingMark) ? (
            <span className="tnum block text-xs text-muted-foreground">
              {row.shippingMark}
            </span>
          ) : null}
        </td>

        <td className="px-3 py-2">
          <span className="block font-medium">{row.customer}</span>
          {row.customerPhone ? (
            <span className="tnum block text-xs text-muted-foreground">
              {row.customerPhone}
            </span>
          ) : null}
        </td>

        <td className="max-w-[14rem] truncate px-3 py-2 text-muted-foreground">
          <Tx>{row.description}</Tx>
        </td>

        {/* WHAT THE GOODS ARE, ANSWERED BY WHOEVER HAS THEM OPEN.

            An untyped consignment cannot be priced from the rate book, and the
            person who can say what it is standing in front of it. The floor
            still never sees a price — what it sets is what the goods are. */}
        <td className="hidden px-3 py-2 text-muted-foreground lg:table-cell">
          {row.cargoTypes.length > 1 ? (
            <span>{row.cargoTypes.join(", ")}</span>
          ) : (
            <CargoTypeCell
              cargoId={row.id}
              containerId={containerId}
              reference={row.reference}
              current={row.cargoTypes[0] ?? ""}
              options={cargoTypes}
            />
          )}
        </td>

        <td className="tnum px-3 py-2 text-right">
          {row.expectedPackages} pkg
          <span className="block text-xs text-muted-foreground">
            {row.expectedCbm ?? "—"}
          </span>
        </td>

        <td className="tnum px-3 py-2 text-right">
          {row.missing ? (
            <span className="text-destructive">not here</span>
          ) : done ? (
            <>
              <span className={short !== 0 ? "font-semibold text-warning" : ""}>
                {row.arrivedPackages} pkg
              </span>
              {short !== 0 ? (
                <span className="block text-xs text-warning">
                  {short > 0 ? `${short} short` : `${-short} over`}
                </span>
              ) : (
                <span className="block text-xs text-muted-foreground">
                  {row.arrivedCbm ?? "—"}
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">not checked</span>
          )}
        </td>

        <td className="hidden px-3 py-2 md:table-cell">
          {row.photos > 0 ? (
            <span className="tnum inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Camera className="size-3.5" />
              {row.photos}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>

        <td className="hidden px-3 py-2 md:table-cell">
          {/* Not on the paper Guangzhou sealed. It is said on the row as well
              as in the counters, because the person confirming the box needs
              to know which bale they are being asked to vouch for. */}
          {row.added ? (
            <Badge tone="warn" className="mr-1">
              Added here
            </Badge>
          ) : null}
          {row.missing ? (
            <Badge tone="bad">Missing</Badge>
          ) : row.damaged ? (
            /* Read before "short" and before "verified": a bale that came off
               wet is the fact about it, whatever else is true. */
            <Badge tone="bad">{CONDITION_LABEL[row.condition ?? "DAMAGED"]}</Badge>
          ) : row.verified ? (
            <Badge tone="good">Verified</Badge>
          ) : row.discrepancy ? (
            <Badge tone="warn">Short</Badge>
          ) : done ? (
            <Badge tone="progress">Counted</Badge>
          ) : (
            <Badge tone="neutral">On the water list</Badge>
          )}
        </td>

        {/* The three answers, in the order they happen: it is here and right,
            the count is different, something is wrong with it. */}
        <td className="px-3 py-2">
          {row.missing ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <div className="flex items-center justify-center gap-1">
              <form action={action}>
                <input type="hidden" name="cargoId" value={row.id} />
                <SubmitButton
                  size="icon"
                  variant={done ? "outline" : "default"}
                  title="Present and correct"
                  aria-label={`${row.reference}: present and correct`}
                  disabled={done}
                >
                  <Check />
                </SubmitButton>
              </form>
              <button
                type="button"
                onClick={() => {
                  setCounting((v) => !v);
                  setFlagging(false);
                }}
                aria-expanded={counting}
                title="The count is different"
                className="focus-ring inline-flex size-8 items-center justify-center rounded-md border text-brand hover:bg-brand/5"
              >
                <Scale className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setFlagging((v) => !v);
                  setCounting(false);
                }}
                aria-expanded={flagging}
                title="Something is wrong"
                className="focus-ring inline-flex size-8 items-center justify-center rounded-md border text-destructive hover:bg-destructive/5"
              >
                <AlertTriangle className="size-4" />
              </button>
            </div>
          )}
        </td>

        <td className="px-3 py-2 text-right">
          <span className="flex items-center justify-end gap-2">
            {canAmend ? (
              <button
                type="button"
                onClick={() => {
                  setMoving((v) => !v);
                  setCounting(false);
                  setFlagging(false);
                }}
                aria-expanded={moving}
                title="It came off a different box, or off none"
                className="focus-ring inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium hover:bg-secondary"
              >
                <ArrowRightLeft className="size-3" />
                Move
              </button>
            ) : null}
            <Link
              href={`/app/cargo/${row.id}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Open
            </Link>
          </span>
        </td>
      </tr>

      {state.error ? (
        <tr className="border-t">
          <td colSpan={11} className="px-3 py-2">
            <FormMessage error={state.error} />
          </td>
        </tr>
      ) : null}

      {expanded ? (
        <tr className="border-t bg-secondary/30">
          <td colSpan={11} className="px-6 py-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap gap-x-8 gap-y-1">
              <span>
                Guangzhou counted{" "}
                <span className="tnum text-foreground">
                  {row.expectedPackages} packages
                </span>
                {row.expectedPieces > 0
                  ? `, ${row.expectedPieces} pieces`
                  : ""}
                {row.expectedWeight ? `, ${row.expectedWeight}` : ""}
                {row.expectedCbm ? `, ${row.expectedCbm}` : ""}
              </span>
              {done ? (
                <span>
                  Dar counted{" "}
                  <span className="tnum text-foreground">
                    {row.arrivedPackages} packages
                  </span>
                  {row.arrivedPieces ? `, ${row.arrivedPieces} pieces` : ""}
                  {row.arrivedWeight ? `, ${row.arrivedWeight}` : ""}
                  {row.arrivedCbm ? `, ${row.arrivedCbm}` : ""}
                </span>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}

      {counting ? (
        <RowDialog
          title={`${row.reference} — the count Dar made`}
          subtitle={row.customer}
          onClose={() => setCounting(false)}
          wide
        >
          <DarReceiveForm
            cargoId={row.id}
            warehouses={warehouses}
            defaultWarehouseId={defaultWarehouseId}
            china={row.china}
            existing={row.existing}
          />
        </RowDialog>
      ) : null}

      {moving ? (
        <RowDialog
          title={`${row.reference} — move it`}
          subtitle={row.customer}
          onClose={() => setMoving(false)}
        >
          <MoveCargo
            cargoId={row.id}
            containerId={containerId}
            reference={row.reference}
            containers={otherContainers}
          />
        </RowDialog>
      ) : null}

      {flagging ? (
        <RowDialog
          title={`${row.reference} — something is wrong`}
          subtitle={row.customer}
          onClose={() => setFlagging(false)}
        >
          <p className="mb-3 text-sm text-muted-foreground">
            It did not come off the container, or it came off damaged. Either
            opens a case naming what was expected against what arrived — and
            they are not the same answer: missing means it is not here, damaged
            means it is here and hurt.
          </p>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <MissingCargoButton cargoId={row.id} reference={row.reference} />
            <Link
              href={`/app/exceptions?cargo=${row.id}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Raise a different issue
            </Link>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-medium">
              <PackageOpen className="size-4 text-destructive" />
              It is here and it is damaged
            </p>
            <DamageTag
              cargoId={row.id}
              reference={row.reference}
              condition={row.condition}
            />
          </div>
        </RowDialog>
      ) : null}
    </>
  );
}

/** The cargo type, chosen on the row and saved the moment it is picked. */
function CargoTypeCell({
  cargoId,
  containerId,
  reference,
  current,
  options,
}: {
  cargoId: string;
  containerId: string;
  reference: string;
  current: string;
  options: string[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    setCheckInCargoType,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);
  const list = current && !options.includes(current) ? [current, ...options] : options;

  if (options.length === 0) return <span>{current || "—"}</span>;

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="cargoId" value={cargoId} />
      <input type="hidden" name="containerId" value={containerId} />
      <NativeSelect
        key={current}
        name="cargoType"
        defaultValue={current}
        aria-label={`Cargo type for ${reference}`}
        className={cn("h-8 min-w-40 text-xs", !current && "border-warning text-warning")}
        onChange={(event) => {
          if (event.currentTarget.value) formRef.current?.requestSubmit();
        }}
      >
        {!current ? <option value="">Choose a type…</option> : null}
        {list.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </NativeSelect>
      {state.error ? (
        <p className="mt-1 text-xs text-destructive">{state.error}</p>
      ) : null}
    </form>
  );
}

/** What the Dar floor wrote on the receiving row, said in words. */
const CONDITION_LABEL: Record<string, string> = {
  GOOD: "Good",
  MINOR_DAMAGE: "Minor damage",
  DAMAGED: "Damaged",
  WET: "Wet",
  REPACKED: "Repacked",
};
