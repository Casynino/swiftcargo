import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { CustomerForm } from "@/components/app/customer-form";
import { PageHeader } from "@/components/app/page-header";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Edit customer" };

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("customer.manage");
  const { id } = await params;

  const customer = await prisma.customer.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      code: true,
      fullName: true,
      businessName: true,
      phone: true,
      altPhone: true,
      email: true,
      address: true,
      city: true,
      taxId: true,
      notes: true,
    },
  });
  if (!customer) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={`Edit ${customer.fullName}`}
        description={`${customer.code}. The shipping mark stays as it is — boxes already in Guangzhou carry it.`}
        back={{ href: `/app/customers/${customer.id}`, label: customer.fullName }}
      />
      <CustomerForm customer={customer} />
    </div>
  );
}
