"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { CustomerPicker } from "@/components/app/customer-picker";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  createSourcingRequest,
  updateSourcingRequest,
  type SourcingActionState,
} from "@/lib/actions/sourcing";
import { t, type Locale } from "@/lib/i18n";

export const SOURCING_PRIORITIES = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
] as const;

export const SOURCING_STATUSES = [
  { value: "NEW", label: "New" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WAITING_CUSTOMER", label: "Waiting for customer" },
  { value: "SUPPLIER_FOUND", label: "Supplier found" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

function Optional({ locale }: { locale: Locale }) {
  return <span className="font-normal text-muted-foreground">{t(locale, "optional")}</span>;
}

export function NewSourcingForm({ markets, locale }: { markets: string[]; locale: Locale }) {
  const [state, action] = useActionState<SourcingActionState, FormData>(
    createSourcingRequest,
    {}
  );
  const [hasCustomer, setHasCustomer] = useState(false);

  return (
    <div className="space-y-4">
      {state.ok && state.id ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.ok}{" "}
          <Link href={`/app/support/sourcing/${state.id}`} className="font-medium underline">
            {t(locale, "Open it")}
          </Link>
        </p>
      ) : null}

      {/* Remounted after each request opens, so the customer chosen for the last
          one is not silently carried into the next. */}
      <form key={state.reference ?? "new"} action={action} className="space-y-4">
        <FormMessage error={state.error} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <CustomerPicker
              name="customerId"
              label={t(locale, "Customer")}
              hint={t(locale, "Not registered yet? Leave this and take a name and number below.")}
              onPick={(customer) => setHasCustomer(Boolean(customer))}
            />
          </div>

          {hasCustomer ? null : (
            <>
              <div className="space-y-2">
                <Label htmlFor="contactName">
                  {t(locale, "Contact name")} <Optional locale={locale} />
                </Label>
                <Input id="contactName" name="contactName" autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">
                  {t(locale, "Contact phone")} <Optional locale={locale} />
                </Label>
                <Input id="contactPhone" name="contactPhone" inputMode="tel" autoComplete="off" />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="product">{t(locale, "Product")}</Label>
            <Input
              id="product"
              name="product"
              placeholder={t(locale, "e.g. LED shop signs, 1.2 m")}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sourcing-priority">{t(locale, "Priority")}</Label>
            <NativeSelect id="sourcing-priority" name="priority" defaultValue="NORMAL">
              {SOURCING_PRIORITIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(locale, option.label)}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity">
              {t(locale, "Quantity")} <Optional locale={locale} />
            </Label>
            <Input id="quantity" name="quantity" placeholder={t(locale, "e.g. 200 pieces")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget">
              {t(locale, "Budget")} <Optional locale={locale} />
            </Label>
            <Input id="budget" name="budget" placeholder={t(locale, "e.g. USD 1,500")} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="market">
              {t(locale, "Market")} <Optional locale={locale} />
            </Label>
            <Input
              id="market"
              name="market"
              list="sourcing-markets"
              placeholder={t(locale, "Where it is likely to be found")}
              autoComplete="off"
            />
            <datalist id="sourcing-markets">
              {markets.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="details">
              {t(locale, "Details")} <Optional locale={locale} />
            </Label>
            <Textarea
              id="details"
              name="details"
              rows={3}
              placeholder={t(locale, "Colours, quality, sizes, any sample photos they sent.")}
            />
          </div>
        </div>

        <SubmitButton pendingLabel={t(locale, "Opening…")}>{t(locale, "Open request")}</SubmitButton>
      </form>
    </div>
  );
}

export function SourcingWorkflow({
  request,
  staff,
  locale,
}: {
  request: {
    id: string;
    status: string;
    priority: string;
    assignedToId: string | null;
    outcome: string | null;
  };
  staff: { id: string; name: string }[];
  locale: Locale;
}) {
  const [state, action] = useActionState<SourcingActionState, FormData>(
    updateSourcingRequest,
    {}
  );
  const [status, setStatus] = useState(request.status);
  const finishing = status === "COMPLETED" || status === "SUPPLIER_FOUND";

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="requestId" value={request.id} />
      <FormMessage error={state.error} ok={state.ok} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="sourcing-status">{t(locale, "Status")}</Label>
          <NativeSelect
            id="sourcing-status"
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {SOURCING_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {t(locale, option.label)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="req-priority">{t(locale, "Priority")}</Label>
          <NativeSelect id="req-priority" name="priority" defaultValue={request.priority}>
            {SOURCING_PRIORITIES.map((option) => (
              <option key={option.value} value={option.value}>
                {t(locale, option.label)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="req-assignee">{t(locale, "Handled by")}</Label>
        <NativeSelect
          id="req-assignee"
          name="assignedToId"
          defaultValue={request.assignedToId ?? ""}
        >
          <option value="">{t(locale, "Unassigned")}</option>
          {staff.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-2">
        <Label htmlFor="outcome">
          {t(locale, "What we found")}{" "}
          {finishing ? (
            <span className="font-normal text-destructive">{t(locale, "required")}</span>
          ) : (
            <Optional locale={locale} />
          )}
        </Label>
        <Textarea
          id="outcome"
          name="outcome"
          rows={4}
          defaultValue={request.outcome ?? ""}
          required={finishing}
          placeholder={t(locale, "Supplier, market stall, unit price, minimum order, lead time.")}
        />
      </div>

      <SubmitButton pendingLabel={t(locale, "Saving…")}>{t(locale, "Save request")}</SubmitButton>
    </form>
  );
}
