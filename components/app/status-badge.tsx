import type { CargoStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { CARGO_STATUS_META } from "@/lib/constants";

import { Tx } from "@/components/app/tx";
export function CargoStatusBadge({ status }: { status: CargoStatus }) {
  const meta = CARGO_STATUS_META[status];
  return <Badge tone={meta.tone}><Tx>{meta.label}</Tx></Badge>;
}
