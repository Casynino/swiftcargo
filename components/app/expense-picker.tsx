"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Anchor,
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  Clock,
  FileCheck2,
  FileText,
  Fuel,
  HandCoins,
  Home,
  Landmark,
  Package,
  Paperclip,
  Plus,
  Search,
  ShieldCheck,
  Ship,
  Sparkles,
  Truck,
  Warehouse,
  Wifi,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { recordExpense, type ActionState } from "@/lib/actions/expenses";
import type { CatalogueGroup, CatalogueItem } from "@/lib/expense-catalogue";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

import { useT } from "@/components/app/locale-provider";
import { Tx } from "@/components/app/tx";

/* The category's own picture, by what its name says. A category the list does
   not know gets a coin — still a cost, just not one with a face yet. */
const ICONS: [RegExp, LucideIcon][] = [
  [/ocean|freight|lading|ship/i, Ship],
  [/clear|forward|customs clearance/i, FileCheck2],
  [/port|wharf|terminal|thc/i, Anchor],
  [/fuel/i, Fuel],
  [/transport|chassis|truck/i, Truck],
  [/handling|unloading|labour|labor/i, Package],
  [/demurrage|detention/i, Clock],
  [/storage/i, Warehouse],
  [/duty|tax|customs/i, Landmark],
  [/insurance|security/i, ShieldCheck],
  [/document|office|stationery|supplies/i, FileText],
  [/rent/i, Home],
  [/utilit|electric|water/i, Zap],
  [/internet|phone|airtime/i, Wifi],
  [/maint|repair/i, Wrench],
  [/allowance|facilitation/i, HandCoins],
];
const iconFor = (name: string | undefined) =>
  ICONS.find(([test]) => name && test.test(name))?.[1] ?? CircleDollarSign;

const TONES = [
  "bg-rose-500/15 text-rose-500",
  "bg-emerald-500/15 text-emerald-500",
  "bg-orange-500/15 text-orange-500",
  "bg-teal-500/15 text-teal-500",
  "bg-sky-500/15 text-sky-500",
  "bg-violet-500/15 text-violet-500",
  "bg-amber-500/15 text-amber-500",
];
const toneFor = (id: string | null) => {
  if (!id) return "bg-secondary text-muted-foreground";
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
};

type Choice = {
  label: string;
  groupId: string | null;
  vendor: string | null;
  last: { amount: number; currency: string } | null;
};

type Scope = "OFFICE" | "SPECIAL" | "EXECUTIVE";

/**
 * RECORD A COST IN TWO QUESTIONS: WHAT, THEN HOW MUCH.
 *
 * What the money was for is picked, not typed: the things this company pays
 * for, grouped by Finance's categories, most-used first, searchable. Picking
 * one fills the category and who it is usually paid to, so the same bill is
 * filed the same way whoever records it. Anything new is typed once and is in
 * the list from then on (lib/expense-catalogue.ts). How much, from which
 * account, and — for a sailing's cost — which container, come second.
 */
export function ExpensePicker({
  groups,
  items,
  accounts,
  containers,
  defaultAccountId,
  defaultCurrency = "TZS",
  label,
}: {
  groups: CatalogueGroup[];
  items: CatalogueItem[];
  accounts: { id: string; label: string }[];
  containers: { id: string; label: string }[];
  defaultAccountId?: string;
  defaultCurrency?: string;
  label?: string;
}) {
  const tx = useT();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => setMounted(true), []);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {said ? <p className="text-sm text-success">{said}</p> : null}
        <Button onClick={() => { setSaid(null); setOpen(true); }}>
          <Plus />
          {label ?? tx("Record a cost")}
        </Button>
      </div>
      {open && mounted
        ? createPortal(
            <PickerDialog
              groups={groups}
              items={items}
              accounts={accounts}
              containers={containers}
              defaultAccountId={defaultAccountId}
              defaultCurrency={defaultCurrency}
              onClose={() => setOpen(false)}
              onRecorded={(ok) => {
                setSaid(ok);
                setOpen(false);
              }}
            />,
            document.body
          )
        : null}
    </>
  );
}

