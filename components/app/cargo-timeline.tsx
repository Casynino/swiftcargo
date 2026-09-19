import { Check, Circle, Dot } from "lucide-react";

import { CARGO_FLOW, CARGO_STATUS_META } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { CargoStatus } from "@prisma/client";

import { primeLocale, T } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
type Entry = { to: CargoStatus; at: string; by: string | null; reason: string | null };

/**
 * Where the cargo has got to.
 *
 * Built from the eleven milestones, with the stamps filled in from the history.
 * A step nobody recorded shows as not-yet-reached rather than being skipped
 * over, because "we have no record of that happening" and "that did not happen"
 * are the same statement as far as a customer is concerned and neither should
 * be quietly hidden.
 */
export function CargoTimeline({
  status,
  history,
}: {
  status: CargoStatus;
  history: Entry[];
}) {
  if (status === "CANCELLED") {
    return (
      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {T("This consignment was cancelled.")}
      </p>
    );
  }

  const stampFor = (step: CargoStatus) =>
    history.find((h) => h.to === step) ?? null;

  const reached = CARGO_FLOW.indexOf(status);
  /* DELIVERED sits outside the collection path but is the same ending, so it
     lights the whole line rather than none of it. */
  const currentIndex = status === "DELIVERED" ? CARGO_FLOW.length - 1 : reached;

  return (
    <ol className="space-y-0">
      {CARGO_FLOW.map((step, index) => {
        const meta = CARGO_STATUS_META[step];
        const done = index < currentIndex;
        const current = index === currentIndex;
        const stamp = stampFor(step);

        return (
          <li key={step} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border-2",
                  done && "border-navy-600 bg-navy-600 text-white",
                  current && "border-accent bg-accent text-white",
                  !done && !current && "border-border bg-background"
                )}
              >
                {done ? (
                  <Check className="size-3.5" />
                ) : current ? (
                  <Dot className="size-4" />
                ) : (
                  <Circle className="size-2 text-muted-foreground" />
                )}
              </span>
              {index < CARGO_FLOW.length - 1 ? (
                <span
                  className={cn(
                    "w-0.5 flex-1",
                    done ? "bg-navy-600" : "bg-border"
                  )}
                  style={{ minHeight: 22 }}
                />
              ) : null}
            </div>

            <div className="pb-5">
              <p
                className={cn(
                  "text-sm",
                  current ? "font-semibold" : done ? "font-medium" : "text-muted-foreground"
                )}
              >
                <Tx>{meta.label}</Tx>
              </p>
              <p className="text-xs text-muted-foreground">
                {stamp ? (
                  <>
                    {stamp.at}
                    {stamp.by ? ` · ${stamp.by}` : ""}
                  </>
                ) : (
                  meta.where
                )}
              </p>
              {stamp?.reason ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {stamp.reason}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
