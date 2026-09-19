import Link from "next/link";
import type { Metadata } from "next";
import * as Icons from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { canAny, type Permission } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

import { primeLocale, T } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "Admin" };

const AREAS: {
  href: string;
  title: string;
  body: string;
  icon: string;
  permissions: Permission[];
}[] = [
  {
    href: "/app/admin/users",
    title: "Staff",
    body: "Create accounts, move people between departments, and switch access off the moment someone leaves.",
    icon: "UserCog",
    permissions: ["user.manage"],
  },
  {
    href: "/app/finance/rates",
    title: "Rate book",
    body: "Published rates and agreed customer terms.",
    icon: "Tags",
    permissions: ["rate.manage"],
  },
  {
    href: "/app/admin/warehouses",
    title: "Warehouses",
    body: "Both ends, and the address customers forward to their supplier.",
    icon: "Building2",
    permissions: ["warehouse.manage"],
  },
  {
    href: "/app/admin/content",
    title: "Website content",
    body: "Sailings published on the public schedule.",
    icon: "Globe",
    permissions: ["content.manage"],
  },
  {
    href: "/app/admin/markets",
    title: "China markets",
    body: "What customers are told about the markets we buy from.",
    icon: "Store",
    permissions: ["content.manage"],
  },
  {
    href: "/app/admin/deleted",
    title: "Deleted records",
    body: "Everything taken back or deleted, who did it, and why.",
    icon: "Trash2",
    permissions: ["records.viewDeleted"],
  },
  {
    href: "/app/admin/settings",
    title: "Company settings",
    body: "Collection accounts, offices, contacts, VAT, storage and invoice terms.",
    icon: "Settings",
    permissions: ["settings.manage"],
  },
  {
    href: "/app/admin/audit",
    title: "Audit log",
    body: "Every privileged action. Append-only.",
    icon: "ScrollText",
    permissions: ["audit.view"],
  },
];

export default async function AdminPage() {
  await primeLocale();
  const user = await requirePermission("report.view");
  const areas = AREAS.filter((area) => canAny(user.role, area.permissions));

  return (
    <div className="space-y-6">
      <PageHeader
        title={T("Administration")}
        description={T("System configuration. Every change here is audited, including yours.")}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((area) => {
          const Icon = (
            Icons as unknown as Record<
              string,
              React.ComponentType<{ className?: string }>
            >
          )[area.icon];
          return (
            <Link key={area.href} href={area.href} className="focus-ring rounded-xl">
              <Card className="h-full p-6 transition-all hover:-translate-y-0.5 hover:shadow-raised">
                {/* /8 is not a step Tailwind emits, so the tile drew nothing. */}
                <span className="grid size-10 place-items-center rounded-lg bg-brand/10 text-brand">
                  {Icon ? <Icon className="size-4.5" /> : null}
                </span>
                <p className="mt-4 font-semibold"><Tx>{area.title}</Tx></p>
                <p className="mt-1.5 text-sm text-muted-foreground">{area.body}</p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
