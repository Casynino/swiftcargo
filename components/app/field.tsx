import { cn } from "@/lib/utils";

import { Tx } from "@/components/app/tx";
/** A label and its value. Used everywhere two columns of facts are shown. */
export function Field({
  label,
  value,
  className,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Tx>{label}</Tx>
      </dt>
      <dd className={cn("mt-1 text-sm", mono && "tnum font-medium")}>
        {value === null || value === undefined || value === "" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
