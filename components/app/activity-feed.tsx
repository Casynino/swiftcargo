import Link from "next/link";
import {
  Banknote,
  Boxes,
  ClipboardCheck,
  DoorOpen,
  LogIn,
  PackagePlus,
  QrCode,
  Settings,
  Ship,
  TriangleAlert,
  UserCog,
  type LucideIcon,
} from "lucide-react";

import { formatRelative } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** An audit action onto an icon and a colour, so the feed can be scanned. */
const ACTION_STYLE: { test: RegExp; icon: LucideIcon; tone: string }[] = [
  { test: /^cargo\.(create|receiv)/, icon: PackagePlus, tone: "text-chart-1" },
  { test: /^(release|cargo\.release)/, icon: DoorOpen, tone: "text-success" },
  { test: /^container\.(depart|sail|transit|arriv)/, icon: Ship, tone: "text-chart-2" },
  { test: /^container\./, icon: Boxes, tone: "text-chart-1" },
  { test: /^(dar|receiving)\./, icon: ClipboardCheck, tone: "text-warning" },
  { test: /^(payment|invoice|expense|receipt|credit)\./, icon: Banknote, tone: "text-success" },
  { test: /^pickup/, icon: QrCode, tone: "text-signal" },
  { test: /^(exception|case)\./, icon: TriangleAlert, tone: "text-warning" },
  { test: /^user\./, icon: UserCog, tone: "text-muted-foreground" },
  { test: /^auth\./, icon: LogIn, tone: "text-muted-foreground" },
];

function styleFor(action: string) {
  return (
    ACTION_STYLE.find((entry) => entry.test.test(action)) ?? {
      icon: Settings,
      tone: "text-muted-foreground",
    }
  );
}

export type ActivityEntry = {
  id: string;
  action: string;
  /** The audit line's own sentence, written when the thing happened. */
  summary: string;
  createdAt: Date;
  actorName: string | null;
};

/**
 * What the company did, newest first, as one thread.
 *
 * The sentence is the one written into the audit log at the moment of the act,
 * not rebuilt from the action code here — a feed that re-words history can
 * say something different from what was recorded.
 */
export function ActivityFeed({
  entries,
  title,
  description,
  href,
  locale,
  className,
}: {
  entries: ActivityEntry[];
  title: string;
  description?: string;
  href?: string;
  locale: Locale;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col rounded-xl border bg-card shadow-soft", className)}>
      <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {href ? (
          <Link href={href} className="focus-ring shrink-0 rounded-md text-xs font-medium text-brand hover:underline">
            {t(locale, "View all")}
          </Link>
        ) : null}
      </header>

      {entries.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t(locale, "No activity yet.")}</p>
      ) : (
        <ol className="max-h-[360px] overflow-y-auto px-5 py-2">
          {entries.map((entry, index) => {
            const { icon: Icon, tone } = styleFor(entry.action);
            const isLast = index === entries.length - 1;
            return (
              <li key={entry.id} className="flex gap-3">
                {/* A continuous rail, so the feed reads as one thread of events
                    rather than a stack of unrelated rows. */}
                <div className="flex flex-col items-center">
                  <span className="mt-2 flex size-7 shrink-0 items-center justify-center rounded-full border bg-card">
                    <Icon className={cn("size-3.5", tone)} />
                  </span>
                  {!isLast ? <span className="my-1 w-px flex-1 bg-border" /> : null}
                </div>
                <div className={cn("min-w-0 flex-1", isLast ? "py-2" : "py-2 pb-3")}>
                  <p className="text-sm leading-snug">{entry.summary}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {`${entry.actorName ?? t(locale, "System")} · ${formatRelative(entry.createdAt)}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
