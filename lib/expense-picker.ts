import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * WHAT THIS BUSINESS ACTUALLY PAYS FOR, READ OFF WHAT IT HAS PAID.
 *
 * Recording a cost used to start with an empty form and a list of categories,
 * which asks the desk to describe the same twelve things over and over and to
 * file each one under whichever category came to mind that day. The same fee
 * then appears three times in the books under three names, and the cost report
 * is a list of near-duplicates nobody can add up.
 *
 * So the picker is built from the register itself: every distinct thing this
 * company has paid for, grouped by the kind of cost it was filed under, most
 * used first. Choosing one fills the name AND the kind together, which is what
 * stops the near-duplicates. Anything genuinely new is typed once and is on the
 * list from then on, because the list is only ever a reading of the register.
 *
 * THREE LISTS THAT NEVER CROSS. A sailing's kinds (wharfage, demurrage), the
 * office's (rent, internet) and an executive's (drawings, school fees). Each
 * chip on the picker offers only its own, and the server refuses a cost filed
 * across them — the same rule, in both places, so nothing the screen offers is
 * refused when it is pressed.
 *
 * NOTHING HERE IS A SETTING TO MAINTAIN. Pay for something new and it appears;
 * stop paying for it and it falls down the list on its own.
 */

export type Scope = "CONTAINER" | "OFFICE" | "SPECIAL" | "EXECUTIVE";
const SCOPES: Scope[] = ["CONTAINER", "OFFICE", "SPECIAL", "EXECUTIVE"];

/** Which of the three lists a kind of cost belongs to. */
export type Family = "SAILING" | "OFFICE" | "EXECUTIVE";
export const familyOf = (kind: { forContainer: boolean; forExecutive: boolean }): Family =>
  kind.forContainer ? "SAILING" : kind.forExecutive ? "EXECUTIVE" : "OFFICE";
/** The list each kind of spending picks from. Special is the office's list. */
export const familyForScope = (scope: Scope): Family =>
  scope === "CONTAINER" ? "SAILING" : scope === "EXECUTIVE" ? "EXECUTIVE" : "OFFICE";

export type ExpenseChoice = {
  /** What was paid for, in the words the desk used: "Port charges", "Ice". */
  label: string;
  typeId: string | null;
  typeName: string | null;
  /** Who it was paid to, when the register agrees on one. */
  vendor: string | null;
  /**
   * Paid in three or more separate months. The desk reads it as "this is one of
   * the standing bills", which is the difference between a fee somebody forgot
   * and a fee nobody owes this month.
   */
  monthly: boolean;
  /** The kind of spending it was last recorded as. */
  scope: Scope;
  /** The list it belongs to. */
  family: Family;
  /** How many times it has been paid. Orders the list; never shown as a figure. */
  times: number;
  /** What it came to the last time, so the desk can take the figure as read. */
  last: { amount: string; currency: string } | null;
};

export type ExpenseGroup = {
  id: string;
  name: string;
  /** A lucide name the picker maps to an icon. */
  icon: string;
  family: Family;
  /**
   * Not a kind of cost at all but the costs filed under none. Its id is never
   * a kind's, and the picker never sends it as one — a made-up id posted as a
   * kind is a foreign key the database refuses.
   */
  synthetic: boolean;
  items: ExpenseChoice[];
};

type Line = { id: string; label: string; amount: string; currency: string; at: string };

/**
 * ONE SAILING, AS THE PICKER OFFERS IT.
 *
 * Costs are recorded against a container far more often than against the
 * office, and the question at that moment is "which box" before it is "what
 * for". So the sailing is picked off a list — newest first, the ones nothing
 * has been recorded on flagged — and what is already on it is shown, because
 * a cost recorded twice on one box is the commonest mistake this screen can
 * prevent.
 */
export type PickerContainer = {
  id: string;
  reference: string;
  status: string;
  /** Every live cost on it, newest first — however old, however described. */
  costs: Line[];
  /** The kinds it has been charged, by name. */
  recordedKinds: string[];
  /** What it has been charged, by the words on each cost, lowercased. */
  recordedLabels: string[];
};

/**
 * ONE EXECUTIVE, WITH THEIR DRAWS.
 *
 * Money the company's own people take or spend is read back per person, never
 * as one pile: the question asked of it is "whose", and the list under a name
 * is what lets that person's draws be checked against what they say they took.
 */
export type PickerExecutive = {
  id: string;
  name: string;
  role: string;
  /**
   * False for the row that holds draws recorded before draws carried a name.
   * They are shown so nothing goes missing, and no new draw can be recorded to
   * nobody.
   */
  named: boolean;
  /**
   * False for anybody who is no longer an active member of the Management
   * desk. Their draws stay on the list — a draw does not stop having been
   * taken when its taker leaves — but no new one can be recorded to them.
   */
  recordable: boolean;
  draws: Line[];
  /** Everything drawn, per currency — never added across two. */
  totals: { currency: string; amount: string }[];
};

