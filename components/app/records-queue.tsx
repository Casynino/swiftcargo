"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Undo2 } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { reviewRecords, type ReviewActionState } from "@/lib/actions/reconciliation";
import { t, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { Tx } from "@/components/app/tx";
export type QueueRowView = {
  /** "Payment:clx…" — the queue mixes three registers, so the kind travels with the id. */
  key: string;
  href: string;
  title: string;
  meta: string;
  amount: string;
  tone: "in" | "out" | "move";
  /** Rendered by the server so this file formats nothing. */
  badge: { label: string; className: string } | null;
  cancelled: boolean;
  selected: boolean;
};

/**
 * THE QUEUE, WITH A TICK BOX ON EVERY ROW.
 *
 * Agreeing forty records one at a time is right when each needs thought and
 * wrong when a fortnight of routine costs is sitting there — so rows can be
 * ticked, all of them at once, and given one verdict.
 *
 * TICKING IS NOT OPENING. The tick box selects a row for the bulk verdict; the
 * rest of the row opens it in the panel beside the list. Two intentions, and
 * neither triggers the other.
 *
 * The bar only exists while something is ticked. A toolbar greyed out all day
 * is furniture; one that appears when it can act answers what you just did.
 */
export function RecordsQueue({
  locale,
  rows,
  canReview,
  emptyLabel,
}: {
  locale: Locale;
  rows: QueueRowView[];
  canReview: boolean;
  emptyLabel: string;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"RECONCILED" | "SENT_BACK" | null>(null);
  const [state, action] = useActionState<ReviewActionState, FormData>(reviewRecords, {});

  const allPicked = rows.length > 0 && picked.size === rows.length;
  const keys = useMemo(() => [...picked], [picked]);

  /* A verdict lands and the ticks go with it — once. useActionState keeps the
     last success around, so clearing on every render would wipe each new tick
     the instant it was made. Each completed action returns a fresh object, and
     the latch compares identity. */
  const clearedFor = useRef<ReviewActionState | null>(null);
  useEffect(() => {
    if (state.ok && clearedFor.current !== state) {
      clearedFor.current = state;
      setPicked(new Set());
      setMode(null);
    }
  }, [state]);

  const toggle = (key: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {canReview && rows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              className="size-4 accent-[hsl(var(--brand))]"
              checked={allPicked}
              onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((row) => row.key)))}
            />
            {picked.size > 0
              ? `${picked.size} ${t(locale, "picked")}`
              : t(locale, "Pick all on this page")}
          </label>

          {picked.size > 0 ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode(mode === "RECONCILED" ? null : "RECONCILED")}
                className={cn(
                  "focus-ring inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                  mode === "RECONCILED"
                    ? "bg-success text-success-foreground"
                    : "border-success/40 text-success hover:bg-success/10"
                )}
              >
                <BadgeCheck className="size-3.5" />
                {t(locale, "Reconcile")} {picked.size}
              </button>
              <button
                type="button"
                onClick={() => setMode(mode === "SENT_BACK" ? null : "SENT_BACK")}
                className={cn(
                  "focus-ring inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                  mode === "SENT_BACK"
                    ? "bg-warning text-warning-foreground"
                    : "border-warning/40 text-warning hover:bg-warning/10"
                )}
              >
                <Undo2 className="size-3.5" />
                {t(locale, "Send back")} {picked.size}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode ? (
        <form action={action} className="border-b bg-muted/20 px-4 py-3">
          <input type="hidden" name="verdict" value={mode} />
          {keys.map((key) => (
            <input key={key} type="hidden" name="keys" value={key} />
          ))}
          <p className="text-xs text-muted-foreground">
            {mode === "RECONCILED"
              ? `${t(locale, "Agreeing")} ${keys.length} ${t(locale, "records. Each keeps its own line in the history.")}`
              : `${t(locale, "Handing")} ${keys.length} ${t(locale, "records back to Finance, with this reason on each.")}`}
          </p>
          <Textarea
            name="note"
            rows={2}
            className="mt-2 text-xs"
            placeholder={
              mode === "RECONCILED"
                ? t(locale, "Note (optional) — e.g. checked against the statement of the 18th.")
                : t(locale, "What has to be corrected on all of these?")
            }
          />
          <div className="mt-2">
            <FormMessage error={state.error} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SubmitButton size="sm" pendingLabel={t(locale, "Recording…")}>
              {mode === "RECONCILED"
                ? `${t(locale, "Reconcile")} ${keys.length}`
                : `${t(locale, "Send back")} ${keys.length}`}
            </SubmitButton>
            <button
              type="button"
              onClick={() => setMode(null)}
              className="focus-ring inline-flex min-h-9 items-center rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {t(locale, "Cancel")}
            </button>
          </div>
        </form>
      ) : null}

      {/* The receipt for the LAST verdict, gone the moment a new pick starts —
          a success line sitting over fresh ticks reads as if they were already
          recorded. */}
      {state.ok && picked.size === 0 && !mode ? (
        <p className="border-b bg-success/10 px-4 py-2 text-xs font-medium text-success">
          {state.written ?? 0} {t(locale, "recorded")}
          {state.skipped ? ` · ${state.skipped} ${t(locale, "skipped")}` : ""}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        /* Capped at roughly eight rows: the growth is here, so the limit is
           here. min-h-0 + flex-1 lets it fill the card when the panel beside it
           is taller; max-h stops a busy week dragging the band down the page. */
        <ul className="max-h-[30rem] min-h-0 flex-1 divide-y overflow-y-auto">
          {rows.map((row) => (
            <li key={row.key} className="flex items-stretch">
              {canReview ? (
                <label
                  className="flex cursor-pointer items-center pl-3 pr-1"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[hsl(var(--brand))]"
                    checked={picked.has(row.key)}
                    onChange={() => toggle(row.key)}
                    aria-label={`${t(locale, "Pick")} $<Tx>{row.title}</Tx>`}
                  />
                </label>
              ) : null}
              <Link
                href={row.href}
                scroll={false}
                className={cn(
                  "focus-ring block min-w-0 flex-1 border-l-2 px-3 py-2.5 transition-colors hover:bg-muted/40",
                  row.selected ? "border-l-brand bg-brand/[0.06]" : "border-l-transparent"
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm font-medium"><Tx>{row.title}</Tx></p>
                  <p
                    className={cn(
                      "tnum shrink-0 text-sm font-semibold",
                      row.cancelled
                        ? "text-muted-foreground line-through"
                        : row.tone === "out"
                          ? "text-destructive"
                          : row.tone === "in"
                            ? "text-success"
                            : "text-foreground"
                    )}
                  >
                    {row.amount}
                  </p>
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-2">
                  <p className="truncate text-xs text-muted-foreground">{row.meta}</p>
                  {row.badge ? (
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                        row.badge.className
                      )}
                    >
                      {row.badge.label}
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
          <li className="px-4 py-3 text-center text-[11px] text-muted-foreground">
            {t(locale, "That is everything on this page.")}
          </li>
        </ul>
      )}
    </div>
  );
}
