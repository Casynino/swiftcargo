import type { Metadata } from "next";

import { CustomerForm } from "@/components/app/customer-form";
import { PageHeader } from "@/components/app/page-header";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Register a customer" };

export default async function NewCustomerPage() {
  await requirePermission("customer.manage");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Register a customer"
        description="The phone number is how everybody finds them again, so get that one right."
        back={{ href: "/app/customers", label: "Customers" }}
      />
      <CustomerForm />
    </div>
  );
}