/** How far back the register is read for the lists of things to pick. */
const WINDOW_DAYS = 400;
/** How many a busy kind of spending shows under "Used most". */
const MOST_USED = 8;
/** The rare kinds show everything they have: a one-off is still worth finding. */
const RARE_SHOWN = 40;
const CONTAINERS_SHOWN = 50;

/**
 * The icon for a kind of cost, by what the company called it.
 *
 * Matched on words rather than on a fixed list, so a category the office adds
 * next month still arrives with something better than a blank circle.
 */
const ICONS: [RegExp, string][] = [
  [/freight|ocean|sea|shipping|lading/i, "Ship"],
  [/clear|forward|customs|duty|declaration/i, "FileCheck"],
  [/port|wharf|terminal|thc/i, "Anchor"],
  [/demurrage|detention|storage/i, "AlarmClock"],
  [/vehicle|fuel|diesel|petrol/i, "Fuel"],
  [/transport|truck|lorry|deliver|chassis/i, "Truck"],
  [/handl|labour|labor|loading|packing/i, "PackageOpen"],
  [/document|paper|stamp|permit|licen/i, "FileText"],
  [/drawing|advance|loan/i, "Wallet"],
  [/school|education/i, "GraduationCap"],
  [/medical|hospital|health/i, "HeartPulse"],
  [/household|family|home/i, "Home"],
  [/gift|hospitality|harambee|contribution/i, "Gift"],
  [/meal|entertainment/i, "Utensils"],
  [/salary|salaries|payroll|staff|wage|allowance/i, "Users"],
  [/rent|office|premises/i, "Building2"],
  [/electric|water|power|utility|utilities/i, "Zap"],
  [/internet|airtime|phone|sms|subscription|software|data/i, "Wifi"],
  [/bank|charge|fee|commission/i, "Landmark"],
  [/repair|maintenance|service/i, "Wrench"],
  [/insur|security/i, "ShieldCheck"],
  [/tax|tra|vat|levy/i, "Receipt"],
  [/travel|flight|hotel|visit/i, "Plane"],
  [/purchase|shopping/i, "ShoppingBag"],
  [/market|advert|promo/i, "Megaphone"],
];

export function iconFor(name: string | null | undefined) {
  if (!name) return "Coins";
  return ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? "Coins";
}

/**
 * Everything the picker needs, read once.
 *
 * `alwaysContainerId` is the sailing whose own page opened the picker: it is
 * on the list whatever its status and however far down the newest fifty it
 * sits, because that page has no other way to record a cost.
 */
