import type { Metadata } from "next";

import { CommandCentre } from "@/components/app/command-centre";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Command centre" };

export default async function ManagerHome() {
  const user = await requirePermission("record.review");
  return <CommandCentre user={user} />;
}
