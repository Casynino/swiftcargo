import { RememberTitle } from "@/components/app/nav-trail";
import { SmartBack } from "@/components/app/smart-back";
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
  return (
    <header className={cn("space-y-3", className)}>
      {/* The page walked from, when there is one; `back` is only the parent
          for a reader who arrived from nowhere. */}
      <RememberTitle title={title} />
      {back ? <SmartBack fallbackHref={back.href} fallbackLabel={back.label} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
