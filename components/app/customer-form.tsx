"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  createCustomer,
  updateCustomer,
  type ActionState,
} from "@/lib/actions/customers";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { useT } from "@/components/app/locale-provider";
type Customer = {
  id: string;
  fullName: string;
  businessName: string | null;
  phone: string;
  altPhone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  taxId: string | null;
  notes: string | null;
};

export function CustomerForm({ customer }: { customer?: Customer }) {
  const tx = useT();
  const router = useRouter();
  const [state, action] = useActionState<ActionState, FormData>(
    customer ? updateCustomer : createCustomer,
    {}
  );

  /* A newly registered customer goes straight to their own page — the next
     thing anybody does after registering somebody is book their cargo, and
     that button is there. */
  useEffect(() => {
    if (state.customerId) router.push(`/app/customers/${state.customerId}`);
  }, [state.customerId, router]);

  return (
    <Card className="p-6">
      <form action={action} className="space-y-5">
        {customer ? (
          <input type="hidden" name="customerId" value={customer.id} />
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fullName">{tx("Full name")}</Label>
            <Input
              id="fullName"
              name="fullName"
              required
              defaultValue={customer?.fullName}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="businessName">{tx("Business name")}</Label>
            <Input
              id="businessName"
              name="businessName"
              defaultValue={customer?.businessName ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">{tx("Phone")}</Label>
            <Input
              id="phone"
              name="phone"
              required
              placeholder="0767 852 126"
              defaultValue={customer?.phone}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="altPhone">{tx("Second phone")}</Label>
            <Input
              id="altPhone"
              name="altPhone"
              defaultValue={customer?.altPhone ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{tx("Email")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={customer?.email ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="taxId">TIN / VRN</Label>
            <Input id="taxId" name="taxId" defaultValue={customer?.taxId ?? ""} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="address">{tx("Address")}</Label>
            <Input
              id="address"
              name="address"
              defaultValue={customer?.address ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">{tx("City")}</Label>
            <Input
              id="city"
              name="city"
              defaultValue={customer?.city ?? "Dar es Salaam"}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">{tx("Notes")}</Label>
          <Textarea id="notes" name="notes" defaultValue={customer?.notes ?? ""} />
        </div>

        {!customer ? (
          <p className="rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">
            {tx("A shipping mark is generated automatically. It is what the customer gives their supplier, and it never changes afterwards.")}
          </p>
        ) : null}

        <FormMessage error={state.error} ok={state.ok} />

        <SubmitButton>
          {customer ? "Save changes" : "Register customer"}
        </SubmitButton>
      </form>
    </Card>
  );
}
