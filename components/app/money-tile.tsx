import Link from "next/link";
import * as Icons from "lucide-react";

import { cn } from "@/lib/utils";

type Tone = "brand" | "marine" | "signal" | "success" | "warning" | "danger";

const WASH: Record<Tone, string> = {
  brand: "from-brand/[0.16]",
  marine: "from-marine/[0.16]",
  signal: "from-signal/[0.16]",
  success: "from-success/[0.16]",
  warning: "from-warning/[0.18]",
  danger: "from-destructive/[0.16]",
};

const VALUE: Record<Tone, string> = {
  brand: "text-brand",
  marine: "text-marine",
  signal: "text-signal",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

const ICON: Record<Tone, string> = {
  brand: "bg-brand/12 text-brand",
  marine: "bg-marine/12 text-marine",
  signal: "bg-signal/12 text-signal",
  success: "bg-success/12 text-success",
  warning: "bg-warning/14 text-warning",
  danger: "bg-destructive/12 text-destructive",
};

/**
 * A money figure, with what it means underneath it.
 *
 * Bigger than a KPI card and deliberately wordier. Every figure on a finance
 * screen is ambiguous until somebody says which one it is — "owed" could mean
 * billed, or billed and overdue, or billed including the cargo nobody has
 * priced yet — and an explanation under the number is cheaper than the phone
 * call that follows a wrong assumption.
 */
export function MoneyTile({
  label,
  value,
  secondary,
  secondaryLabel,
  caption,
  explanation,
  icon,
  tone = "brand",
  href,
  index = 0,
}: {
  label: string;
  value: string;
  /** The same figure in the other currency, shown in a pill. */
  secondary?: string;
  secondaryLabel?: string;
  caption?: string;
  explanation?: string;
  icon?: string;
  tone?: Tone;
  href?: string;
  index?: number;
}) {
  const Icon = icon
    ? (
        Icons as unknown as Record<
          string,
          React.ComponentType<{ className?: string }>
        >
      )[icon]
    : null;

  const body = (
    <div
      className={cn(
        "animate-in-up relative h-full overflow-hidden rounded-xl border bg-card p-5 shadow-soft transition-all",
        href && "hover:-translate-y-0.5 hover:shadow-raised"
      )}
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent",
          WASH[tone]
        )}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {Icon ? (
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", ICON[tone])}>
              <Icon className="size-4" />
            </span>
          ) : null}
        </div>

        <p className={cn("tnum mt-3 text-[26px] font-semibold leading-none tracking-tight", VALUE[tone])}>
          {value}
        </p>

        {secondary ? (
          <p className="tnum mt-3 inline-flex items-center gap-2 rounded-md bg-foreground/[0.05] px-2.5 py-1.5 text-xs">
            {secondaryLabel ? (
              <span className="text-muted-foreground">{secondaryLabel}</span>
            ) : null}
            <span className="font-semibold">{secondary}</span>
          </p>
        ) : null}

        {caption ? (
          <p className="mt-3 text-sm font-medium">{caption}</p>
        ) : null}

        {explanation ? (
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {explanation}
          </p>
        ) : null}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="focus-ring block rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}
