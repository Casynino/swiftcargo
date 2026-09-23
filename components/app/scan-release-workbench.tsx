"use client";

import Link from "next/link";
import { useCallback, useState, useTransition } from "react";
import { Loader2, ScanLine, Search } from "lucide-react";

import { BoxScanner } from "@/components/app/box-scanner";
import { CargoStatusBadge } from "@/components/app/status-badge";
import { QrScanner } from "@/components/app/qr-scanner";
import { ReleaseForm, UnableToLocateCargo } from "@/components/app/release-panel";
import { ScanVerdict } from "@/components/app/scan-verdict";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveForRelease, type ScanResult, type ScanTarget } from "@/lib/actions/scan-release";
import { cn } from "@/lib/utils";

import { useT } from "@/components/app/locale-provider";
/** A cleared-or-blocked consignment, for the by-hand fallback only. */
export type ReleaseCandidate = {
  id: string;
  reference: string;
  customerName: string;
  customerPhone: string;
  packages: number | null;
  cleared: boolean;
};

/**
 * THE DAR COUNTER, ON ONE SCREEN.
 *
 * A clerk scans the sticker on a carton with the customer standing in front
 * of them. From that single scan they can finish the handover or see exactly
 * why they cannot — there is no detail page in between and nothing to
 * navigate to afterwards. Ordered for that moment, on a phone held in one
 * hand:
 *
 *   1. the verdict — may I hand this over, answered before any scrolling
 *   2. who and what — the facts the clerk reads back to the customer
 *   3. the handover itself — every box scanned out, then the release form
 *
 * The scan resolves on the server (`resolveForRelease`), so the screen knows
 * about payment, missing cartons and open cases — not merely whether a
 * pickup note exists. Typing the tracking number by hand carries the same
 * weight as a camera read: a consignment with no printed note, or a label
 * nobody can read, still opens here and still says exactly what stands
 * between it and the door.
 */
export function ScanReleaseWorkbench({
  candidates,
  initial,
  initialError,
}: {
  candidates: ReleaseCandidate[];
  /* Resolved on the server from ?code=, the same door the pickup list's own
     "Release" button walks through — a queue pick and a camera read land on
     the same screen through the same check, and can never disagree about a
     held or short-shipped consignment. */
  initial?: ScanTarget | null;
  initialError?: string | null;
}) {
  const [target, setTarget] = useState<ScanTarget | null>(initial ?? null);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, startTransition] = useTransition();
  const tx = useT();

  const open = useCallback((code: string) => {
    setError(null);
    startTransition(async () => {
      const response: ScanResult = await resolveForRelease(code);
      if (response.ok) {
        setTarget(response.data);
      } else {
        setTarget(null);
        setError(response.error);
      }
    });
  }, []);

  const reset = useCallback(() => {
    setTarget(null);
    setError(null);
    /* Drop the code out of the address bar along with the cargo it opened —
       a refresh must not reopen the consignment just handed over. */
    window.history.replaceState(null, "", "/app/scan");
  }, []);

  if (pending) {
    return (
      <div className="flex items-center justify-center rounded-xl border bg-card p-16">
        <Loader2 className="size-6 animate-spin text-brand" />
        <span className="ml-3 text-sm text-muted-foreground">{tx("Reading the label…")}</span>
      </div>
    );
  }

  if (target) {
    return <ReleaseScreen target={target} onDone={reset} />;
  }

  return <ScanPrompt candidates={candidates} error={error} onOpen={open} />;
}

/* ------------------------------------------------------------------ */
/* Nothing scanned yet                                                  */
/* ------------------------------------------------------------------ */

