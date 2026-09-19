import type { Metadata } from "next";
import { ScanLine } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { ScanLookup } from "@/components/app/scan-lookup";
import { requirePermission } from "@/lib/session";

import { primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "Scan" };

export default async function ScanPage() {
  await primeLocale();
  await requirePermission("cargo.scan");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title={T("Scan")}
        description={T("Scan a label or a pickup note, or type the reference. It opens the consignment.")}
      />
      <Card className="p-6">
        {/* /8 is not a step Tailwind emits, so the tile drew nothing. */}
        <span className="grid size-12 place-items-center rounded-xl bg-brand/10 text-brand">
          <ScanLine className="size-6" />
        </span>
        <div className="mt-6">
          <ScanLookup />
        </div>
      </Card>
    </div>
  );
}
