import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * What a screen looks like before its figures arrive.
 *
 * Shaped like the page that is coming — header, then tiles, a table or a
 * record — so nothing jumps when it lands. No number is ever drawn here: a
 * placeholder that looked like a balance would be read as one.
 */
function Bar({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-secondary", className)} />;
}

function Header({ back = false }: { back?: boolean }) {
  return (
    <div className="space-y-3">
      {back ? <Bar className="hidden h-4 w-28 lg:block" /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Bar className="h-7 w-48 sm:w-64" />
          <Bar className="h-4 w-64 max-w-full sm:w-96" />
        </div>
        <Bar className="h-10 w-32" />
      </div>
    </div>
  );
}

function Tiles({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-xl border bg-card p-4">
          <Bar className="h-3 w-20" />
          <Bar className="h-6 w-28 max-w-full" />
        </div>
      ))}
    </div>
  );
}

function Rows({ count = 8 }: { count?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-3 border-b p-3">
        <Bar className="h-9 w-full max-w-xs" />
        <Bar className="ml-auto hidden h-9 w-24 sm:block" />
      </div>
      <div className="divide-y">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Bar className="h-4 w-24 shrink-0" />
            <Bar className="h-4 flex-1" />
            <Bar className="hidden h-4 w-20 md:block" />
            <Bar className="hidden h-4 w-16 lg:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageSkeleton({
  variant = "list",
}: {
  variant?: "list" | "desk" | "record";
}) {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">{t(null, "Loading…")}</span>
      <Header back={variant === "record"} />
      {variant === "desk" ? (
        <>
          <Tiles />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Bar className="h-64 rounded-xl lg:col-span-2" />
            <Bar className="h-64 rounded-xl" />
          </div>
        </>
      ) : null}
      {variant === "list" ? <Rows /> : null}
      {variant === "record" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="grid grid-cols-2 gap-4 rounded-xl border bg-card p-5 sm:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="space-y-2">
                  <Bar className="h-3 w-16" />
                  <Bar className="h-4 w-24 max-w-full" />
                </div>
              ))}
            </div>
            <Rows count={4} />
          </div>
          <Bar className="h-72 rounded-xl" />
        </div>
      ) : null}
    </div>
  );
}