function PickerDialog({
  groups,
  items,
  accounts,
  containers,
  defaultAccountId,
  defaultCurrency,
  onClose,
  onRecorded,
}: {
  groups: CatalogueGroup[];
  items: CatalogueItem[];
  accounts: { id: string; label: string }[];
  containers: { id: string; label: string }[];
  defaultAccountId?: string;
  defaultCurrency: string;
  onClose: () => void;
  onRecorded: (ok: string) => void;
}) {
  const tx = useT();
  const [choice, setChoice] = useState<Choice | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tx("Record a cost")}
        className="relative w-full max-w-3xl rounded-2xl border bg-card p-4 text-left shadow-2xl sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
            <StepPill n={1} label={tx("What")} active={!choice} />
            <span className="h-px w-4 bg-border" aria-hidden />
            <StepPill n={2} label={tx("How much")} active={Boolean(choice)} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tx("Close")}
            className="focus-ring -m-1 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {choice ? (
          <HowMuch
            choice={choice}
            groups={groups}
            accounts={accounts}
            containers={containers}
            defaultAccountId={defaultAccountId}
            defaultCurrency={defaultCurrency}
            onBack={() => setChoice(null)}
            onRecorded={onRecorded}
          />
        ) : (
          <What groups={groups} items={items} onPick={setChoice} />
        )}
      </div>
    </div>
  );
}

function StepPill({ n, label, active }: { n: number; label: string; active: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1",
        active ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"
      )}
    >
      {n} {label}
    </span>
  );
}

/* ---------------------------------------------------------------- step 1 */

