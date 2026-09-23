"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { useEscape } from "@/components/app/use-escape";
import { cn } from "@/lib/utils";

/**
 * A ROW'S OWN FORM, TAKEN OFF THE ROW.
 *
 * Counting, flagging and moving cargo each used to open a strip inside the
 * table itself — the page grew a few hundred pixels under the row somebody
 * clicked, the columns it had been reading a moment ago scrolled away, and
 * closing it meant finding the same small toggle again. The form was never
 * about the row's neighbours; it only ever needed the one consignment.
 *
 * Portalled to the body for the same reason every other dialog here is —
 * a table scrolls and clips, and a dialog confined to one of its cells is a
 * dialog nobody can read.
 */
export function RowDialog({
  title,
  subtitle,
  onClose,
  wide,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** DarReceiveForm's two-column layout wants more room than a confirmation does. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  useEscape(true, onClose);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div
        className={cn(
          "max-h-[85vh] w-full overflow-y-auto rounded-2xl border bg-card p-5 shadow-raised",
          wide ? "max-w-2xl" : "max-w-lg"
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-semibold">{title}</p>
            {subtitle ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close this window"
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
