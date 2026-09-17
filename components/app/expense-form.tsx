"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ChevronDown, Paperclip, Plus, Zap } from "lucide-react";

import { useEscape } from "@/components/app/use-escape";
import { recordExpense, type ActionState } from "@/lib/actions/expenses";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

export function ExpenseForm({
  containers,
  types,
  accounts = [],
}: {
  containers: { id: string; label: string }[];
  types: { id: string; name: string }[];
  accounts?: { id: string; label: string }[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    recordExpense,
    {}
  );
  const [open, setOpen] = useState(false);
  /* Office, special and executive costs are the business's own and have no
     container; only a container cost asks which sailing. */
  const [scope, setScope] = useState<"CONTAINER" | "OFFICE" | "SPECIAL" | "EXECUTIVE">("OFFICE");
  useEscape(open, () => setOpen(false));

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Record a cost
      </Button>
    );
  }

  return (
    /* Over the page, like Record Payment — the header it is opened from has no
       room for a form, and the list underneath is what the desk goes back to. */
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/70 p-4 text-left backdrop-blur-sm sm:p-8">
      <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 cursor-default" />
    <Card role="dialog" aria-modal="true" aria-label="Record a cost" className="relative w-full max-w-2xl p-6">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-destructive">Record a cost</p>
      <form action={action} className="space-y-4">
        <input type="hidden" name="scope" value={scope} />
        <div className="flex flex-wrap gap-2">
          {([
            ["OFFICE", "Office"],
            ["CONTAINER", "Container cost"],
            ["SPECIAL", "Special"],
            ["EXECUTIVE", "Executive"],
          ] as const).map(([value, text]) => (
            <button
              key={value}
              type="button"
              onClick={() => setScope(value)}
              className={
                scope === value
                  ? "rounded-full border border-brand bg-brand px-3 py-1 text-sm text-brand-foreground"
                  : "rounded-full border bg-card px-3 py-1 text-sm hover:bg-secondary"
              }
            >
              {text}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {scope === "CONTAINER" ? (
          <div className="space-y-2">
            <Label htmlFor="containerId">Container</Label>
            <NativeSelect id="containerId" name="containerId" required defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {containers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="expenseTypeId">What kind of cost?</Label>
            <NativeSelect id="expenseTypeId" name="expenseTypeId" defaultValue="">
              <option value="">Uncategorised</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" name="amount" type="number" step="0.01" min={0} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <NativeSelect id="currency" name="currency" defaultValue="USD">
              <option value="USD">USD</option>
              <option value="TZS">TZS</option>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vendorName">Paid to</Label>
            <Input id="vendorName" name="vendorName" placeholder="Shipping line, clearing agent…" />
          </div>
          {/* WHICH ACCOUNT THE MONEY LEFT. Without it the cost is real and the
              balances cannot account for it, so the tin reads richer than it is. */}
          <div className="space-y-2">
            <Label htmlFor="accountId">Paid from</Label>
            <NativeSelect id="accountId" name="accountId" defaultValue="">
              <option value="">Nobody said yet</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expenseDate">Date</Label>
            <Input id="expenseDate" name="expenseDate" type="date" min="2000-01-01" max="2099-12-31" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="referenceNumber">Their reference</Label>
            <Input id="referenceNumber" name="referenceNumber" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">What was it for</Label>
          <Textarea id="description" name="description" rows={2} />
        </div>

        <FormMessage error={state.error} ok={state.ok} />
        <div className="flex gap-2">
          <SubmitButton>Record</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
    </div>
  );
}

export type UsualCost = { label: string; expenseTypeId: string | null };

/**
 * PAYING SOMETHING OUT OF AN ACCOUNT, FROM THE ACCOUNT ITSELF.
 *
 * The tin pays for the same handful of things every week, so the usual ones
 * are one tap: the tap fills what it was for and its kind together, which also
 * stops one cost being filed under three kinds by three people. The receipt is
 * a field in plain view — the moment a cost is recorded is the moment the paper
 * is in somebody's hand, and a month later it is in nobody's.
 *
 * Office cost unless a container is named; naming one is what makes it that
 * sailing's cost, and nothing else does.
 */
export function RecordCostPanel({
  usual,
  types,
  accounts,
  containers,
  defaultAccountId,
  defaultCurrency = "TZS",
}: {
  usual: UsualCost[];
  types: { id: string; name: string }[];
  accounts: { id: string; label: string }[];
  containers: { id: string; label: string }[];
  defaultAccountId?: string;
  defaultCurrency?: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    recordExpense,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState("");
  const [typeId, setTypeId] = useState("");
  const [containerId, setContainerId] = useState("");
  const [more, setMore] = useState(false);

  /* Costs come in runs — three receipts off one port trip — so a recorded one
     clears the form for the next rather than leaving its figures to be sent
     twice. */
  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    setDescription("");
    setTypeId("");
    setContainerId("");
  }, [state]);

  const pick = (item: UsualCost) => {
    setDescription(item.label);
    setTypeId(item.expenseTypeId ?? "");
    amountRef.current?.focus();
  };

  return (
    <div>
      {usual.length > 0 ? (
        <div className="border-b bg-muted/30 px-5 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <Zap className="size-3.5" />
            The usual
          </p>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {usual.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => pick(item)}
                className={
                  description === item.label
                    ? "shrink-0 whitespace-nowrap rounded-full border border-brand bg-brand px-3 py-1 text-xs font-medium text-brand-foreground"
                    : "shrink-0 whitespace-nowrap rounded-full border bg-card px-3 py-1 text-xs font-medium hover:bg-secondary"
                }
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <form ref={formRef} action={action} className="p-5">
        <input
          type="hidden"
          name="scope"
          value={containerId ? "CONTAINER" : "OFFICE"}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="cost-description" className="text-xs">
              What was it for
            </Label>
            <Input
              id="cost-description"
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Fuel, a repair, printer ink…"
              required
            />
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="cost-type" className="text-xs">
              Category
            </Label>
            <NativeSelect
              id="cost-type"
              name="expenseTypeId"
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
            >
              <option value="">Uncategorised</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="cost-amount" className="text-xs">
              Amount
            </Label>
            <div className="flex gap-2">
              <Input
                id="cost-amount"
                ref={amountRef}
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                className="min-w-0"
                required
              />
              <NativeSelect
                name="currency"
                aria-label="Currency"
                defaultValue={defaultCurrency}
                className="w-[5.5rem] shrink-0"
              >
                <option value="TZS">TZS</option>
                <option value="USD">USD</option>
              </NativeSelect>
            </div>
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="cost-account" className="text-xs">
              Paid from
            </Label>
            <NativeSelect
              id="cost-account"
              name="accountId"
              defaultValue={defaultAccountId ?? ""}
            >
              <option value="">Not paid yet</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="cost-vendor" className="text-xs">
              Paid to
            </Label>
            <Input
              id="cost-vendor"
              name="vendorName"
              placeholder="Who received it — a person, a company, a till"
            />
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="cost-receipt" className="flex items-center gap-1.5 text-xs">
              <Paperclip className="size-3.5" />
              Receipt or photo
            </Label>
            <Input
              id="cost-receipt"
              name="receipt"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              className="file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={() => setMore((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronDown
                className={`size-3.5 transition-transform ${more ? "rotate-180" : ""}`}
              />
              {more ? "Fewer details" : "Which container, what date"}
            </button>
          </div>

          {/* Hidden, not unmounted: a container picked and then folded away is
              still the container the cost is for. */}
          <div className={more ? "min-w-0 space-y-1.5" : "hidden"}>
            <Label htmlFor="cost-container" className="text-xs">
              Against a container
            </Label>
            <NativeSelect
              id="cost-container"
              name="containerId"
              value={containerId}
              onChange={(e) => setContainerId(e.target.value)}
            >
              <option value="">Not one container</option>
              {containers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className={more ? "min-w-0 space-y-1.5" : "hidden"}>
            <Label htmlFor="cost-date" className="text-xs">
              Date
            </Label>
            <Input
              id="cost-date"
              name="expenseDate"
              type="date"
              min="2000-01-01"
              max="2099-12-31"
            />
            <p className="text-[11px] text-muted-foreground">
              Leave it blank and it is dated today. Only set it for a receipt
              found later.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <FormMessage error={state.error} ok={state.ok} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
          <SubmitButton size="sm" pendingLabel="Recording…">
            Record cost
          </SubmitButton>
          <p className="text-xs text-muted-foreground">
            Leave the account blank and it is recorded as still to pay.
          </p>
        </div>
      </form>
    </div>
  );
}
