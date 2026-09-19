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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t(title)}</h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t(description)}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
