"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClock,
  Anchor,
  ArrowLeft,
  Building2,
  CalendarClock,
  ChevronRight,
  CircleHelp,
  Coins,
  Container as ContainerIcon,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  ShoppingBag,
  Utensils,
  Wallet,
  FileCheck,
  FileText,
  Fuel,
  Landmark,
  Megaphone,
  PackageOpen,
  Paperclip,
  Plane,
  Plus,
  Receipt,
  Search,
  Ship,
  ShieldCheck,
  Sparkles,
  Truck,
  UserRound,
  Users,
  Wifi,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { useEscape } from "@/components/app/use-escape";
import { recordExpense, type ActionState } from "@/lib/actions/expenses";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

import { useT } from "@/components/app/locale-provider";

type Scope = "OFFICE" | "CONTAINER" | "SPECIAL" | "EXECUTIVE";
type Family = "SAILING" | "OFFICE" | "EXECUTIVE";
/** The list each kind of spending picks from. Special is the office's list. */
const familyForScope = (scope: Scope): Family =>
  scope === "CONTAINER" ? "SAILING" : scope === "EXECUTIVE" ? "EXECUTIVE" : "OFFICE";

/* The shapes lib/expense-picker.ts sends. Repeated rather than imported: that
   file is server-only, and a client component that imports it fails to build. */
export type PickerItem = {
  label: string;
  typeId: string | null;
  typeName: string | null;
  vendor: string | null;
  monthly: boolean;
  scope: Scope;
  family: Family;
  times: number;
  last: { amount: string; currency: string } | null;
};
export type PickerGroup = {
  id: string;
  name: string;
  icon: string;
  family: Family;
  synthetic: boolean;
  items: PickerItem[];
};
type Line = { id: string; label: string; amount: string; currency: string; at: string };
export type PickerContainer = {
  id: string;
  reference: string;
  status: string;
  costs: Line[];
  recordedKinds: string[];
  recordedLabels: string[];
};
export type PickerExecutive = {
  id: string;
  name: string;
  role: string;
  named: boolean;
  recordable: boolean;
  draws: Line[];
  totals: { currency: string; amount: string }[];
};
export type PickerHistory = Record<Scope, PickerItem[]>;

const ICONS: Record<string, LucideIcon> = {
  Ship,
  FileCheck,
  Anchor,
  AlarmClock,
  Truck,
  Fuel,
  PackageOpen,
  FileText,
  Users,
  Building2,
  Zap,
  Wifi,
  Landmark,
  Wrench,
  ShieldCheck,
  Receipt,
  Plane,
  Megaphone,
  CircleHelp,
  Coins,
  Wallet,
  GraduationCap,
  HeartPulse,
  Home,
  Gift,
  Utensils,
  ShoppingBag,
};
const Glyph = ({ name, className }: { name: string; className?: string }) => {
  const Icon = ICONS[name] ?? Coins;
  return <Icon className={className} />;
};

/*
  WHOSE MONEY THIS IS, ASKED FIRST — and each answer opens its own list.

  The office picks from its running costs. A sailing picks the container
  first, off a list that puts the boxes nothing has been recorded on at the
  top, then the costs a sailing can incur. Special picks from what has been
  recorded as a one-off before. Executive picks the person first, shows every
  draw already taken in their name, then what was drawn. Four questions, not
  one form with a scope field somebody forgets to change.
*/
const SCOPES: { key: Scope; label: string; hint: string }[] = [
  { key: "OFFICE", label: "The office", hint: "The business's own running costs" },
  { key: "CONTAINER", label: "A sailing", hint: "Charged to one container's margin" },
  { key: "SPECIAL", label: "Special", hint: "A one-off, outside the usual running costs" },
  { key: "EXECUTIVE", label: "Executive", hint: "An owner's or director's own draw" },
];

