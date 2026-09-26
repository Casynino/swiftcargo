"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronRight, Plus, Search, X } from "lucide-react";

import { useEscape } from "@/components/app/use-escape";
import { Button } from "@/components/ui/button";

import { useT } from "@/components/app/locale-provider";

/** A filter that applies the moment it changes — no Search press. */
export function AutoSelect({
  name,
  value,
  label,
  options,
}: {
  name: string;
  value: string;
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      name={name}
      aria-label={label}
      defaultValue={value}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="h-10 min-w-40 rounded-xl border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export type PayingCustomer = { id: string; name: string; bills: number; owedTzs: number };

/**
 * RECORD A PAYMENT, STARTING FROM WHO IS PAYING.
 *
 * Money is taken against the customer's own open bills on the payment screen,
 * so the only question here is whose — searched, most owed first.
 */
export function RecordPaymentPicker({ customers }: { customers: PayingCustomer[] }) {
  const tx = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEscape(open, () => setOpen(false));
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => (q ? customers.filter((c) => c.name.toLowerCase().includes(q)) : customers).slice(0, 40),
    [customers, q]
  );
  const tzs = (n: number) => `TZS ${Math.round(n).toLocaleString("en-US")}`;

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {tx("Record payment")}
      </Button>
      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:items-center sm:p-6"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div role="dialog" aria-modal="true" aria-label={tx("Record payment")} className="w-full max-w-lg rounded-2xl border bg-card p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{tx("Who is paying?")}</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {tx("Customers with bills still open, most owed first.")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label={tx("Close")}
                    className="-m-1 rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <label className="mt-4 flex h-11 items-center gap-3 rounded-xl border bg-background px-3.5 focus-within:ring-2 focus-within:ring-ring">
                  <Search className="size-4 shrink-0 text-muted-foreground" />
                  <input
                    id="income-payer-search"
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={tx("Customer name…")}
                    className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </label>
                <ul className="mt-3 max-h-[22rem] divide-y overflow-y-auto rounded-xl border">
                  {shown.length === 0 ? (
                    <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {tx("Nobody with an open bill matches that.")}
                    </li>
                  ) : (
                    shown.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/app/finance/payments/new/${c.id}`}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/60"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{c.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {c.bills} {c.bills === 1 ? tx("open bill") : tx("open bills")}
                            </span>
                          </span>
                          <span className="tnum shrink-0 text-sm font-semibold">{tzs(c.owedTzs)}</span>
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        </Link>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
