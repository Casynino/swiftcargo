"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { t, type Locale } from "@/lib/i18n";

import { Tx } from "@/components/app/tx";
type Option = { value: string; label: string };

const PERIODS: Option[] = [
  { value: "", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
];

const BASE = "/app/finance/ledger";

/**
 * ONE ROW OF CONTROLS OVER THE REGISTER.
 *
 * Everything lives in the URL and the server does the filtering. A filtered
 * register is a thing people send to each other — "what went through the CRDB
 * account last month" — and that only works if the view has an address.
 */
export function LedgerFilters({
  locale,
  accounts,
  people,
  kinds,
  categories,
}: {
  locale: Locale;
  accounts: Option[];
  people: Option[];
  kinds: Option[];
  categories: Option[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [term, setTerm] = useState(params.get("q") ?? "");

  const push = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    /* A narrower result starts at its first page; page 4 of it is empty and
       reads like a bug. */
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${BASE}?${qs}` : BASE);
  };

  /* Debounced, so the register is not read again on every keystroke. */
  useEffect(() => {
    if (term === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => push({ q: term }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const value = (key: string) => params.get(key) ?? "";
  const active = ["q", "account", "direction", "kind", "category", "person", "period"].some(
    (key) => params.get(key)
  );

  const select = (key: string, label: string, all: string, options: Option[], width: string) => (
    <NativeSelect
      aria-label={t(locale, label)}
      value={value(key)}
      onChange={(e) => push({ [key]: e.target.value })}
      className={`h-11 w-full text-sm sm:h-9 sm:w-auto ${width}`}
    >
      <option value="">{t(locale, all)}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          <Tx>{o.label}</Tx>
        </option>
      ))}
    </NativeSelect>
  );

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t(
            locale,
            "Customer, cargo reference, receipt, M-Pesa code, cargo, vendor, account, person…"
          )}
          className="pl-9"
          aria-label={t(locale, "Search the ledger")}
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        {select("kind", "Type", "All types", kinds, "min-w-[9rem]")}
        {select(
          "direction",
          "Direction",
          "In & out",
          [
            { value: "IN", label: t(locale, "In only") },
            { value: "OUT", label: t(locale, "Out only") },
          ],
          "min-w-[8rem]"
        )}
        {select("account", "Account", "All accounts", accounts, "min-w-[10rem]")}
        {select("category", "Cost category", "All categories", categories, "min-w-[10rem]")}
        {select("person", "Recorded by", "Anyone", people, "min-w-[9rem]")}
        <NativeSelect
          aria-label={t(locale, "When")}
          value={value("period")}
          onChange={(e) => push({ period: e.target.value })}
          className="h-11 w-full min-w-[9rem] text-sm sm:h-9 sm:w-auto"
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {t(locale, p.label)}
            </option>
          ))}
        </NativeSelect>

        {active ? (
          <button
            type="button"
            onClick={() => {
              setTerm("");
              router.push(BASE);
            }}
            className="inline-flex h-11 items-center justify-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground sm:h-9"
          >
            <X className="size-3.5" />
            {t(locale, "Clear")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