/*
  WHY THE MONEY LEFT, BEFORE WHAT IT WAS.

  An owner takes money out for three different reasons, and a partner or an
  accountant reading the draws asks about them in that order: the profit that
  is theirs, money taken to spend on the business itself — which should come
  back as receipts — and personal spending. So the draw kinds are shown under
  those three headings. Read by name: a kind the office adds later that
  matches none of them is still offered, under "Other draws".
*/
const DRAW_SECTIONS: { title: string; match: RegExp }[] = [
  { title: "Profit & capital", match: /profit|dividend|capital|drawing|loan to|advance/i },
  {
    title: "For the business",
    match: /business|sourcing|supplier|market visit|client|director's allowance|float/i,
  },
  {
    title: "Personal",
    match: /personal|school|medical|household|family|harambee|contribution|gift|meals/i,
  },
];
const sectionOf = (item: PickerItem) => {
  const name = item.typeName ?? item.label;
  return DRAW_SECTIONS.find((sec) => sec.match.test(name))?.title ?? "Other draws";
};

const STATUS: Record<string, string> = {
  OPEN: "Open",
  LOADING: "Loading",
  LOADED: "Loaded",
  SEALED: "Sealed",
  DEPARTED: "At sea",
  IN_TRANSIT: "At sea",
  ARRIVED: "In Dar",
  CLOSED: "Closed",
};
const ROLE: Record<string, string> = { ADMIN: "Owner", MANAGER: "Manager" };

function money(amount: string | number, currency: string) {
  const n = typeof amount === "number" ? amount : Number(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "TZS" ? 0 : 2,
  }).format(n);
}
function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * RECORDING A COST, IN THE ORDER SOMEBODY ACTUALLY PAYS ONE.
 *
 * Whose money, then what it was for, then how much. That is the order the
 * question is asked in at the counter and the order a receipt is read in, and
 * splitting it is what lets each step be a list to point at rather than a box
 * to type in.
 *
 * Every list is the register read back — see lib/expense-picker.ts — so
 * choosing an item fills what it was for AND the kind of cost together, and
 * the sailing and the executive lists show what is already recorded against
 * each before anything is added. A cost recorded twice on one box, or a draw
 * nobody can find under the name it was taken in, is the mistake this screen
 * exists to prevent.
 */
