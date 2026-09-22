import type { Metadata } from "next";

import { CustomerForm } from "@/components/app/customer-form";
import { PageHeader } from "@/components/app/page-header";
import { requirePermission } from "@/lib/session";

import { primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "Register a customer" };

export default async function NewCustomerPage() {
  await primeLocale();
  await requirePermission("customer.create");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={T("Register a customer")}
        description={T("The phone number is how everybody finds them again, so get that one right.")}
        back={{ href: "/app/customers", label: "Customers" }}
      />
      <CustomerForm />
    </div>
  );
}
