"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Anchor, Lock, PackageMinus, PackagePlus, Ship, Truck } from "lucide-react";

import {
  advanceContainer,
  loadCargo,
  sealContainer,
  unloadCargo,
  updateContainerBox,
  updateVoyage,
  type ActionState,
} from "@/lib/actions/containers";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCbm } from "@/lib/format";
import { distinctMark } from "@/lib/customer-name";

import { useLocale, useT } from "@/components/app/locale-provider";
import { Tm, Tx } from "@/components/app/tx";
type Waiting = {
  id: string;
  reference: string;
  customer: string;
  shippingMark: string | null;
  description: string;
  /** The rate bands on the consignment, as the box's table shows them. */
  category: string | null;
  packages: number;
  cbm: string;
};

/**
 * Choose what goes in the box.
 *
 * Shows the running volume as boxes are ticked, against the container's own
 * capacity, because the question a loader is actually asking is "will this
 * fit" — not "how many consignments are selected".
 */

/**
 * The mark, only when it adds something.
 *
 * A customer registered at the counter has their own name as their mark, so
 * printing both put "NINO" under "NINO" on every row — two lines of table for
 * one fact. The mark earns its line when it differs from the name.
 */
function markUnder(customer: string, mark: string | null) {
  return distinctMark(customer, mark);
}

