"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  MessageCircleQuestion,
  Search,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reviewRecord, type ReviewActionState } from "@/lib/actions/reconciliation";
import { t, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { Tx } from "@/components/app/tx";
export type Verdict = "RECONCILED" | "SENT_BACK" | "QUERIED" | "MISMATCH" | "UNDER_REVIEW";

/**
 * WHAT EACH VERDICT IS, IN THE WORDS OF THE JOB RATHER THAN THE ENUM.
 *
 * The button says what the manager is doing; the sentence under the open panel
 * says what it will mean to the person on the other end. "Send back" and
 * "mismatch" both mean something is wrong, and the difference — whether Finance
 * is being asked to fix it or the figures simply do not agree yet — is the
 * reason both exist.
 */
const VERDICTS: Record<
  Verdict,
  {
    label: string;
    blurb: string;
    prompt: string;
    placeholder: string;
    icon: LucideIcon;
    tone: string;
    solid: string;
    /** Whether the figure from outside the system is the point of this verdict. */
    asksActual: boolean;
  }
> = {
  RECONCILED: {
    label: "Reconcile",
    blurb: "The record agrees with the evidence. This closes it.",
    prompt: "Note (optional)",
    placeholder: "e.g. Checked against the statement of the 18th.",
    icon: BadgeCheck,
    tone: "border-success/40 text-success hover:bg-success/10",
    solid: "bg-success text-success-foreground hover:bg-success/90",
    asksActual: false,
  },
  MISMATCH: {
    label: "Mismatch",
    blurb:
      "The figure outside the system does not match this record. Say what the slip or statement actually shows.",
    prompt: "What does not match",
    placeholder: "e.g. 2,700,000 on the bank slip, 2,070,000 here.",
    icon: AlertTriangle,
    tone: "border-destructive/40 text-destructive hover:bg-destructive/10",
    solid: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    asksActual: true,
  },
  SENT_BACK: {
    label: "Send back",
    blurb:
      "Finance sees this with your reason, corrects it through their own screens, and it comes back to you. The record itself is untouched.",
    prompt: "What has to be corrected",
    placeholder: "e.g. Wrong account — this landed in CRDB, not NMB.",
    icon: Undo2,
    tone: "border-warning/40 text-warning hover:bg-warning/10",
    solid: "bg-warning text-warning-foreground hover:bg-warning/90",
    asksActual: false,
  },
  QUERIED: {
    label: "Query",
    blurb:
      "Asks the desk that recorded it a question. Nothing is disputed — you are waiting on an answer.",
    prompt: "What do you need from them",
    placeholder: "e.g. Please attach the bank statement line for this payment.",
    icon: MessageCircleQuestion,
    tone: "border-info/40 text-info hover:bg-info/10",
    solid: "bg-info text-info-foreground hover:bg-info/90",
    asksActual: false,
  },
  UNDER_REVIEW: {
    label: "Investigate",
    blurb: "Parks it as yours to look into, so it is not mistaken for unread.",
    prompt: "What are you looking into (optional)",
    placeholder: "e.g. Waiting for the month's statement from the bank.",
    icon: Search,
    tone: "border-brand/40 text-brand hover:bg-brand/10",
    solid: "bg-brand text-brand-foreground hover:bg-brand/90",
    asksActual: false,
  },
};

/**
 * The manager's verdict on one record, recorded beside it and never inside it.
 *
 * ACTIONS ARE BUTTONS, NOT A MENU. Every verdict is on the surface with its own
 * words on it, so the work never hides behind three dots. Opening one closes the
 * others, because the panel below is a sentence for the person on the other end
 * and it belongs to exactly one verdict at a time.
 */
export function ReviewActions({
  locale,
  entity,
  entityId,
  offer,
  size = "default",
  nextHref,
  nextLabel,
  facts,
  /** The record's own currency, when it has a figure an outside amount can be held against. */
  currency,
  className,
}: {
  locale: Locale;
  entity: "Payment" | "Expense" | "Transfer" | "Container";
  entityId: string;
  offer: Verdict[];
  size?: "default" | "sm";
  /** The next record still waiting, so a verdict is a rhythm rather than a round trip. */
  nextHref?: string;
  nextLabel?: string;
  /**
   * The figures the verdict rests on, restated inside the panel and already
   * written — this component formats no money, so it cannot format it
   * differently from the page.
   */
  facts?: { label: string; value: string; tone?: "good" | "bad" }[];
  currency?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Verdict | null>(null);
  const [state, action] = useActionState<ReviewActionState, FormData>(reviewRecord, {});

  /* Once per verdict, not once per render: useActionState keeps the success
     object around, and without the latch the panel would bounce forward again
     every time this component re-rendered. */
  const moved = useRef<ReviewActionState | null>(null);
  useEffect(() => {
    if (!state.ok || moved.current === state) return;
    moved.current = state;
    setOpen(null);
    if (nextHref) router.replace(nextHref, { scroll: false });
  }, [state, nextHref, router]);

  const chosen = open ? VERDICTS[open] : null;

  return (
    <div className={cn("space-y-3", className)}>
      {nextLabel && size !== "sm" ? (
        <p className="text-[11px] text-muted-foreground">
          {t(locale, "After this one:")} <span className="text-foreground">{nextLabel}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {offer.map((verdict) => {
          const meta = VERDICTS[verdict];
          const Icon = meta.icon;
          const active = open === verdict;
          return (
            <button
              key={verdict}
              type="button"
              onClick={() => setOpen(active ? null : verdict)}
              aria-expanded={active}
              className={cn(
                "focus-ring inline-flex items-center gap-1.5 rounded-lg border font-semibold transition-colors",
                size === "sm" ? "min-h-11 px-2.5 text-xs md:min-h-8" : "min-h-11 gap-2 px-3 text-sm",
                active ? meta.solid : meta.tone
              )}
            >
              <Icon className={size === "sm" ? "size-3.5" : "size-4"} />
              {t(locale, meta.label)}
            </button>
          );
        })}
      </div>

      {!open && state.ok ? <FormMessage ok={t(locale, "Recorded.")} /> : null}

      {chosen && open ? (
        <form action={action} className="rounded-xl border bg-muted/20 p-3">
          <input type="hidden" name="entity" value={entity} />
          <input type="hidden" name="entityId" value={entityId} />
          <input type="hidden" name="verdict" value={open} />

          {facts && facts.length > 0 ? (
            <dl className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {facts.map((fact) => (
                <div key={fact.label} className="rounded-lg bg-background/60 px-2 py-1.5">
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t(locale, fact.label)}
                  </dt>
                  <dd
                    className={cn(
                      "tnum text-xs font-semibold",
                      fact.tone === "bad" && "text-destructive",
                      fact.tone === "good" && "text-success"
                    )}
                  >
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          <p className="text-xs leading-snug text-muted-foreground">{t(locale, chosen.blurb)}</p>

          {/* The figure from outside the system. Offered on every verdict about
              money — a manager agreeing a payment against a slip may want the
              slip's figure on the record — and asked for plainly on a mismatch,
              where it is the finding. Never required: an empty box is not a
              reason to refuse a verdict. */}
          {currency ? (
            <div className="mt-3 space-y-1.5">
              <Label htmlFor={`actual-${open}`}>
                {t(locale, "Actual amount")}{" "}
                <span className="font-normal text-muted-foreground">
                  ({currency}
                  {chosen.asksActual ? "" : `, ${t(locale, "optional")}`})
                </span>
              </Label>
              <Input
                id={`actual-${open}`}
                name="actualAmount"
                inputMode="decimal"
                autoComplete="off"
                className="tnum"
                placeholder={t(locale, "What the slip, statement or till shows")}
              />
            </div>
          ) : null}

          <div className="mt-3 space-y-1.5">
            <Label htmlFor={`note-${open}`}>{t(locale, chosen.prompt)}</Label>
            <Textarea
              id={`note-${open}`}
              name="note"
              rows={3}
              placeholder={t(locale, chosen.placeholder)}
            />
          </div>

          <div className="mt-3">
            <FormMessage error={state.error} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <SubmitButton pendingLabel={t(locale, "Recording…")}>{t(locale, chosen.label)}</SubmitButton>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="focus-ring inline-flex min-h-10 items-center rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              {t(locale, "Cancel")}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
