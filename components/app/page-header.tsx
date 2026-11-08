"use client";

import { RememberTitle } from "@/components/app/nav-trail";
import { SmartBack } from "@/components/app/smart-back";
import { useT } from "@/components/app/locale-provider";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  back,
  actions,
  className,
}: {
  title: string;
  description?: string;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
  className?: string;
}) {
  /* Every page's title and line under it pass through here, so translating
     them once covers every screen that uses the header. */
  const t = useT();
  return (
    <header className={cn("space-y-3", className)}>
      {/* The page walked from, when there is one; `back` is only the parent
          for a reader who arrived from nowhere. */}
      <RememberTitle title={t(title)} />
      {back ? <SmartBack fallbackHref={back.href} fallbackLabel={t(back.label)} /> : null}
      {/* The same navy and gold as the home banner, kept slim: the page's name,
          one line under it, the page's buttons on the right. */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(125deg,#07112a_0%,#0b1d47_48%,#17387a_100%)] px-4 py-4 text-white shadow-raised ring-1 ring-inset ring-white/5 sm:px-6 sm:py-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_92%_140%,rgba(88,140,235,0.4),transparent_55%),radial-gradient(ellipse_at_0%_-40%,rgba(227,179,65,0.2),transparent_50%)]"
        />
        <span aria-hidden className="absolute inset-y-4 left-0 w-[3px] rounded-r-full bg-[#e3b341]" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight sm:text-2xl">{t(title)}</h1>
            {description ? (
              <p className="mt-0.5 max-w-2xl text-xs text-white/70 sm:mt-1 sm:text-sm">
                {t(description)}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>
    </header>
  );
}