export function RecordExpense({
  history: histories,
  groups,
  containers,
  executives,
  accounts,
  defaultCurrency = "TZS",
  defaultAccountId,
  label,
  containerId,
  triggerClassName,
}: {
  history: PickerHistory;
  groups: PickerGroup[];
  containers: PickerContainer[];
  executives: PickerExecutive[];
  accounts: { id: string; label: string }[];
  defaultCurrency?: string;
  /** Opened from one account's own page: the money leaves that account. */
  defaultAccountId?: string;
  label?: string;
  /**
   * Opened from a sailing's own page: every cost recorded here is that
   * sailing's, so the scope and the container are not questions.
   */
  containerId?: string;
  triggerClassName?: string;
}) {
  const tx = useT();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(recordExpense, {});
  const [said, setSaid] = useState<string | null>(null);

  const [step, setStep] = useState<1 | 2>(1);
  const [chosen, setChosen] = useState<PickerItem | null>(null);
  const [scope, setScope] = useState<Scope>(containerId ? "CONTAINER" : "OFFICE");
  const [groupId, setGroupId] = useState<string>("used-most");
  const [query, setQuery] = useState("");
  const [boxId, setBoxId] = useState<string>(containerId ?? "");
  const [personId, setPersonId] = useState<string>("");

  const reset = () => {
    setStep(1);
    setChosen(null);
    setQuery("");
    setGroupId("used-most");
    if (!containerId) {
      setBoxId("");
      setPersonId("");
    }
  };

  useEscape(open, () => setOpen(false));
  useEffect(() => {
    if (state.ok) {
      setSaid(state.ok);
      setOpen(false);
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const box = containers.find((c) => c.id === boxId) ?? null;
  const person = executives.find((e) => e.id === personId) ?? null;

  /* What each kind of spending picks from — one of three lists that never
     cross. A sailing picks a sailing's kinds, an executive picks what an owner
     takes out, and the office and special pick the running costs. The server
     refuses a cost filed across them, so nothing offered here is refused
     when it is pressed. */
  const wantContainer = scope === "CONTAINER";
  const family = familyForScope(scope);
  const kinds = useMemo(() => groups.filter((g) => g.family === family), [groups, family]);
  /* Each chip's own history, cut per chip on the server. */
  const history = histories[scope] ?? [];

  /* A sailing's costs, flat: every kind it can incur and every untyped cost a
     sailing has had, with the ones this box has not been charged at the top.
     "Recorded" is decided by the words on the row where the row is a real
     cost, and by its kind only where the row is a kind standing in for
     itself — "Port charges" recorded does not mean "Port charges to TPA" is. */
  const boxCosts = useMemo(() => {
    if (!wantContainer) return [];
    const labels = new Set(box?.recordedLabels ?? []);
    const kindsOn = new Set((box?.recordedKinds ?? []).map((k) => k.toLowerCase()));
    return dedupe([...history, ...kinds.flatMap((g) => g.items)])
      .map((item) => ({
        item,
        missing:
          item.times === 0
            ? !kindsOn.has((item.typeName ?? item.label).toLowerCase()) &&
              !labels.has(item.label.toLowerCase())
            : !labels.has(item.label.toLowerCase()),
      }))
      .sort((a, b) => Number(b.missing) - Number(a.missing) || b.item.times - a.item.times);
  }, [wantContainer, kinds, box, history]);

  const searching = query.trim().length > 0;
  const needle = query.trim().toLowerCase();
  const matches = (item: PickerItem) =>
    item.label.toLowerCase().includes(needle) ||
    (item.typeName ?? "").toLowerCase().includes(needle) ||
    (item.vendor ?? "").toLowerCase().includes(needle);

  /* The list on the right, for the office and special. */
  const group = kinds.find((g) => g.id === groupId) ?? null;
  const officeList: PickerItem[] = searching
    ? dedupe([...history, ...kinds.flatMap((g) => g.items)].filter(matches)).slice(0, 24)
    : groupId === "used-most"
      ? history
      : dedupe(group?.items ?? []);

  /* What an executive draws: what has been drawn before, then every kind of
     draw, so something new can be named. */
  const drawList: PickerItem[] = searching
    ? dedupe([...history, ...kinds.flatMap((g) => g.items)].filter(matches)).slice(0, 24)
    : dedupe([...history, ...kinds.flatMap((g) => g.items)]);

  const pick = (item: PickerItem) => {
    setChosen(item);
    setStep(2);
  };
  const pickNew = () => {
    /* The group's kind, only when it IS a kind (never the "not filed" group,
       whose id is not one), only when the desk is browsing it rather than
       searching across everything, and only when it is on this chip's list. */
    const fromGroup =
      !searching && groupId !== "used-most" && group && !group.synthetic && group.family === family
        ? group
        : null;
    pick({
      label: query.trim(),
      typeId: fromGroup?.id ?? null,
      typeName: fromGroup?.name ?? null,
      vendor: null,
      monthly: false,
      scope,
      family,
      times: 0,
      last: null,
    });
  };

  const needsBox = wantContainer && !box;
  const needsPerson = scope === "EXECUTIVE" && !person;
  /* A row that shows draws but takes no new one: draws with no name on them,
     and people no longer on the Management desk. Shown so nothing drawn goes
     missing from view; never somebody a new draw can be recorded to. */
  const readOnly = scope === "EXECUTIVE" && person !== null && !person.recordable;

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        {said ? <p className="text-sm text-success">{said}</p> : null}
        <Button
          onClick={() => {
            setSaid(null);
            setOpen(true);
          }}
          className={triggerClassName}
        >
          <Plus />
          {label ?? tx("Record a cost")}
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/70 p-4 text-left backdrop-blur-sm sm:p-8">
      <button
        type="button"
        aria-label={tx("Close")}
        onClick={() => setOpen(false)}
        className="absolute inset-0 cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tx("Record a cost")}
        className="relative w-full max-w-[46rem] overflow-hidden rounded-2xl border bg-card shadow-lg"
      >
        <div className="flex items-center justify-between gap-3 px-6 pt-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
            <StepPill n={1} name={tx("What")} active={step === 1} onClick={() => setStep(1)} />
            <span className="h-px w-5 bg-border" />
            <StepPill n={2} name={tx("How much")} active={step === 2} />
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={tx("Close")}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {step === 1 ? (
          <div className="px-6 pb-5 pt-4">
            <h2 className="text-xl font-semibold tracking-tight">
              {scope === "EXECUTIVE" ? tx("Whose draw is it?") : tx("What did you pay for?")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {scope === "CONTAINER" && !containerId
                ? tx("Pick the container, then what it cost. The ones with nothing recorded come first.")
                : scope === "EXECUTIVE"
                  ? tx("Pick the person, see what they have drawn, then record the new one.")
                  : tx("Search, or pick from a group. Anything new is saved for next time.")}
            </p>

            {!containerId ? (
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                {SCOPES.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    title={tx(option.hint)}
                    onClick={() => {
                      setScope(option.key);
                      setGroupId("used-most");
                      setQuery("");
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      scope === option.key
                        ? "border-brand bg-brand/10 text-brand"
                        : "text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    {tx(option.label)}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  scope === "CONTAINER"
                    ? tx("Search — wharfage, demurrage, THC, chassis…")
                    : scope === "EXECUTIVE"
                      ? tx("Search — travel, allowance, advance…")
                      : tx("Search — port charges, fuel, salaries, rent…")
                }
                className="focus-ring h-12 w-full rounded-xl border bg-background pl-10 pr-4 text-sm"
              />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[15rem_1fr]">
              {/* ---------------------------------------------- left rail */}
              <div className="max-h-[21rem] overflow-y-auto rounded-xl border p-1.5">
                {scope === "CONTAINER" ? (
                  containerId ? (
                    box ? (
                      <RailRow
                        icon={<ContainerIcon className="size-4 shrink-0" />}
                        name={box.reference}
                        meta={tx(STATUS[box.status] ?? box.status)}
                        count={box.costs.length}
                        active
                        onClick={() => undefined}
                      />
                    ) : null
                  ) : containers.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground">
                      {tx("No open container to charge.")}
                    </p>
                  ) : (
                    <>
                      <RailHeading>{tx("Nothing recorded yet")}</RailHeading>
                      {containers
                        .filter((c) => c.costs.length === 0)
                        .map((c) => (
                          <RailRow
                            key={c.id}
                            icon={<ContainerIcon className="size-4 shrink-0" />}
                            name={c.reference}
                            meta={tx(STATUS[c.status] ?? c.status)}
                            count={0}
                            active={boxId === c.id}
                            onClick={() => setBoxId(c.id)}
                          />
                        ))}
                      {containers.every((c) => c.costs.length > 0) ? (
                        <p className="px-3 pb-2 text-xs text-muted-foreground">
                          {tx("Every open container has costs on it.")}
                        </p>
                      ) : null}
                      {containers.some((c) => c.costs.length > 0) ? (
                        <RailHeading>{tx("Has costs")}</RailHeading>
                      ) : null}
                      {containers
                        .filter((c) => c.costs.length > 0)
                        .map((c) => (
                          <RailRow
                            key={c.id}
                            icon={<ContainerIcon className="size-4 shrink-0" />}
                            name={c.reference}
                            meta={tx(STATUS[c.status] ?? c.status)}
                            count={c.costs.length}
                            active={boxId === c.id}
                            onClick={() => setBoxId(c.id)}
                          />
                        ))}
                    </>
                  )
                ) : scope === "EXECUTIVE" ? (
                  executives.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground">
                      {tx("Nobody is on the Management desk.")}
                    </p>
                  ) : (
                    executives.map((e) => (
                      <RailRow
                        key={e.id}
                        icon={<UserRound className="size-4 shrink-0" />}
                        name={e.named ? e.name : tx("Not named")}
                        meta={
                          !e.named
                            ? tx("Draws with no name on them")
                            : e.recordable
                              ? tx(ROLE[e.role] ?? e.role)
                              : tx("No longer on the desk")
                        }
                        count={e.draws.length}
                        active={personId === e.id}
                        onClick={() => setPersonId(e.id)}
                      />
                    ))
                  )
                ) : (
                  <>
                    <RailRow
                      icon={<Sparkles className="size-4 shrink-0" />}
                      name={scope === "SPECIAL" ? tx("Special before") : tx("Used most")}
                      count={history.length}
                      active={!searching && groupId === "used-most"}
                      onClick={() => {
                        setQuery("");
                        setGroupId("used-most");
                      }}
                    />
                    {kinds.map((g) => (
                      <RailRow
                        key={g.id}
                        icon={<Glyph name={g.icon} className="size-4 shrink-0" />}
                        name={g.synthetic ? tx("Not filed under a kind") : tx(g.name)}
                        count={g.items.filter((i) => i.times > 0).length}
                        active={!searching && groupId === g.id}
                        onClick={() => {
                          setQuery("");
                          setGroupId(g.id);
                        }}
                      />
                    ))}
                  </>
                )}
              </div>

              {/* ---------------------------------------------- right panel */}
              <div className="flex max-h-[21rem] min-h-[16rem] flex-col overflow-hidden rounded-xl border">
                {scope === "CONTAINER" ? (
                  needsBox || !box ? (
                    <Empty>{tx("Pick a container on the left — a cost belongs to one sailing or to none.")}</Empty>
                  ) : (
                    <>
                      <PanelHeading>
                        {box.reference} · {tx(STATUS[box.status] ?? box.status)}
                      </PanelHeading>
                      <div className="flex-1 overflow-y-auto">
                        {/* What is already on the box, before anything is
                            added: a cost recorded twice is the commonest
                            mistake on this screen. */}
                        {box.costs.length > 0 && !searching ? (
                          <div className="border-b bg-secondary/20 px-4 py-2.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {tx("Already on it")}
                            </p>
                            <ul className="mt-1.5 space-y-1">
                              {box.costs.slice(0, 6).map((c) => (
                                <li key={c.id} className="flex justify-between gap-3 text-xs">
                                  <span className="min-w-0 truncate">{c.label}</span>
                                  <span className="tnum shrink-0 text-muted-foreground">
                                    {money(c.amount, c.currency)} · {day(c.at)}
                                  </span>
                                </li>
                              ))}
                              {box.costs.length > 6 ? (
                                <li className="text-xs text-muted-foreground">
                                  {tx("and")} {box.costs.length - 6} {tx("more")}
                                </li>
                              ) : null}
                            </ul>
                          </div>
                        ) : null}
                        {boxCosts
                          .filter(({ item }) => !searching || matches(item))
                          .map(({ item, missing }) => (
                            <ItemRow
                              key={`${item.scope}-${item.typeId ?? "none"}-${item.label}`}
                              item={item}
                              sub={
                                missing
                                  ? tx("Not recorded on this container yet")
                                  : tx("Already recorded on this container")
                              }
                              emphasis={missing}
                              onClick={() => pick(item)}
                            />
                          ))}
                      </div>
                      <AddRow
                        text={
                          searching
                            ? `${tx("Add")} “${query.trim()}” ${tx("to")} ${box.reference}`
                            : `${tx("Something else on")} ${box.reference}`
                        }
                        onClick={pickNew}
                      />
                    </>
                  )
                ) : scope === "EXECUTIVE" ? (
                  needsPerson || !person ? (
                    <Empty>{tx("Pick the person on the left to see their draws.")}</Empty>
                  ) : (
                    <>
                      <PanelHeading>
                        {person.named ? person.name : tx("Not named")}
                        {person.totals.length > 0
                          ? ` · ${tx("drawn")} ${person.totals.map((t) => money(t.amount, t.currency)).join(" + ")}`
                          : ` · ${tx("nothing drawn yet")}`}
                      </PanelHeading>
                      <div className="flex-1 overflow-y-auto">
                        {person.draws.length > 0 && !searching ? (
                          <div className="border-b bg-secondary/20 px-4 py-2.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {tx("Their draws")}
                            </p>
                            <ul className="mt-1.5 space-y-1">
                              {person.draws.slice(0, 8).map((d) => (
                                <li key={d.id} className="flex justify-between gap-3 text-xs">
                                  <span className="min-w-0 truncate">{d.label}</span>
                                  <span className="tnum shrink-0 text-muted-foreground">
                                    {money(d.amount, d.currency)} · {day(d.at)}
                                  </span>
                                </li>
                              ))}
                              {person.draws.length > 8 ? (
                                <li className="text-xs text-muted-foreground">
                                  {tx("and")} {person.draws.length - 8} {tx("more")}
                                </li>
                              ) : null}
                            </ul>
                          </div>
                        ) : null}
                        {readOnly ? (
                          <Empty>
                            {person.named
                              ? tx("No longer on the Management desk. Their draws stay here; a new draw is recorded to somebody on the desk.")
                              : tx("These draws carry no name. Record new draws under the person who took them.")}
                          </Empty>
                        ) : (
                          <>
                            <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {tx("Record a new draw for")} {person.name}
                            </p>
                            {/* Searching is one flat list of matches; browsing
                                is what has been drawn before, then each
                                section of why money leaves. */}
                            {(searching
                              ? [{ title: "", items: drawList }]
                              : [
                                  { title: "Drawn before", items: history },
                                  ...[...DRAW_SECTIONS.map((sec) => sec.title), "Other draws"].map((title) => ({
                                    title,
                                    items: dedupe(kinds.flatMap((g) => g.items)).filter(
                                      (item) =>
                                        sectionOf(item) === title &&
                                        !history.some((h) => h.label.toLowerCase() === item.label.toLowerCase())
                                    ),
                                  })),
                                ]
                            )
                              .filter((sec) => sec.items.length > 0)
                              .map((sec) => (
                                <div key={sec.title || "matches"}>
                                  {sec.title ? (
                                    <p className="bg-secondary/30 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                      {tx(sec.title)}
                                    </p>
                                  ) : null}
                                  {sec.items.map((item) => (
                                    <ItemRow
                                      key={`${sec.title}-${item.scope}-${item.typeId ?? "none"}-${item.label}`}
                                      item={item}
                                      sub={subtitleOf(item, tx)}
                                      onClick={() => pick(item)}
                                    />
                                  ))}
                                </div>
                              ))}
                          </>
                        )}
                      </div>
                      {readOnly ? null : (
                        <AddRow
                          text={
                            searching
                              ? `${tx("Add")} “${query.trim()}” ${tx("as a draw")}`
                              : tx("Something else — a new draw")
                          }
                          onClick={pickNew}
                        />
                      )}
                    </>
                  )
                ) : (
                  <>
                    <PanelHeading>
                      {searching
                        ? `${officeList.length} ${officeList.length === 1 ? tx("match") : tx("matches")}`
                        : groupId === "used-most"
                          ? scope === "SPECIAL"
                            ? tx("Recorded as special before")
                            : tx("Used most")
                          : group
                            ? group.synthetic
                              ? tx("Not filed under a kind")
                              : tx(group.name)
                            : ""}
                    </PanelHeading>
                    <div className="flex-1 overflow-y-auto">
                      {officeList.length === 0 ? (
                        <Empty>
                          {scope === "SPECIAL" && groupId === "used-most"
                            ? tx("Nothing recorded as special yet — pick a group, or add it below.")
                            : tx("Nothing here yet — add it below.")}
                        </Empty>
                      ) : (
                        officeList.map((item) => (
                          <ItemRow
                            key={`${item.scope}-${item.typeId ?? "none"}-${item.label}`}
                            item={item}
                            sub={subtitleOf(item, tx)}
                            onClick={() => pick(item)}
                          />
                        ))
                      )}
                    </div>
                    <AddRow
                      text={
                        searching
                          ? `${tx("Add")} “${query.trim()}” — ${tx("a cost we have not paid before")}`
                          : group && groupId !== "used-most" && !group.synthetic
                            ? `${tx("Something else in")} ${tx(group.name)}`
                            : tx("Something else — add a new cost")
                      }
                      onClick={pickNew}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <HowMuch
            chosen={chosen}
            scope={scope}
            box={box}
            person={person}
            accounts={accounts}
            defaultCurrency={defaultCurrency}
            defaultAccountId={defaultAccountId}
            action={action}
            error={state.error}
            onBack={() => setStep(1)}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ step 2 */

function HowMuch({
  chosen,
  scope,
  box,
  person,
  accounts,
  defaultCurrency,
  defaultAccountId,
  action,
  error,
  onBack,
}: {
  chosen: PickerItem | null;
  scope: Scope;
  box: PickerContainer | null;
  person: PickerExecutive | null;
  accounts: { id: string; label: string }[];
  defaultCurrency: string;
  defaultAccountId?: string;
  action: (formData: FormData) => void;
  error?: string;
  onBack: () => void;
}) {
  const tx = useT();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(chosen?.last?.currency ?? defaultCurrency);
  const amountRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    (chosen?.label ? amountRef : descRef).current?.focus();
  }, [chosen?.label]);

  /* Whose money, said on the card: the sailing, the person, or the kind of
     spending — before the figure is typed, not after. */
  const whose =
    scope === "CONTAINER"
      ? (box?.reference ?? tx("a container"))
      : scope === "EXECUTIVE"
        ? `${tx("Drawn by")} ${person?.name ?? ""}`
        : tx(SCOPES.find((o) => o.key === scope)?.label ?? "");

  return (
    <form action={action} className="px-6 pb-6 pt-4">
      <input type="hidden" name="expenseTypeId" value={chosen?.typeId ?? ""} />
      <input type="hidden" name="scope" value={scope} />
      {scope === "CONTAINER" && box ? <input type="hidden" name="containerId" value={box.id} /> : null}
      {scope === "EXECUTIVE" && person ? <input type="hidden" name="executiveId" value={person.id} /> : null}

      <div className="flex items-center gap-3 rounded-xl border bg-secondary/30 px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary">
          <Glyph name={iconOf(chosen)} className="size-4 text-muted-foreground" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{chosen?.label || tx("A new cost")}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {[
              chosen?.typeName && chosen.typeName.toLowerCase() !== chosen.label.toLowerCase()
                ? chosen.typeName
                : null,
              whose,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {tx("Change")}
        </button>
      </div>

      <h2 className="mt-4 text-xl font-semibold tracking-tight">{tx("How much was it?")}</h2>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="xp-amount">{tx("Amount")}</Label>
          <div className="flex gap-2">
            <Input
              ref={amountRef}
              id="xp-amount"
              name="amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="tnum h-12 min-w-0 text-lg"
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
          {/* The same bill usually costs what it cost last time. */}
          {chosen?.last ? (
            <button
              type="button"
              onClick={() => {
                setAmount(String(Number(chosen.last!.amount)));
                setCurrency(chosen.last!.currency);
                amountRef.current?.focus();
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {tx("Last time")} {money(chosen.last.amount, chosen.last.currency)} ·{" "}
              <span className="font-medium text-brand">{tx("use it")}</span>
            </button>
          ) : null}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="xp-description">{tx("What it was for")}</Label>
          <Input
            ref={descRef}
            id="xp-description"
            name="description"
            required
            defaultValue={chosen?.label ?? ""}
            placeholder={tx("Port charges, fuel, rent…")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="xp-account">{tx("Paid from")}</Label>
          <NativeSelect id="xp-account" name="accountId" defaultValue={defaultAccountId ?? ""}>
            <option value="">{tx("Not paid yet")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="xp-date">{tx("Date")}</Label>
          <Input id="xp-date" name="expenseDate" type="date" min="2000-01-01" max="2099-12-31" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="xp-vendor">{tx("Paid to")}</Label>
          <Input
            id="xp-vendor"
            name="vendorName"
            defaultValue={chosen?.vendor ?? ""}
            placeholder={tx("Shipping line, clearing agent…")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="xp-ref">{tx("Their reference")}</Label>
          <Input id="xp-ref" name="referenceNumber" placeholder={tx("Invoice or receipt number")} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
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

      <FormMessage error={error} />
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
        <SubmitButton pendingLabel={tx("Recording…")}>
          {scope === "EXECUTIVE" ? tx("Record the draw") : tx("Record the cost")}
        </SubmitButton>
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

/* ------------------------------------------------------------------- parts */

/**
 * One row per name, keeping the one that has actually been paid.
 *
 * A kind nobody has used stands in for itself under its own name, and the
 * same name paid for real must win over it — otherwise the row carries no
 * last amount, and its "recorded on this box" mark is decided by the stand-in.
 */
function dedupe(items: PickerItem[]) {
  const best = new Map<string, PickerItem>();
  const order: string[] = [];
  for (const item of items) {
    const key = item.label.toLowerCase();
    const held = best.get(key);
    if (!held) {
      best.set(key, item);
      order.push(key);
    } else if (held.times === 0 && item.times > 0) {
      best.set(key, item);
    }
  }
  return order.map((key) => best.get(key)!);
}

/**
 * The line under the name — never the name a second time.
 *
 * A cost nobody has paid yet is its category standing in for itself, and
 * "Wharfage / Wharfage" tells the desk nothing while looking like a mistake.
 */
function subtitleOf(item: PickerItem, tx: (s: string) => string) {
  const said: string[] = [];
  if (item.typeName && item.typeName.toLowerCase() !== item.label.toLowerCase()) {
    said.push(item.typeName);
  }
  if (item.vendor) said.push(`${tx("to")} ${item.vendor}`);
  if (said.length > 0) return said.join(" · ");
  return item.times === 0 ? tx("Never recorded yet") : tx("Recorded before");
}

function iconOf(item: PickerItem | null) {
  const name = item?.typeName ?? item?.label ?? "";
  if (/freight|ocean|sea|shipping|lading/i.test(name)) return "Ship";
  if (/clear|forward|customs|duty/i.test(name)) return "FileCheck";
  if (/port|wharf|terminal|thc/i.test(name)) return "Anchor";
  if (/demurrage|detention|storage/i.test(name)) return "AlarmClock";
  if (/transport|truck|lorry|chassis/i.test(name)) return "Truck";
  if (/fuel|diesel|petrol/i.test(name)) return "Fuel";
  if (/handl|labour|labor|loading|unloading/i.test(name)) return "PackageOpen";
  if (/document|paper|stamp|permit/i.test(name)) return "FileText";
  if (/profit|dividend|capital|drawing|loan to|advance|float/i.test(name)) return "Wallet";
  if (/sourcing|supplier|market visit|business trip|travel|flight|hotel/i.test(name)) return "Plane";
  if (/school|education/i.test(name)) return "GraduationCap";
  if (/medical|hospital|health/i.test(name)) return "HeartPulse";
  if (/household|family/i.test(name)) return "Home";
  if (/gift|hospitality|harambee|contribution/i.test(name)) return "Gift";
  if (/meal|entertainment/i.test(name)) return "Utensils";
  if (/purchase|shopping/i.test(name)) return "ShoppingBag";
  if (/business development/i.test(name)) return "Megaphone";
  if (/salary|salaries|payroll|staff|allowance/i.test(name)) return "Users";
  if (/rent|office|premises/i.test(name)) return "Building2";
  if (/electric|water|power|utilit/i.test(name)) return "Zap";
  if (/internet|airtime|phone|subscription/i.test(name)) return "Wifi";
  if (/bank|charge|fee|commission/i.test(name)) return "Landmark";
  if (/repair|maintenance/i.test(name)) return "Wrench";
  if (/insur|security/i.test(name)) return "ShieldCheck";
  if (/tax|vat|levy/i.test(name)) return "Receipt";
  if (/travel|flight|hotel/i.test(name)) return "Plane";
  if (/market|advert/i.test(name)) return "Megaphone";
  return "Coins";
}

function StepPill({
  n,
  name,
  active,
  onClick,
}: {
  n: number;
  name: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
        active ? "bg-secondary text-foreground" : "text-muted-foreground",
        onClick ? "hover:text-foreground" : "cursor-default"
      )}
    >
      <span className={cn(active ? "text-brand" : "")}>{n}</span>
      {name}
    </button>
  );
}

function RailHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function RailRow({
  icon,
  name,
  meta,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  name: string;
  meta?: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
        active ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/50"
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{name}</span>
        {meta ? <span className="block truncate text-[11px] font-normal text-muted-foreground">{meta}</span> : null}
      </span>
      <span className="tnum shrink-0 text-xs text-muted-foreground">{count}</span>
    </button>
  );
}

function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-sm text-muted-foreground">{children}</p>;
}

function ItemRow({
  item,
  sub,
  emphasis,
  onClick,
}: {
  item: PickerItem;
  sub: string;
  emphasis?: boolean;
  onClick: () => void;
}) {
  const tx = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-secondary/60"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary">
        <Glyph name={iconOf(item)} className="size-4 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{tx(item.label)}</span>
        <span className={cn("block truncate text-xs", emphasis ? "text-warning" : "text-muted-foreground")}>
          {sub}
        </span>
      </span>
      {item.monthly ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
          <CalendarClock className="size-3" />
          {tx("Monthly")}
        </span>
      ) : null}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function AddRow({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 border-t px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-secondary/60"
    >
      <Plus className="size-4" />
      {text}
    </button>
  );
}
