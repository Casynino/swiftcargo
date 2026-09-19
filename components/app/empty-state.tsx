import * as Icons from "lucide-react";

import { Tx } from "@/components/app/tx";
export function EmptyState({
  icon = "Inbox",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
    icon
  ];
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-secondary">
        {Icon ? <Icon className="size-5 text-muted-foreground" /> : null}
      </span>
      <p className="mt-4 font-medium"><Tx>{title}</Tx></p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground"><Tx>{description}</Tx></p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