export function LoadPanel({
  containerId,
  waiting,
  loadedCbm,
  capacityCbm,
}: {
  containerId: string;
  waiting: Waiting[];
  loadedCbm: number;
  capacityCbm: number | null;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(loadCargo, {});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const selectedCbm = waiting
    .filter((w) => selected.has(w.id))
    .reduce((sum, w) => sum + Number(w.cbm), 0);
  const projected = loadedCbm + selectedCbm;
  const over = capacityCbm !== null && projected > capacityCbm;

  if (waiting.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {tx("Nothing is waiting for a container in Guangzhou.")}
      </p>
    );
  }

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col gap-4">
      <input type="hidden" name="containerId" value={containerId} />

      {/*
        THE SAME TABLE AS THE BOX BESIDE IT.

        Two lists of the same thing, read together all afternoon, should not
        need two ways of reading. Customer, reference, goods, packages, volume —
        in that order on both sides, so the eye moves across without
        re-learning anything.
      */}
      <div className="min-h-[8rem] flex-1 overflow-y-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label={tx("Select everything waiting")}
                  className="size-4 align-middle"
                  checked={selected.size === waiting.length && waiting.length > 0}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate =
                        selected.size > 0 && selected.size < waiting.length;
                    }
                  }}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? new Set(waiting.map((w) => w.id))
                        : new Set()
                    )
                  }
                />
              </TableHead>
              <TableHead>{tx("Customer")}</TableHead>
              <TableHead>{tx("Cargo")}</TableHead>
              <TableHead>{tx("Goods")}</TableHead>
              <TableHead className="text-right">{tx("Pkgs")}</TableHead>
              <TableHead className="text-right">CBM</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {waiting.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    name="cargoIds"
                    value={item.id}
                    aria-label={`Load ${item.reference}`}
                    className="size-4 align-middle"
                    checked={selected.has(item.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(item.id);
                      else next.delete(item.id);
                      setSelected(next);
                    }}
                  />
                </TableCell>
                <TableCell className="max-w-[9rem] truncate text-sm font-semibold">
                  {item.customer}
                </TableCell>
                <TableCell>
                  <span className="tnum block whitespace-nowrap text-sm">
                    {item.reference}
                  </span>
                  {markUnder(item.customer, item.shippingMark) ? (
                    <span className="tnum block whitespace-nowrap text-xs text-muted-foreground">
                      {markUnder(item.customer, item.shippingMark)}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="max-w-[12rem] truncate text-sm text-muted-foreground">
                  {item.category ?? item.description}
                </TableCell>
                <TableCell className="tnum text-right text-sm">
                  {item.packages}
                </TableCell>
                {/* One figure, one line: "2.420 CBM" broken after the number
                    reads as two different numbers at a glance. */}
                <TableCell className="tnum whitespace-nowrap text-right text-sm font-medium">
                  {formatCbm(item.cbm)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-secondary px-3 py-2 text-sm">
        <span>
          {selected.size} {tx("selected")} · {formatCbm(selectedCbm)}
        </span>
        {capacityCbm !== null ? (
          <span className={over ? "font-medium text-destructive" : "text-muted-foreground"}>
            {formatCbm(projected)} {tx("of")} {formatCbm(capacityCbm)}
            {over ? ` — ${tx("over capacity")}` : ""}
          </span>
        ) : null}
      </div>

      {over ? (
        <p className="text-xs text-muted-foreground">
          {tx("Capacity is a guide, not a gate — a loader on the floor can see what fits better than a number in a database. Nothing is blocked.")}
        </p>
      ) : null}

      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton disabled={selected.size === 0}>
        <PackagePlus />
        {tx("Load")} {selected.size > 0 ? `${selected.size} ${tx("consignment(s)")}` : ""}
      </SubmitButton>
    </form>
  );
}

export function SealPanel({
  containerId,
  containerNumber,
  lineCount,
}: {
  containerId: string;
  containerNumber: string | null;
  lineCount: number;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    sealContainer,
    {}
  );
  const [open, setOpen] = useState(false);

  /* Full width, at the foot of the box's own card — the mirror of Load under
     the floor list. Two panels, two buttons, in the same place on each. */
  if (!open) {
    return (
      <Button
        variant="accent"
        className="w-full"
        onClick={() => setOpen(true)}
        disabled={lineCount === 0}
      >
        <Lock />
        {tx("Seal container")}
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-lg border border-accent/40 bg-accent/5 p-4">
      <input type="hidden" name="containerId" value={containerId} />
      <p className="text-sm font-medium">
        {tx("Sealing closes the box for good")}
      </p>
      <p className="text-xs text-muted-foreground">
        Nothing can be added or taken out afterwards, and all {lineCount}{" "}
        consignment(s) inside move to “container loaded” together.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="containerNumber">{tx("Container number")}</Label>
          <Input
            id="containerNumber"
            name="containerNumber"
            defaultValue={containerNumber ?? ""}
            placeholder="MSCU1234567"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sealNumber">{tx("Seal number")}</Label>
          <Input id="sealNumber" name="sealNumber" required />
        </div>
      </div>
      <FormMessage error={state.error} ok={state.ok} />
      <div className="flex gap-2">
        <SubmitButton variant="accent">
          <Lock />
          {tx("Seal the container")}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {tx("Cancel")}
        </Button>
      </div>
    </form>
  );
}

/*
  EACH STEP SAYS WHAT IT MEANS, NOT JUST ITS NAME.

  "Depart container" on its own left a clerk wondering whether it meant load,
  seal or sail. Each step carries a heading saying where the box stands, the
  sentence of what pressing does — including who is told — and one button
  named for the thing that has happened. Departure puts the box at sea in the
  same press; there is no in-transit step. DEPARTED is only ever seen on a box
  that left before that change.
*/
type Step = {
  to: string;
  heading: string;
  body: string;
  button: string;
  icon: React.ReactNode;
  waiting: string;
};
const NEXT_STEP: Record<string, Step | null> = {
  OPEN: null,
  LOADING: null,
  LOADED: null,
  SEALED: {
    to: "DEPARTED",
    heading: "Sealed — ready to leave Guangzhou",
    body: "Press when the ship has left with this container. It goes to sea straight away, and every customer with goods inside is told it is on the way to Dar es Salaam.",
    button: "The container has left China",
    icon: <Ship />,
    waiting: "Guangzhou records the departure.",
  },
  DEPARTED: {
    to: "ARRIVED",
    heading: "At sea — on the way to Dar es Salaam",
    body: "Press when the container is at Dar es Salaam port. Customers are told it has arrived and that customs clearance has started.",
    button: "The container has arrived in Dar",
    icon: <Anchor />,
    waiting: "Dar, Finance or Support records the arrival.",
  },
  IN_TRANSIT: {
    to: "ARRIVED",
    heading: "At sea — on the way to Dar es Salaam",
    body: "Press when the container is at Dar es Salaam port. Customers are told it has arrived and that customs clearance has started.",
    button: "The container has arrived in Dar",
    icon: <Anchor />,
    waiting: "Dar, Finance or Support records the arrival.",
  },
  ARRIVED: {
    to: "CLOSED",
    heading: "In Dar es Salaam",
    body: "Close it once every consignment on it is checked in or reported missing. Nothing more can happen to a closed container.",
    button: "Close the container",
    icon: <Lock />,
    waiting: "Dar closes the container once everything on it is booked in.",
  },
  CLOSED: null,
};

/* Where the box is on its journey, in four words. */
const JOURNEY = [
  /* Chinese given here, not looked up: the dictionary's "Sealed" and
     "Closed" are a batch and a case, which read wrongly on a container. */
  { key: "SEALED", label: "Sealed", zh: "已封柜" },
  { key: "AT_SEA", label: "At sea", zh: "海运途中" },
  { key: "ARRIVED", label: "In Dar", zh: "已到港" },
  { key: "CLOSED", label: "Closed", zh: "已关柜" },
] as const;
const JOURNEY_AT: Record<string, number> = { SEALED: 0, DEPARTED: 1, IN_TRANSIT: 1, ARRIVED: 2, CLOSED: 3 };

function JourneyStrip({ status }: { status: string }) {
  const locale = useLocale();
  const at = JOURNEY_AT[status] ?? -1;
  return (
    <ol className="flex items-center gap-1.5 text-[11px] font-medium">
      {JOURNEY.map((j, i) => (
        <li key={j.key} className="flex items-center gap-1.5">
          <span
            className={
              i < at
                ? "rounded-full bg-success/15 px-2 py-0.5 text-success"
                : i === at
                  ? "rounded-full bg-brand px-2 py-0.5 text-brand-foreground"
                  : "rounded-full bg-secondary px-2 py-0.5 text-muted-foreground"
            }
          >
            {locale === "zh" ? j.zh : j.label}
          </span>
          {i < JOURNEY.length - 1 ? <span aria-hidden className="h-px w-3 bg-border" /> : null}
        </li>
      ))}
    </ol>
  );
}

export function AdvancePanel({
  containerId,
  status,
  canDepart,
  canArrive,
  canClose,
}: {
  containerId: string;
  status: string;
  canDepart: boolean;
  canArrive: boolean;
  canClose: boolean;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    advanceContainer,
    {}
  );
  const step = NEXT_STEP[status];
  if (!step) return null;

  const allowed =
    step.to === "DEPARTED"
      ? canDepart
      : step.to === "CLOSED"
        ? canClose
        : canArrive;

  return (
    <div className="space-y-4">
      <JourneyStrip status={status} />
      <div>
        <p className="text-lg font-semibold tracking-tight">{tx(step.heading)}</p>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {allowed ? tx(step.body) : tx(step.waiting)}
        </p>
      </div>
      {allowed ? (
        /* ONE PRESS, NOT A FORM. The moment of the press is the date: the
           action takes now when no date is sent. */
        <form action={action} className="space-y-3">
          <input type="hidden" name="containerId" value={containerId} />
          <input type="hidden" name="to" value={step.to} />
          <FormMessage error={state.error} ok={state.ok} />
          <SubmitButton size="lg" className="h-12 w-full gap-2 text-base sm:w-auto sm:px-6" pendingLabel={tx("Recording…")}>
            {step.icon}
            {tx(step.button)}
          </SubmitButton>
          <p className="text-xs text-muted-foreground">{tx("Today's date and time are recorded with your name.")}</p>
        </form>
      ) : null}
    </div>
  );
}

/**
 * The box's own particulars, while the doors are still open.
 *
 * Capacity, the date Guangzhou stops accepting for this sailing, and the note.
 * The same shape as the voyage form beside it, because they are the same job on
 * the two halves of one record and a clerk should not have to learn two.
 *
 * The container and seal numbers are deliberately absent: they are allocated by
 * the shipping line and are set at the seal, with the seal.
 */
export function BoxForm({
  containerId,
  box,
}: {
  containerId: string;
  box: {
    capacityCbm: string | null;
    cargoDeadline: string | null;
    notes: string | null;
  };
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    updateContainerBox,
    {}
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="containerId" value={containerId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="capacityCbm">{tx("Capacity (CBM)")}</Label>
          <Input
            id="capacityCbm"
            name="capacityCbm"
            type="number"
            step="0.0001"
            min={0}
            inputMode="decimal"
            defaultValue={box.capacityCbm ?? ""}
          />
          <p className="text-xs text-muted-foreground">
            {tx("What the loading bar is measured against. A guide, never a gate.")}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cargoDeadline">{tx("Cargo deadline")}</Label>
          <Input
            id="cargoDeadline"
            name="cargoDeadline"
            type="date"
            min="2000-01-01"
            max="2099-12-31"
            defaultValue={box.cargoDeadline ?? ""}
          />
          <p className="text-xs text-muted-foreground">
            {tx("The day Guangzhou stops taking cargo for this sailing. It is published, so moving it goes on the box's timeline.")}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="box-notes">{tx("Notes")}</Label>
        <Textarea id="box-notes" name="notes" defaultValue={box.notes ?? ""} />
      </div>
      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton variant="outline">{tx("Save container")}</SubmitButton>
    </form>
  );
}

export function VoyageForm({
  containerId,
  shipment,
  sailed = false,
}: {
  containerId: string;
  /** The box has already left China. Changing a sailing fact now needs a reason. */
  sailed?: boolean;
  shipment: {
    shippingLine: string | null;
    vessel: string | null;
    voyage: string | null;
    billOfLading: string | null;
    departureDate: string | null;
    eta: string | null;
    notes: string | null;
  } | null;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    updateVoyage,
    {}
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="containerId" value={containerId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="shippingLine">{tx("Shipping line")}</Label>
          <Input
            id="shippingLine"
            name="shippingLine"
            defaultValue={shipment?.shippingLine ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vessel">{tx("Vessel")}</Label>
          <Input id="vessel" name="vessel" defaultValue={shipment?.vessel ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="voyage">{tx("Voyage")}</Label>
          <Input id="voyage" name="voyage" defaultValue={shipment?.voyage ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="billOfLading">{tx("Bill of lading")}</Label>
          <Input
            id="billOfLading"
            name="billOfLading"
            defaultValue={shipment?.billOfLading ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="departureDate">{tx("Departure")}</Label>
          <Input
            id="departureDate"
            name="departureDate"
            type="date"
              min="2000-01-01"
              max="2099-12-31"
            defaultValue={shipment?.departureDate ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="eta">ETA</Label>
          <Input id="eta" name="eta" type="date" min="2000-01-01" max="2099-12-31" defaultValue={shipment?.eta ?? ""} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">{tx("Notes")}</Label>
        <Textarea id="notes" name="notes" defaultValue={shipment?.notes ?? ""} />
      </div>
      {/* A bill of lading arriving after departure is routine and needs no
          explanation. Changing a vessel or a departure date that was already
          recorded is a correction to a fact other desks are working from, and
          the server asks for the reason rather than trusting the form. */}
      {sailed ? (
        <div className="space-y-2">
          <Label htmlFor="voyage-reason">
            Why the change?{" "}
            <span className="font-normal text-muted-foreground">
              needed to alter a vessel, voyage or departure already recorded
            </span>
          </Label>
          <Input
            id="voyage-reason"
            name="reason"
            placeholder={tx("Line moved us to the next sailing")}
          />
        </div>
      ) : null}
      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton variant="outline">{tx("Save voyage")}</SubmitButton>
    </form>
  );
}

export type LoadedLine = {
  cargoId: string;
  reference: string;
  shippingMark: string | null;
  customer: string;
  packages: number;
  /** The rate bands in this consignment, as the floor would name the goods. */
  category: string | null;
  cbm: string;
};

/**
 * WHAT IS IN THE BOX, AND HOW TO GET IT OUT AGAIN.
 *
 * The same tick-boxes as the loading list, on purpose. A clerk who has just
 * learned to select four consignments and press Load should not have to learn a
 * different gesture to take four out — loading and unloading are one job done
 * in two directions, and the floor changes its mind constantly.
 *
 * Sealed boxes render the table without any of it: nothing comes out of a
 * container that has been shut, and the way to say so is to not offer it.
 */
export function LoadedTable({
  containerId,
  lines,
  canEdit,
}: {
  containerId: string;
  lines: LoadedLine[];
  canEdit: boolean;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(unloadCargo, {});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const totalCbm = lines.reduce((sum, l) => sum + Number(l.cbm), 0);
  const selectedCbm = lines
    .filter((l) => selected.has(l.cargoId))
    .reduce((sum, l) => sum + Number(l.cbm), 0);

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col gap-3">
      <input type="hidden" name="containerId" value={containerId} />

      {/*
        THE TABLE SCROLLS INSIDE ITS OWN PANEL.

        A container holding forty consignments made this panel forty rows tall
        and the page a mile long, while the floor list beside it stayed neatly
        capped — two halves of one job, one of them running off the bottom of
        the screen. Both are the same height now, and the totals stay pinned
        below where they can be read without scrolling back.
      */}
      <div className="min-h-[8rem] flex-1 overflow-y-auto rounded-md border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            {canEdit ? (
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label={tx("Select every consignment in this container")}
                  className="size-4 align-middle"
                  checked={selected.size === lines.length && lines.length > 0}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate =
                        selected.size > 0 && selected.size < lines.length;
                    }
                  }}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? new Set(lines.map((l) => l.cargoId))
                        : new Set()
                    )
                  }
                />
              </TableHead>
            ) : null}
            <TableHead>{tx("Customer")}</TableHead>
            <TableHead>{tx("Cargo")}</TableHead>
            {/* WEIGHT IS NOT WHAT SEA FREIGHT IS ABOUT. It was a column of
                kilos nobody prices on, taking the width that "what is it"
                deserves — the loader wants the goods and the count. */}
            <TableHead>{tx("Goods")}</TableHead>
            <TableHead className="text-right">{tx("Pkgs")}</TableHead>
            <TableHead className="text-right">CBM</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.cargoId}>
              {canEdit ? (
                <TableCell>
                  <input
                    type="checkbox"
                    name="cargoIds"
                    value={line.cargoId}
                    aria-label={`Take ${line.reference} off`}
                    className="size-4 align-middle"
                    checked={selected.has(line.cargoId)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(line.cargoId);
                      else next.delete(line.cargoId);
                      setSelected(next);
                    }}
                  />
                </TableCell>
              ) : null}
              <TableCell className="max-w-[9rem] truncate text-sm font-semibold">
                {line.customer}
              </TableCell>
              <TableCell>
                {/* References are one token and must not break across three
                    lines when the column is narrow. */}
                <Link
                  href={`/app/cargo/${line.cargoId}`}
                  className="tnum whitespace-nowrap text-sm hover:underline"
                >
                  {line.reference}
                </Link>
                {markUnder(line.customer, line.shippingMark) ? (
                  <span className="tnum block whitespace-nowrap text-xs text-muted-foreground">
                    {markUnder(line.customer, line.shippingMark)}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="max-w-[12rem] truncate text-sm text-muted-foreground">
                {line.category ?? "—"}
              </TableCell>
              <TableCell className="tnum text-right text-sm">
                {line.packages}
              </TableCell>
              <TableCell className="tnum whitespace-nowrap text-right text-sm font-medium">
                {formatCbm(line.cbm)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>

      <FormMessage error={state.error} ok={state.ok} />

      {canEdit ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {selected.size > 0
              ? `${selected.size} ${tx("selected")} · ${formatCbm(selectedCbm)}`
              : tx("Tick a row to take it back off.")}
          </span>
          <SubmitButton
            variant="outline"
            disabled={selected.size === 0}
            pendingLabel={tx("Taking off…")}
          >
            <PackageMinus />
            {tx("Take off")}{selected.size > 0 ? ` ${selected.size}` : ""}
          </SubmitButton>
        </div>
      ) : null}
    </form>
  );
}

/**
 * "Mark as arrived", at the receiving dock.
 *
 * The same one-press milestone as on the container's own page: the arrival is
 * recorded at the moment it is pressed.
 */
export function MarkArrivedButton({ containerId }: { containerId: string }) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    advanceContainer,
    {}
  );

  return (
    <form action={action}>
      <input type="hidden" name="containerId" value={containerId} />
      <input type="hidden" name="to" value="ARRIVED" />
      <SubmitButton size="sm" pendingLabel={tx("Recording…")}>
        <Anchor />
        {tx("Mark as arrived")}
      </SubmitButton>
      {state.error ? (
        <p className="mt-1 text-xs text-destructive"><Tm>{state.error}</Tm></p>
      ) : null}
    </form>
  );
}
