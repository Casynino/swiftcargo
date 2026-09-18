import type { Metadata } from "next";

import { CopyField } from "@/components/app/copy-field";
import { SupplierAddressCard } from "@/components/app/supplier-address-card";
import { supplierAddress } from "@/lib/supplier-address";
import { Field } from "@/components/app/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";

export const metadata: Metadata = { title: "My details" };

export default async function PortalProfilePage() {
  const user = await requireCustomer();

  const [customer, company] = await Promise.all([
    prisma.customer.findUnique({ where: { id: user.customerId } }),
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
  ]);

  const forSupplier = await supplierAddress(customer?.shippingMark ?? null);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My details</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ring us if any of this needs changing.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your shipping mark</CardTitle>
        </CardHeader>
        <CardContent>
          <CopyField
            value={customer?.shippingMark ?? "—"}
            label="shipping mark"
          />
          <p className="mt-3 text-sm text-muted-foreground">
            Your supplier writes this on every box. It never changes, even if
            your name does — boxes already in Guangzhou carry the old mark in
            marker pen.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where to send your goods</CardTitle>
        </CardHeader>
        <CardContent>
          {forSupplier ? (
            <SupplierAddressCard {...forSupplier} />
          ) : (
            <CopyField value={company?.chinaAddress ?? "Ask us for the address"} label="warehouse address" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-5 sm:grid-cols-2">
            <Field label="Name" value={customer?.fullName} />
            <Field label="Business" value={customer?.businessName} />
            <Field label="Customer code" value={customer?.code} mono />
            <Field label="Phone" value={customer?.phone} mono />
            <Field label="Email" value={customer?.email} />
            <Field label="City" value={customer?.city} />
            <Field label="TIN / VRN" value={customer?.taxId} mono />
            <Field
              label="Member since"
              value={formatDate(customer?.createdAt)}
            />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
