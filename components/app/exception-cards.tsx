import {
  Archive,
  Coins,
  PackageOpen,
  PackageSearch,
  PackageX,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { KpiCard } from "@/components/app/kpi-card";
import type { ExceptionGroupKey } from "@/lib/exception-groups";
import type { QueueCounts, QueueSet } from "@/lib/exception-queue";
import { t, type Locale } from "@/lib/i18n";

/**
 * The six cards above the issues queue.
 *
 * Each one is a filter, not an ornament. Pressing "Damaged cargo" puts the
 * damaged cases in the table below and lights the card, so the number and the
 * list cannot disagree about what is being counted — both are read with the
 * same `where`.
 */

type CardKey = keyof QueueCounts;

type CardSpec = {
  key: CardKey;
  label: string;
  icon: LucideIcon;
  /** Colour when the number is above zero. Zero is always calm. */
  alertTone: "danger" | "warning" | "success" | "marine";
  hint: string;
  set: QueueSet;
  group: ExceptionGroupKey | "all";
};

const CARDS: CardSpec[] = [
  {
    key: "open",
    label: "Open cases",
    icon: TriangleAlert,
    alertTone: "danger",
    hint: "Everything nobody has finished with",
    set: "open",
    group: "all",
  },
  {
    key: "missing",
    label: "Missing cargo",
    icon: PackageX,
    alertTone: "danger",
    hint: "Short or nothing came off the container",
    set: "open",
    group: "missing",
  },
  {
    key: "damaged",
    label: "Damaged cargo",
    icon: PackageOpen,
    alertTone: "warning",
    hint: "Arrived, but not in one piece",
    set: "open",
    group: "damaged",
  },
  {
    key: "found",
    label: "Cargo found",
    icon: PackageSearch,
    alertTone: "success",
    hint: "Turned up and back in the warehouse",
    set: "found",
    group: "all",
  },
  {
    key: "compensation",
    label: "Compensation pending",
    icon: Coins,
    alertTone: "warning",
    // A count, never a figure — the warehouse reads this card too.
    hint: "Approved payouts Finance has not paid",
    set: "compensation",
    group: "all",
  },
  {
    key: "closed",
    label: "Closed cases",
    icon: Archive,
    alertTone: "marine",
    hint: "Signed off, kept on the record",
    set: "closed",
    group: "all",
  },
];

export function ExceptionCards({
  counts,
  set,
  group,
  cargoId,
  locale,
}: {
  counts: QueueCounts;
  set: QueueSet;
  group: ExceptionGroupKey | "all";
  cargoId: string;
  locale: Locale;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {CARDS.map((card, index) => {
        const count = counts[card.key];
        const active = card.set === set && card.group === group;

        const query = new URLSearchParams();
        if (card.set !== "open") query.set("set", card.set);
        if (card.group !== "all") query.set("group", card.group);
        if (cargoId) query.set("cargo", cargoId);
        const search = query.toString();

        return (
          <div
            key={card.key}
            className={
              active
                ? "rounded-xl ring-2 ring-brand ring-offset-2 ring-offset-background"
                : undefined
            }
          >
            <KpiCard
              label={t(locale, card.label)}
              numeric={count}
              hint={t(locale, card.hint)}
              icon={card.icon}
              tone={count > 0 ? card.alertTone : "marine"}
              href={search ? `/app/exceptions?${search}` : "/app/exceptions"}
              index={index}
            />
          </div>
        );
      })}
    </div>
  );
}