function ScanPrompt({
  candidates,
  error,
  onOpen,
}: {
  candidates: ReleaseCandidate[];
  error: string | null;
  onOpen: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [byHand, setByHand] = useState(false);
  const tx = useT();

  const filtered = candidates.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      c.reference.toLowerCase().includes(q) ||
      c.customerName.toLowerCase().includes(q) ||
      c.customerPhone.includes(q)
    );
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-xl border bg-card p-4 shadow-soft sm:p-6">
        <div className="flex items-center gap-2">
          <ScanLine className="size-5 text-brand" />
          <h2 className="text-lg font-bold">{tx("Scan the box")}</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {tx(
            "The sticker on the carton, or the code on the customer's printed pickup note — either one opens their cargo."
          )}
        </p>
        <div className="mt-4">
          <QrScanner onResult={onOpen} />
        </div>

        {error ? (
          <div className="mt-3 rounded-xl border-2 border-destructive/50 bg-destructive/10 p-3">
            <p className="text-base font-bold leading-tight text-destructive">{tx("Not found")}</p>
            <p className="mt-1 text-xs text-destructive/90">{tx(error)}</p>
          </div>
        ) : null}
      </div>

      {/*
        The fallback, kept quiet.

        Both the carton sticker and a typed tracking number resolve to the
        same consignment, so a clerk needs this only when neither can be read
        or remembered at all — and it works whether or not a pickup note has
        been issued, which is exactly the case this list exists for.
      */}
      <div className="rounded-xl border bg-card p-4 shadow-soft sm:p-6">
        <button
          type="button"
          onClick={() => setByHand((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md text-left"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Search className="size-4 text-muted-foreground" />
            {tx("Label unreadable? Find it by hand")}
          </span>
          <span className="text-xs text-muted-foreground">
            {candidates.length} {tx("waiting")}
          </span>
        </button>

        {byHand ? (
          <div className="mt-4 space-y-3">
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {tx("Nothing is waiting to be handed over right now.")}
              </p>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={tx("Tracking number, customer or phone")}
                    className="h-11 pl-9"
                  />
                </div>
                <ul className="max-h-[420px] space-y-2 overflow-y-auto">
                  {filtered.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(c.reference)}
                        className="w-full rounded-xl border bg-background p-3 text-left transition-colors hover:bg-muted/60"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="tnum font-mono text-sm font-semibold">{c.reference}</span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              c.cleared ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                            )}
                          >
                            {c.cleared ? tx("cleared") : tx("not cleared")}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-sm">{c.customerName}</p>
                        <p className="tnum text-xs text-muted-foreground">
                          {c.customerPhone}
                          {c.packages ? ` · ${c.packages} ${tx("pkg")}` : ""}
                        </p>
                      </button>
                    </li>
                  ))}
                  {filtered.length === 0 ? (
                    <li className="p-2 text-sm text-muted-foreground">{tx("Nothing matches that search.")}</li>
                  ) : null}
                </ul>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scanned — the whole job                                              */
/* ------------------------------------------------------------------ */

function ReleaseScreen({ target, onDone }: { target: ScanTarget; onDone: () => void }) {
  const tx = useT();
  /* Lifted out of BoxScanner so the release form's armed state follows every
     scan live, rather than only what the door-open response already knew. */
  const [boxes, setBoxes] = useState(target.boxes);
  /* Reached only from "The label cannot be read — release without scanning".
     One-way for this visit: "Scan another" is the way back if it was pressed
     by mistake. */
  const [scanImpossible, setScanImpossible] = useState(false);
  const armed = boxes.total === 0 || boxes.done >= boxes.total || scanImpossible;

  const verdict = target.check.ok
    ? {
        tone: "ok" as const,
        headline: tx("Cleared — hand it over"),
        detail: tx("Payment and paperwork are in order."),
      }
    : {
        tone: "block" as const,
        headline: tx("Do not release this"),
        detail: tx(target.check.blockedBy ?? "This consignment is not cleared."),
      };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* 1. May I hand this over? First thing on the screen, every time. */}
      <ScanVerdict tone={verdict.tone} headline={verdict.headline} detail={verdict.detail} />

      {/* 2. Who and what — read back to the customer before anything moves. */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4 sm:p-6">
          <div className="min-w-0">
            <p className="tnum text-xl font-bold">{target.reference}</p>
            <p className="mt-1 text-base font-medium">{target.customerName}</p>
            <p className="tnum text-sm text-muted-foreground">
              {target.customerPhone ?? tx("No phone recorded")}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <CargoStatusBadge status={target.status as never} />
            <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onDone}>
              {tx("Scan another")}
            </Button>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
          <Fact
            label={tx("Boxes here")}
            value={`${target.boxes.done} ${tx("of")} ${target.boxes.total || target.measured.packages || 0}`}
            tone={
              target.boxes.total > 0 && target.boxes.done < target.boxes.total ? "bad" : undefined
            }
          />
          <Fact
            label={tx("Weight")}
            value={target.measured.weightKg ? `${target.measured.weightKg} kg` : "—"}
          />
          <Fact label={tx("Volume")} value={target.measured.cbm ? `${target.measured.cbm} CBM` : "—"} />
          <Fact label={tx("Packing carton")} value={target.carton ?? "—"} />
          <Fact label={tx("Container")} value={target.container ?? "—"} />
          <Fact label={tx("Arrived in Dar")} value={target.arrivedInDar} />
          <Fact
            label={tx("Pickup note")}
            value={target.pickupNote ? target.pickupNote.noteNumber : tx("Not issued")}
            tone={
              target.pickupNote
                ? target.pickupNote.status === "ACTIVE"
                  ? "ok"
                  : "bad"
                : undefined
            }
          />
        </dl>

        <div className="space-y-3 border-t p-4 sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {tx("Contents")}
            </p>
            <p className="mt-0.5 text-sm">{target.description}</p>
          </div>

          {/* The box actually in the clerk's hand, when a real scan named
              one — not a queue pick. */}
          {target.scannedBox ? (
            <p className="text-sm text-muted-foreground">
              {tx("You scanned box")} {target.scannedBox.sequence} {tx("of")} {target.scannedBox.of}
            </p>
          ) : null}

          {/* The invoice, for whoever is allowed to see one. Absent from the
              object entirely for the warehouse — the floor never sees a
              price. */}
          {target.finance ? (
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {tx("Invoice")} {target.finance.invoiceNumber}
              </p>
              <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{tx("Total")}</dt>
                  <dd className="tnum font-semibold">{target.finance.total}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{tx("Paid")}</dt>
                  <dd className="tnum font-semibold">{target.finance.paid}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{tx("Outstanding")}</dt>
                  <dd
                    className={cn(
                      "tnum font-semibold",
                      target.finance.owes ? "text-destructive" : "text-success"
                    )}
                  >
                    {target.finance.outstanding}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}

          {/* The payment fact, without the figure. What the counter needs to
              hand a box over — the amount is finance's, above, for whoever
              holds finance.view. Only while the note is live: a collected or
              cancelled consignment gets no green "settled" panel. */}
          {target.payment ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-success/50 bg-success/10 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-success/80">
                  {tx("Payment")}
                </p>
                <p className="text-lg font-bold leading-tight text-success">
                  {target.payment.amountPaid ?? tx("Settled in full")}
                </p>
              </div>
              <p className="text-right text-xs text-success/80">
                {target.payment.noteNumber}
                <span className="block">
                  {tx("issued")} {target.payment.issuedAt}
                </span>
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* 3. The handover itself, or exactly what is missing. */}
      {target.check.ok ? (
        <div className="space-y-4">
          <div className="space-y-4 rounded-xl border bg-card p-4 shadow-soft sm:p-6">
            {target.boxes.total > 0 && !scanImpossible ? (
              <>
                <BoxScanner
                  mode="release"
                  cargoId={target.cargoId}
                  initial={target.boxes}
                  onProgress={setBoxes}
                />
                {/* The way out, for the box whose label cannot be read. Every
                    other check still runs on submit; what is missing is a
                    scan, and the mandatory-but-expected handover photograph
                    carries that proof instead. */}
                <button
                  type="button"
                  onClick={() => setScanImpossible(true)}
                  className="focus-ring min-h-11 text-left text-xs font-medium text-warning underline underline-offset-2"
                >
                  {tx("The label cannot be read — release without scanning")}
                </button>
              </>
            ) : null}
            <ReleaseForm
              cargoId={target.cargoId}
              reference={target.reference}
              packages={boxes.total || target.measured.packages || 1}
              receiverName={target.customerName}
              receiverPhone={target.customerPhone ?? ""}
              pickupNoteNumber={target.pickupNote?.noteNumber ?? null}
              boxes={boxes}
              armed={armed}
              scanImpossible={scanImpossible}
            />
          </div>
          <UnableToLocateCargo cargoId={target.cargoId} reference={target.reference} onDone={onDone} />
        </div>
      ) : (
        <BlockedActions target={target} onDone={onDone} />
      )}
    </div>
  );
}