function What({
  groups,
  items,
  onPick,
}: {
  groups: CatalogueGroup[];
  items: CatalogueItem[];
  onPick: (choice: Choice) => void;
}) {
  const tx = useT();
  const [query, setQuery] = useState("");
  const [rail, setRail] = useState<string>(items.length > 0 ? "used" : groups[0]?.id ?? "used");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => searchRef.current?.focus(), []);

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const countIn = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) if (i.groupId) m.set(i.groupId, (m.get(i.groupId) ?? 0) + 1);
    return m;
  }, [items]);
  const used = items.slice(0, 8);

  const q = query.trim().toLowerCase();
  const shown: CatalogueItem[] = q
    ? items
        .filter((i) =>
          [i.label, i.vendor, i.groupId ? groupById.get(i.groupId)?.name : ""]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(q))
        )
        .slice(0, 30)
    : rail === "used"
      ? used
      : items.filter((i) => i.groupId === rail);
  /* A search that names a category offers a fresh cost in it, even when
     nothing has been paid under it yet. */
  const groupHits = q ? groups.filter((g) => g.name.toLowerCase().includes(q)).slice(0, 6) : [];
  const railGroup = !q && rail !== "used" ? groupById.get(rail) ?? null : null;

  const pickItem = (i: CatalogueItem) =>
    onPick({
      label: i.label,
      groupId: i.groupId,
      vendor: i.vendor,
      last: { amount: i.lastAmount, currency: i.lastCurrency },
    });
  const pickNew = (groupId: string | null, text = "") =>
    onPick({ label: text, groupId, vendor: null, last: null });

  const office = groups.filter((g) => !g.forContainer);
  const sailing = groups.filter((g) => g.forContainer);

  const heading = q
    ? `${tx("Results for")} “${query.trim()}”`
    : rail === "used"
      ? tx("Used most")
      : railGroup?.name ?? "";

  return (
    <div className="mt-3 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{tx("What did you pay for?")}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {tx("Search, or pick from a group. Anything new is saved for next time.")}
        </p>
      </div>

      <label className="flex h-12 items-center gap-3 rounded-xl border bg-background px-4 focus-within:ring-2 focus-within:ring-ring">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={searchRef}
          id="expense-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q) {
              e.preventDefault();
              if (shown[0]) pickItem(shown[0]);
              else pickNew(groupHits[0]?.id ?? null, query.trim());
            }
          }}
          placeholder={tx("Search — wharfage, clearing agent, rent, internet…")}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </label>

      <div className="grid overflow-hidden rounded-xl border sm:grid-cols-[15rem_1fr]">
        {/* The groups. A rail on a wide screen, a row of chips on a phone. */}
        <nav
          aria-label={tx("Groups")}
          className={cn(
            "flex gap-1 overflow-x-auto border-b p-2 sm:max-h-[24rem] sm:flex-col sm:overflow-y-auto sm:overflow-x-hidden sm:border-b-0 sm:border-r",
            q && "opacity-60"
          )}
        >
          <RailButton
            icon={Sparkles}
            label={tx("Used most")}
            count={used.length}
            active={!q && rail === "used"}
            onClick={() => { setQuery(""); setRail("used"); }}
          />
          {office.length > 0 ? <RailHeading>{tx("Business costs")}</RailHeading> : null}
          {office.map((g) => (
            <RailButton
              key={g.id}
              icon={iconFor(g.name)}
              label={g.name}
              count={countIn.get(g.id) ?? 0}
              active={!q && rail === g.id}
              onClick={() => { setQuery(""); setRail(g.id); }}
            />
          ))}
          {sailing.length > 0 ? <RailHeading>{tx("Container costs")}</RailHeading> : null}
          {sailing.map((g) => (
            <RailButton
              key={g.id}
              icon={iconFor(g.name)}
              label={g.name}
              count={countIn.get(g.id) ?? 0}
              active={!q && rail === g.id}
              onClick={() => { setQuery(""); setRail(g.id); }}
            />
          ))}
        </nav>

        <div className="flex min-h-[16rem] min-w-0 flex-col sm:max-h-[24rem]">
          <p className="border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {heading}
          </p>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {shown.map((i) => {
              const group = i.groupId ? groupById.get(i.groupId) : null;
              const Icon = iconFor(group?.name ?? i.label);
              return (
                <li key={i.key}>
                  <button
                    type="button"
                    onClick={() => pickItem(i)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none"
                  >
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", toneFor(i.groupId))}>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium"><Tx>{i.label}</Tx></span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {group ? <Tx>{group.name}</Tx> : tx("Uncategorised")}
                        {i.vendor ? ` · ${tx("to")} ${i.vendor}` : ""}
                      </span>
                    </span>
                    {i.monthly ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-marine/15 px-1.5 py-0.5 text-[11px] font-medium text-marine">
                        <CalendarClock className="size-3" />
                        {tx("Monthly")}
                      </span>
                    ) : null}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
            {groupHits.map((g) => {
              const Icon = iconFor(g.name);
              return (
                <li key={`g-${g.id}`}>
                  <button
                    type="button"
                    onClick={() => pickNew(g.id, query.trim())}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none"
                  >
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", toneFor(g.id))}>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{tx("A new")} <Tx>{g.name}</Tx> {tx("cost")}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {g.forContainer ? tx("Container cost") : tx("Business cost")}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && groupHits.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                {q
                  ? tx("Nothing like that yet — add it below and it will be here next time.")
                  : railGroup
                    ? `${tx("Nothing recorded under")} ${railGroup.name} ${tx("yet.")}`
                    : tx("Nothing recorded yet. Pick a group, or add a new expense.")}
              </li>
            ) : null}
          </ul>
          <button
            type="button"
            onClick={() => pickNew(railGroup?.id ?? null, query.trim())}
            className="flex items-center gap-2 border-t px-4 py-3 text-left text-sm font-medium hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none"
          >
            <Plus className="size-4" />
            {q
              ? `${tx("Something else — add")} “${query.trim()}”`
              : railGroup
                ? `${tx("Something else in")} ${railGroup.name}`
                : tx("Something else — add a new expense")}
          </button>
        </div>
      </div>
    </div>
  );
}

function RailHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="hidden px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:block">
      {children}
    </p>
  );
}

function RailButton({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors sm:w-full",
        active ? "bg-foreground font-medium text-background" : "text-foreground/90 hover:bg-secondary"
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate whitespace-nowrap"><Tx>{label}</Tx></span>
      {count > 0 ? (
        <span className={cn("tnum text-xs", active ? "text-background/70" : "text-muted-foreground")}>{count}</span>
      ) : null}
    </button>
  );
}

/* ---------------------------------------------------------------- step 2 */

function HowMuch({
  choice,
  groups,
  accounts,
  containers,
  defaultAccountId,
  defaultCurrency,
  onBack,
  onRecorded,
}: {
  choice: Choice;
  groups: CatalogueGroup[];
  accounts: { id: string; label: string }[];
  containers: { id: string; label: string }[];
  defaultAccountId?: string;
  defaultCurrency: string;
  onBack: () => void;
  onRecorded: (ok: string) => void;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(recordExpense, {});
  const [groupId, setGroupId] = useState(choice.groupId ?? "");
  const [description, setDescription] = useState(choice.label);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(choice.last?.currency ?? defaultCurrency);
  const [scope, setScope] = useState<Scope>("OFFICE");
  const amountRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);

  const group = groups.find((g) => g.id === groupId) ?? null;
  const forContainer = Boolean(group?.forContainer);
  const Icon = iconFor(group?.name ?? description);

  useEffect(() => {
    (choice.label ? amountRef : descRef).current?.focus();
  }, [choice.label]);

  const done = useRef(onRecorded);
  done.current = onRecorded;
  useEffect(() => {
    if (state.ok) done.current(`${description || tx("Cost")} — ${tx("recorded.")}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const money = (n: number, c: string) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: c,
      maximumFractionDigits: c === "TZS" ? 0 : 2,
    }).format(n);

  return (
    <form action={action} className="mt-3 space-y-4">
      <input type="hidden" name="scope" value={forContainer ? "CONTAINER" : scope} />

      <div className="flex items-center gap-3 rounded-xl border bg-background px-3 py-2.5">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", toneFor(groupId || null))}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{description ? <Tx>{description}</Tx> : tx("A new expense")}</p>
          <p className="truncate text-xs text-muted-foreground">
            {group ? <Tx>{group.name}</Tx> : tx("Uncategorised")}
            {group ? ` · ${forContainer ? tx("Container cost") : tx("Business cost")}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {tx("Change")}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5 sm:col-span-2">
          <Label htmlFor="xp-amount">{tx("How much")}</Label>
          <div className="flex gap-2">
            <Input
              id="xp-amount"
              ref={amountRef}
              name="amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-12 min-w-0 text-lg tnum"
            />
            <NativeSelect
              name="currency"
              aria-label={tx("Currency")}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-12 w-[6rem] shrink-0"
            >
              <option value="TZS">TZS</option>
              <option value="USD">USD</option>
            </NativeSelect>
          </div>
          {choice.last ? (
            <button
              type="button"
              onClick={() => {
                setAmount(String(choice.last!.amount));
                setCurrency(choice.last!.currency);
                amountRef.current?.focus();
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {tx("Last time")} {money(choice.last.amount, choice.last.currency)} ·{" "}
              <span className="font-medium text-brand">{tx("use it")}</span>
            </button>
          ) : null}
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="xp-description">{tx("What was it for")}</Label>
          <Input
            id="xp-description"
            ref={descRef}
            name="description"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={tx("Wharfage, printer ink, a repair…")}
          />
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="xp-group">{tx("Group")}</Label>
          <NativeSelect
            id="xp-group"
            name="expenseTypeId"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">{tx("Uncategorised")}</option>
            <optgroup label={tx("Business costs")}>
              {groups.filter((g) => !g.forContainer).map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </optgroup>
            <optgroup label={tx("Container costs")}>
              {groups.filter((g) => g.forContainer).map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </optgroup>
          </NativeSelect>
        </div>

        {forContainer ? (
          <div className="min-w-0 space-y-1.5 sm:col-span-2">
            <Label htmlFor="xp-container">{tx("Which container")}</Label>
            <NativeSelect id="xp-container" name="containerId" required defaultValue="">
              <option value="" disabled>{tx("Choose the container…")}</option>
              {containers.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </NativeSelect>
          </div>
        ) : (
          <div className="min-w-0 space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">{tx("Whose cost")}</span>
            <div className="flex flex-wrap gap-2">
              {([
                ["OFFICE", tx("The business")],
                ["SPECIAL", tx("Special")],
                ["EXECUTIVE", tx("Executive")],
              ] as const).map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScope(value)}
                  aria-pressed={scope === value}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm",
                    scope === value ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-secondary"
                  )}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="xp-account">{tx("Paid from")}</Label>
          <NativeSelect id="xp-account" name="accountId" defaultValue={defaultAccountId ?? ""}>
            <option value="">{tx("Not paid yet")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </NativeSelect>
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="xp-vendor">{tx("Paid to")}</Label>
          <Input
            id="xp-vendor"
            name="vendorName"
            defaultValue={choice.vendor ?? ""}
            placeholder={tx("Shipping line, agent, a shop…")}
          />
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="xp-date">{tx("Date")}</Label>
          <Input id="xp-date" name="expenseDate" type="date" min="2000-01-01" max="2099-12-31" />
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="xp-ref">{tx("Their reference")}</Label>
          <Input id="xp-ref" name="referenceNumber" placeholder={tx("Invoice or receipt number")} />
        </div>

        <div className="min-w-0 space-y-1.5 sm:col-span-2">
          <Label htmlFor="xp-receipt" className="flex items-center gap-1.5">
            <Paperclip className="size-3.5" />
            {tx("Receipt or photo")}
          </Label>
          <Input
            id="xp-receipt"
            name="receipt"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
            className="file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
          />
        </div>
      </div>

      <FormMessage error={state.error} />

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <SubmitButton pendingLabel="Recording…">{tx("Record cost")}</SubmitButton>
        <Button type="button" variant="ghost" onClick={onBack}>
          {tx("Back")}
        </Button>
        <p className="text-xs text-muted-foreground">
          {tx("No date means today. No account means it is still to pay.")}
        </p>
      </div>
    </form>
  );
}
