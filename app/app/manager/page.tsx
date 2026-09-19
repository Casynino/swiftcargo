import type { Metadata } from "next";

import { CommandCentre } from "@/components/app/command-centre";
import { requirePermission } from "@/lib/session";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "Command centre" };

export default async function ManagerHome() {
  await primeLocale();
  const user = await requirePermission("record.review");
  return <CommandCentre user={user} />;
}