/**
 * WHAT TO DO INSTEAD, FOR CARGO THAT CANNOT GO.
 *
 * The reason is already said once, in the verdict banner above — this is not
 * a second explanation of it, only the way out. Dar holds `receiving.dar`, so
 * in the one state it can actually fix from here — the boxes never booked
 * in — the fix is one tap away.
 */
function BlockedActions({ target, onDone }: { target: ScanTarget; onDone: () => void }) {
  const tx = useT();
  const notReceived = target.check.conditions.find(
    (c) => c.label === "Received at the Dar warehouse"
  );

  return (
    <div className="rounded-xl border bg-card p-4 shadow-soft sm:p-6">
      <p className="text-sm text-muted-foreground">
        {tx("This cargo cannot be released from here. Nothing has been changed.")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {notReceived && !notReceived.passed ? (
          <Button asChild className="h-11">
            <Link href="/app/receive/dar">{tx("Check the cargo in")}</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline" className="h-11">
          <Link href={`/app/cargo/${target.cargoId}`}>{tx("Open the cargo")}</Link>
        </Button>
        <Button className="h-11" onClick={onDone}>
          {tx("Scan another box")}
        </Button>
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "bad";
}) {
  return (
    <div className="bg-card px-4 py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "tnum mt-0.5 text-sm font-semibold",
          tone === "ok" && "text-success",
          tone === "bad" && "text-destructive"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

