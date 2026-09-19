import type { Metadata } from "next";

import { WarehouseForm } from "@/components/app/admin-forms";
import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

import { primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "Warehouses" };

export default async function WarehousesPage() {
  await primeLocale();
  await requirePermission("warehouse.manage");

  const warehouses = await prisma.warehouse.findMany({
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={T("Warehouses")}
        description={T("Where cargo is received at each end. The Guangzhou address is what customers forward to their supplier.")}
      />
      <SectionTabs />

      <WarehouseForm />

      <div className="space-y-4">
        {warehouses.map((warehouse) => (
          <div key={warehouse.id} className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="font-medium">{warehouse.name}</p>
              <Badge tone={warehouse.kind === "CHINA" ? "progress" : "good"}>
                {warehouse.code}
              </Badge>
            </div>
            <WarehouseForm
              warehouse={{
                id: warehouse.id,
                code: warehouse.code,
                name: warehouse.name,
                kind: warehouse.kind,
                addressLocal: warehouse.addressLocal,
                addressEnglish: warehouse.addressEnglish,
                city: warehouse.city,
                country: warehouse.country,
                phone: warehouse.phone,
                contactName: warehouse.contactName,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
