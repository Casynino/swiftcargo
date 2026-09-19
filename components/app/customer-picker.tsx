"use client";

import { useT } from "@/components/app/locale-provider";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Search, X } from "lucide-react";

import { searchCustomers } from "@/lib/actions/customers";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { distinctMark } from "@/lib/customer-name";

type Match = {
  id: string;
  code: string;
  fullName: string;
  businessName: string | null;
  phone: string;
  shippingMark: string | null;
};

/**
 * Find a customer by whatever the clerk has in front of them.
 *
 * The counter is noisy and somebody is waiting, so this searches the name, the
 * phone they called from, their code and the mark on the box all at once rather
 * than making the clerk choose which field they are holding.
 *
 * The chosen id goes into a hidden input, so the enclosing form posts an id and
 * never a typed name — a name typed into a cargo record is a consignment that
 * belongs to nobody in particular.
 */
export function CustomerPicker({
  name,
  label,
  required,
  initial,
  hint,
  onPick,
}: {
  name: string;
  label: string;
  required?: boolean;
  initial?: Match | null;
  hint?: string;
  /** So the form around it can fill in what this customer already has. */
  onPick?: (customer: Match | null) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [chosen, setChosen] = useState<Match | null>(initial ?? null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chosen || query.trim().length < 2) {
      setMatches([]);
      return;
    }
    /* Debounced: a clerk types a nine-digit phone number faster than a round
       trip, and searching on every keystroke means nine queries whose first
       eight answers are thrown away. */
    const timer = setTimeout(() => {
      startTransition(async () => {
        setMatches(await searchCustomers(query));
        setOpen(true);
      });
    }, 220);
    return () => clearTimeout(timer);
  }, [query, chosen]);

  useEffect(() => {
    function onClickAway(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  if (chosen) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <input type="hidden" name={name} value={chosen.id} />
        <div className="flex items-start gap-3 rounded-md border bg-secondary/40 p-3">
          <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{chosen.fullName}</p>
            <p className="tnum truncate text-xs text-muted-foreground">
              {chosen.code} · {chosen.phone}
              {distinctMark(chosen.fullName, chosen.shippingMark) ? ` · ${chosen.shippingMark}` : ""}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("Choose somebody else")}
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              setChosen(null);
              onPick?.(null);
              setQuery("");
            }}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2" ref={boxRef}>
      <Label htmlFor={`${name}-search`}>{label}</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={`${name}-search`}
          value={query}
          autoComplete="off"
          className="pl-9"
          placeholder={t("Name, phone, code or shipping mark…")}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => matches.length > 0 && setOpen(true)}
        />
        {/* Keeps the enclosing form's own validation honest while nothing is
            chosen — the real value is the hidden input above. */}
        {required ? (
          <input
            tabIndex={-1}
            aria-hidden
            required
            value=""
            onChange={() => {}}
            className="pointer-events-none absolute inset-x-0 bottom-0 h-0 w-full opacity-0"
          />
        ) : null}

        {open && matches.length > 0 ? (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">
            {matches.map((match) => (
              <li key={match.id}>
                <button
                  type="button"
                  className="w-full rounded px-3 py-2 text-left hover:bg-secondary"
                  onClick={() => {
                    setChosen(match);
                    onPick?.(match);
                    setOpen(false);
                  }}
                >
                  <span className="block text-sm font-medium">
                    {match.fullName}
                    {match.businessName ? (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {match.businessName}
                      </span>
                    ) : null}
                  </span>
                  <span className="tnum block text-xs text-muted-foreground">
                    {match.code} · {match.phone}
                    {distinctMark(match.fullName, match.shippingMark) ? ` · ${match.shippingMark}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p className={cn("text-xs text-muted-foreground", pending && "opacity-60")}>
        {pending ? t("Searching…") : (hint ?? t("Type at least two characters."))}
      </p>
    </div>
  );
}