export async function expenseChoices(
  alwaysContainerId?: string,
  options: {
    /**
     * Whether to read every executive's draws. Only the expenses page asks:
     * a container's page has no use for them, and a list of what the owner
     * has taken out is not something to hand to every desk that can open a
     * container.
     */
    executives?: boolean;
    /** Only these kinds of spending, when the caller needs no other. */
    scopes?: Scope[];
  } = {}
): Promise<{
  history: Record<Scope, ExpenseChoice[]>;
  groups: ExpenseGroup[];
  containers: PickerContainer[];
  executives: PickerExecutive[];
}> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const wanted = options.scopes ?? SCOPES;

  /* What has been paid for, to build the lists of things to pick — read PER
     KIND OF SPENDING, each with its own cap. One shared sample let a busy
     sailing register push every one-off and every draw out before the lists
     were even cut. A window is right here: a cost nobody has paid in over a
     year is not one to offer first. It is NOT used for what a box carries or
     what a person has drawn — those are read in full below. */
  const sample = (scope: Scope) =>
    prisma.containerExpense.findMany({
      where: {
        scope,
        deletedAt: null,
        cancelledAt: null,
        payrollRun: { is: null },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: scope === "CONTAINER" || scope === "OFFICE" ? 1000 : 400,
      select: {
        description: true,
        scope: true,
        amount: true,
        currency: true,
        expenseDate: true,
        createdAt: true,
        expenseTypeId: true,
        vendor: { select: { name: true } },
      },
    });

  const [samples, types, boxes, pinned, management] = await Promise.all([
    Promise.all(wanted.map(sample)),
    prisma.expenseType.findMany({
      where: { active: true, name: { not: "Salaries" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, forContainer: true, forExecutive: true },
    }),
    /* The sailings a cost can still land on: newest first, and not the ones
       already closed off — a closed box's margin is settled. */
    wanted.includes("CONTAINER")
      ? prisma.container.findMany({
          where: { deletedAt: null, status: { not: "CLOSED" } },
          orderBy: { createdAt: "desc" },
          take: CONTAINERS_SHOWN,
          select: { id: true, reference: true, status: true },
        })
      : Promise.resolve([]),
    alwaysContainerId
      ? prisma.container.findFirst({
          where: { id: alwaysContainerId, deletedAt: null },
          select: { id: true, reference: true, status: true },
        })
      : Promise.resolve(null),
    /* The people a new draw may name. */
    options.executives
      ? prisma.user.findMany({
          where: { department: "MANAGEMENT", status: "ACTIVE" },
          orderBy: { name: "asc" },
          select: { id: true, name: true, role: true },
        })
      : Promise.resolve([]),
  ]);
  const paid = samples.flat();

  const typeById = new Map(types.map((t) => [t.id, t]));

  /* One entry per thing paid for, twice over: once per kind of spending (for
     each chip's own history) and once overall (for the groups, where one row
     per name is what the desk expects). Newest first, so the first seen of
     each carries the last amount and the filing the office has settled on. */
  type Tally = ExpenseChoice & { months: Set<string> };
  const byScope = new Map<string, Tally>();
  const overall = new Map<string, Tally>();
  for (const row of paid) {
    /* A kind that is no longer active is read as no kind: its items stay on
       the list of the spending they were, and are never posted back as a
       kind the picker does not offer. */
    const typed = row.expenseTypeId ? typeById.get(row.expenseTypeId) : null;
    const label = (row.description ?? "").trim() || typed?.name || "";
    if (!label || label.length > 60) continue;
    const when = row.expenseDate ?? row.createdAt;
    const month = `${when.getUTCFullYear()}-${when.getUTCMonth()}`;
    const scope = row.scope as Scope;
    /* A cost filed under no kind belongs to the list of the spending it was:
       an untyped sailing cost is a sailing's, and stays on the sailing list. */
    const family: Family = typed ? familyOf(typed) : familyForScope(scope);

    const add = (map: Map<string, Tally>, key: string) => {
      const found = map.get(key);
      if (found) {
        found.times += 1;
        found.months.add(month);
        return;
      }
      map.set(key, {
        label,
        typeId: typed ? typed.id : null,
        typeName: typed?.name ?? null,
        vendor: row.vendor?.name ?? null,
        monthly: false,
        scope,
        family,
        times: 1,
        last: { amount: row.amount.toString(), currency: row.currency },
        months: new Set([month]),
      });
    };
    add(byScope, `${scope}|${family}|${label.toLowerCase()}`);
    add(overall, `${family}|${label.toLowerCase()}`);
  }

  const settle = (map: Map<string, Tally>): ExpenseChoice[] =>
    [...map.values()]
      .map(({ months, ...item }) => ({ ...item, monthly: months.size >= 3 }))
      .sort((a, b) => b.times - a.times || a.label.localeCompare(b.label));

  const perScope = settle(byScope);
  const everything = settle(overall);

  /* Each chip's own history, cut per chip — never a top eight across all
     four, which let the sailings' costs push every one-off and every draw off
     the list. Only items that belong to the chip's own list: an office cost
     once filed under a kind that has since become a sailing's is not offered
     to the office, where the server would refuse it. */
  const history = Object.fromEntries(
    SCOPES.map((scope) => {
      if (!wanted.includes(scope)) return [scope, []];
      const mine = perScope.filter(
        (item) => item.scope === scope && item.family === familyForScope(scope)
      );
      const rare = scope === "SPECIAL" || scope === "EXECUTIVE";
      return [scope, mine.slice(0, rare ? RARE_SHOWN : MOST_USED)];
    })
  ) as Record<Scope, ExpenseChoice[]>;

  /* Every kind the company has named, each holding what has been paid under
     it. A kind nobody has used yet offers itself, so pressing it is how the
     first one gets recorded. */
  const groups: ExpenseGroup[] = types.map((type) => {
    const family = familyOf(type);
    const mine = everything.filter((item) => item.typeId === type.id);
    return {
      id: type.id,
      name: type.name,
      icon: iconFor(type.name),
      family,
      synthetic: false,
      items:
        mine.length > 0
          ? mine
          : [
              {
                label: type.name,
                typeId: type.id,
                typeName: type.name,
                vendor: null,
                monthly: false,
                scope: family === "SAILING" ? "CONTAINER" : family === "EXECUTIVE" ? "EXECUTIVE" : "OFFICE",
                family,
                times: 0,
                last: null,
              },
            ],
    };
  });

  /* Paid for, but under no kind at all — one group per list, so an untyped
     sailing cost is still offered to a sailing and never to the office. */
  for (const family of ["SAILING", "OFFICE", "EXECUTIVE"] as Family[]) {
    const loose = everything.filter((item) => !item.typeId && item.family === family);
    if (loose.length === 0) continue;
    groups.push({
      id: `unfiled-${family.toLowerCase()}`,
      name: "Not filed under a kind",
      icon: "CircleHelp",
      family,
      synthetic: true,
      items: loose,
    });
  }

  /* WHAT IS ON EACH SAILING, READ IN FULL. Not from the sample above: a box
     whose only cost is older than the window, or was recorded without words,
     must not be listed as having nothing on it — that is how the same
     wharfage gets paid twice. */
  const list = pinned && !boxes.some((b) => b.id === pinned.id) ? [pinned, ...boxes] : boxes;
  const boxCosts = list.length
    ? await prisma.containerExpense.findMany({
        where: {
          containerId: { in: list.map((b) => b.id) },
          deletedAt: null,
          cancelledAt: null,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          containerId: true,
          description: true,
          amount: true,
          currency: true,
          expenseDate: true,
          createdAt: true,
          expenseType: { select: { name: true } },
        },
      })
    : [];

  const line = (row: {
    id: string;
    description: string | null;
    amount: { toString(): string };
    currency: string;
    expenseDate: Date | null;
    createdAt: Date;
    expenseType: { name: string } | null;
  }): Line => ({
    id: row.id,
    label: (row.description ?? "").trim() || row.expenseType?.name || "Cost",
    amount: row.amount.toString(),
    currency: row.currency,
    at: (row.expenseDate ?? row.createdAt).toISOString(),
  });

  const containers: PickerContainer[] = list.map((box) => {
    const mine = boxCosts.filter((row) => row.containerId === box.id);
    return {
      id: box.id,
      reference: box.reference,
      status: box.status,
      costs: mine.map(line),
      recordedKinds: [
        ...new Set(mine.map((row) => row.expenseType?.name).filter((n): n is string => Boolean(n))),
      ],
      /* The same words the rows are shown with — a cost recorded without a
         description is shown, and counted, by its kind's name. */
      recordedLabels: [...new Set(mine.map((row) => line(row).label.toLowerCase()).filter(Boolean))],
    };
  });

  /* WHAT EACH PERSON HAS DRAWN, READ IN FULL — every live draw, however old,
     whoever it was taken by. Grouped by the person, not filtered by who is
     on the Management desk today: a draw does not stop having been taken when
     its taker is suspended or moves desk, and a list that dropped it would
     read as that person owing less than they took. */
  const draws = options.executives
    ? await prisma.containerExpense.findMany({
        where: { scope: "EXECUTIVE", deletedAt: null, cancelledAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          executiveId: true,
          executive: { select: { name: true, role: true } },
          description: true,
          amount: true,
          currency: true,
          expenseDate: true,
          createdAt: true,
          expenseType: { select: { name: true } },
        },
      })
    : [];

  const totalsOf = (rows: typeof draws) => {
    const sums = new Map<string, number>();
    for (const row of rows) sums.set(row.currency, (sums.get(row.currency) ?? 0) + Number(row.amount));
    return [...sums.entries()].map(([currency, amount]) => ({
      currency,
      amount: amount.toFixed(currency === "TZS" ? 0 : 2),
    }));
  };

  const active = new Set(management.map((m) => m.id));
  const executives: PickerExecutive[] = management.map((person) => {
    const mine = draws.filter((row) => row.executiveId === person.id);
    return {
      id: person.id,
      name: person.name,
      role: person.role,
      named: true,
      recordable: true,
      draws: mine.map(line),
      totals: totalsOf(mine),
    };
  });
  /* People no longer on the desk, with the draws they took: read, never added to. */
  const former = new Map<string, typeof draws>();
  for (const row of draws) {
    if (!row.executiveId || active.has(row.executiveId)) continue;
    former.set(row.executiveId, [...(former.get(row.executiveId) ?? []), row]);
  }
  for (const [id, rows] of former) {
    executives.push({
      id,
      name: rows[0].executive?.name ?? "Former executive",
      role: rows[0].executive?.role ?? "",
      named: true,
      recordable: false,
      draws: rows.map(line),
      totals: totalsOf(rows),
    });
  }
  const unnamed = draws.filter((row) => row.executiveId === null);
  if (unnamed.length > 0) {
    executives.push({
      id: "unnamed",
      name: "Not named",
      role: "",
      named: false,
      recordable: false,
      draws: unnamed.map(line),
      totals: totalsOf(unnamed),
    });
  }

  return { history, groups, containers, executives };
}
