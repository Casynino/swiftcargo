import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldCheck, TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { controlRoom } from "@/lib/control";
import { t } from "@/lib/i18n";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "Control room" };

const TONE = {
  bad: {
    icon: "bg-destructive/10 text-destructive",
    age: "font-semibold text-destructive",
  },
  warn: {
    icon: "bg-warning/10 text-warning",
    age: "text-warning",
  },
  good: {
    icon: "bg-success/10 text-success",
    age: "text-muted-foreground",
  },
} as const;

/**
 * Everything quietly going wrong, worst first.
 *
 * ONE LIST, AND IT DECIDES NOTHING. Every line opens the screen that owns the
 * fix, with its guard and its evidence attached. Every check is listed whether
 * or not it found anything, so a green line is a check that ran and came back
 * clean rather than a check nobody thought of.
 */
export default async function ControlRoom() {
  await primeLocale();
  const user = await requirePermission("record.review");
  const [locale, lines] = await Promise.all([localeOf(user.id), controlRoom()]);

  const bad = lines.filter((l) => l.tone === "bad").length;
  const warn = lines.filter((l) => l.tone === "warn").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t(locale, "Control room")}
        description={t(
          locale,
          "Every place the company can quietly go wrong, and how long it has been wrong."
        )}
      />

      {bad + warn === 0 ? (
        <p className="rounded-xl border border-success/40 bg-success/[0.05] px-3 py-2.5 text-sm font-medium text-success">
          <ShieldCheck className="mr-1.5 inline size-4" />
          {t(
            locale,
            "Nothing wrong. Every tin is counted, every queue is moving, and nothing is in dispute."
          )}
        </p>
      ) : (
        <p
          className={cn(
            "text-[11px] font-semibold uppercase tracking-wide",
            bad > 0 ? "text-destructive" : "text-warning"
          )}
        >
          {bad > 0
            ? `${bad} ${t(locale, bad === 1 ? "thing needs a decision now" : "things need a decision now")}`
            : t(locale, "Nothing urgent — these are waiting on somebody")}
        </p>
      )}

      <div className="space-y-1.5">
        {lines.map((l) => {
          const tone = TONE[l.tone];
          const clear = l.tone === "good";
          return (
            <Link
              key={l.key}
              href={l.href}
              className={cn(
                "focus-ring group flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-brand/40 hover:bg-accent/40",
                clear && "opacity-80"
              )}
            >
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", tone.icon)}>
                {clear ? <CheckCircle2 className="size-4" /> : <TriangleAlert className="size-4" />}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold">{t(locale, l.label)}</span>
                  <span className="tnum text-sm text-muted-foreground">{l.count}</span>
                  {/* The age, where there is one. A clear line has no oldest
                      item, and inventing a zero there would read as "dealt with
                      today". */}
                  {clear ? (
                    <span className="text-[11px] text-success">{t(locale, "nothing wrong")}</span>
                  ) : l.oldestDays !== null ? (
                    <span className={cn("text-[11px]", tone.age)}>
                      {l.oldestDays === 0
                        ? t(locale, "since today")
                        : `${t(locale, "oldest")} ${l.oldestDays}${t(locale, "d")}`}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  {t(locale, l.detail)}
                </span>
              </span>

              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
