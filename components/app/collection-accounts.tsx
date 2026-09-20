"use client";

import { useActionState, useState } from "react";
import { Pencil, Plus, RotateCcw, X } from "lucide-react";

import {
  saveCollectionAccount,
  setCollectionAccountActive,
  type ActionState,
} from "@/lib/actions/collection-accounts";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { t, type Locale } from "@/lib/i18n";

export type CollectionAccountRow = {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch: string | null;
  kind: "BANK" | "MOBILE_MONEY";
  currency: string;
  sortOrder: number;
  active: boolean;
  /** Money has moved through it, so its number and holder are fixed. */
  used: boolean;
  /** On the books right now, in the account's own currency. */
  balanceLabel: string;
};

/**
 * The accounts printed on every invoice, edited where the rest of what
 * customers are told is edited.
 *
 * What the customer will read is shown as it is typed, because "NMB BANK" and
 * "NMB" beside the wrong number are the difference between a payment arriving
 * and not.
 */
export function CollectionAccounts({
  accounts,
  locale,
}: {
  accounts: CollectionAccountRow[];
  locale: Locale;
}) {
  const [adding, setAdding] = useState(false);
  const open = accounts.filter((a) => a.active);
  const retired = accounts.filter((a) => !a.active);

  return (
    <section className="rounded-xl border bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{t(locale, "Collection accounts")}</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            {t(
              locale,
              "Printed on every invoice and its PDF, and offered when a payment is recorded. These are the same accounts Finance keeps balances for, so a payment lands on the account the customer was told to use."
            )}
          </p>
        </div>
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors hover:border-brand/40 hover:text-brand"
          >
            <Plus className="size-3.5" />
            {t(locale, "Add an account")}
          </button>
        ) : null}
      </div>

      {adding ? (
        <div className="mt-4 rounded-xl border border-brand/30 bg-brand/5 p-4">
          <AccountForm locale={locale} onDone={() => setAdding(false)} />
        </div>
      ) : null}

      <ul className="mt-4 space-y-3">
        {open.map((account) => (
          <AccountItem key={account.id} account={account} locale={locale} />
        ))}
        {open.length === 0 ? (
          <li className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {t(locale, "No account is open. Invoices are printing with nowhere to pay.")}
          </li>
        ) : null}
      </ul>

      {retired.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            {t(locale, "Retired accounts")} ({retired.length})
          </summary>
          <ul className="mt-3 space-y-3">
            {retired.map((account) => (
              <AccountItem key={account.id} account={account} locale={locale} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function AccountItem({ account, locale }: { account: CollectionAccountRow; locale: Locale }) {
  const [editing, setEditing] = useState(false);
  const [retiring, setRetiring] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(setCollectionAccountActive, {});

  return (
    <li className={`rounded-xl border p-4 ${account.active ? "bg-muted/20" : "bg-muted/40 opacity-80"}`}>
      {editing ? (
        <AccountForm locale={locale} account={account} onDone={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {account.bankName}
                <Badge tone="neutral">
                  {account.kind === "BANK" ? t(locale, "Bank") : t(locale, "Mobile money")}
                </Badge>
                <Badge tone="neutral">{account.currency}</Badge>
                {!account.active ? <Badge tone="warn">{t(locale, "Retired")}</Badge> : null}
              </p>
              <p className="tnum mt-1 font-mono text-sm">{account.accountNumber}</p>
              <p className="text-xs uppercase text-muted-foreground">
                {account.accountName}
                {account.branch ? ` · ${account.branch}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="tnum text-sm font-semibold">{account.balanceLabel}</p>
              <p className="text-xs text-muted-foreground">{t(locale, "on the books")}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="focus-ring inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:text-brand"
            >
              <Pencil className="size-3.5" />
              {t(locale, "Edit")}
            </button>
            {account.active ? (
              !retiring ? (
                <button
                  type="button"
                  onClick={() => setRetiring(true)}
                  className="focus-ring inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3.5" />
                  {t(locale, "Retire")}
                </button>
              ) : null
            ) : (
              <form action={action}>
                <input type="hidden" name="id" value={account.id} />
                <input type="hidden" name="active" value="true" />
                <SubmitButton variant="outline" size="sm" pendingLabel={t(locale, "Reopening…")}>
                  <RotateCcw className="size-3.5" />
                  {t(locale, "Reopen")}
                </SubmitButton>
              </form>
            )}
          </div>

          {retiring ? (
            <form action={action} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <input type="hidden" name="id" value={account.id} />
              <input type="hidden" name="active" value="false" />
              <div className="flex-1 space-y-1">
                <Label htmlFor={`reason-${account.id}`} className="text-xs">
                  {t(locale, "Why is it being retired?")}
                </Label>
                <Input
                  id={`reason-${account.id}`}
                  name="reason"
                  placeholder={t(locale, "Account closed by the bank")}
                  className="h-10"
                />
              </div>
              <div className="flex gap-2">
                <SubmitButton variant="destructive" size="sm" pendingLabel={t(locale, "Retiring…")}>
                  {t(locale, "Retire account")}
                </SubmitButton>
                <button
                  type="button"
                  onClick={() => setRetiring(false)}
                  className="rounded-md border px-3 text-xs text-muted-foreground"
                >
                  {t(locale, "Keep it")}
                </button>
              </div>
            </form>
          ) : null}
          {state.error || state.ok ? (
            <div className="mt-2">
              <FormMessage error={state.error} ok={state.ok} />
            </div>
          ) : null}
        </>
      )}
    </li>
  );
}

function AccountForm({
  account,
  locale,
  onDone,
}: {
  account?: CollectionAccountRow;
  locale: Locale;
  onDone: () => void;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    async (prev: ActionState, formData: FormData) => {
      const result = await saveCollectionAccount(prev, formData);
      if (result.ok && !result.error) onDone();
      return result;
    },
    {}
  );
  const [preview, setPreview] = useState({
    bankName: account?.bankName ?? "",
    accountNumber: account?.accountNumber ?? "",
    accountName: account?.accountName ?? "",
  });
  /* The fields a statement is matched on stay put once money has moved. */
  const fixed = Boolean(account?.used);

  return (
    <form action={action} className="space-y-3">
      {account ? <input type="hidden" name="id" value={account.id} /> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_1fr_1.3fr]">
        <div className="space-y-1">
          <Label htmlFor={`bankName-${account?.id ?? "new"}`} className="text-xs">
            {t(locale, "Label the customer sees")}
          </Label>
          <Input
            id={`bankName-${account?.id ?? "new"}`}
            name="bankName"
            required
            defaultValue={account?.bankName}
            placeholder="NMB BANK"
            onChange={(e) => setPreview((p) => ({ ...p, bankName: e.target.value }))}
            className="h-11"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`accountNumber-${account?.id ?? "new"}`} className="text-xs">
            {t(locale, "Number")}
          </Label>
          <Input
            id={`accountNumber-${account?.id ?? "new"}`}
            name="accountNumber"
            required
            readOnly={fixed}
            defaultValue={account?.accountNumber}
            onChange={(e) => setPreview((p) => ({ ...p, accountNumber: e.target.value }))}
            className="money-input h-11"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`accountName-${account?.id ?? "new"}`} className="text-xs">
            {t(locale, "Account name")}
          </Label>
          <Input
            id={`accountName-${account?.id ?? "new"}`}
            name="accountName"
            required
            readOnly={fixed}
            defaultValue={account?.accountName}
            onChange={(e) => setPreview((p) => ({ ...p, accountName: e.target.value }))}
            className="h-11"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">{t(locale, "Kind")}</Label>
          {fixed ? <input type="hidden" name="kind" value={account!.kind} /> : null}
          <NativeSelect
            name={fixed ? undefined : "kind"}
            disabled={fixed}
            defaultValue={account?.kind ?? "BANK"}
            className="h-11"
          >
            <option value="BANK">{t(locale, "Bank")}</option>
            <option value="MOBILE_MONEY">{t(locale, "Mobile money")}</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t(locale, "Currency")}</Label>
          {fixed ? <input type="hidden" name="currency" value={account!.currency} /> : null}
          <NativeSelect
            name={fixed ? undefined : "currency"}
            disabled={fixed}
            defaultValue={account?.currency ?? "TZS"}
            className="h-11"
          >
            <option value="TZS">TZS</option>
            <option value="USD">USD</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`branch-${account?.id ?? "new"}`} className="text-xs">
            {t(locale, "Branch")}
          </Label>
          <Input id={`branch-${account?.id ?? "new"}`} name="branch" defaultValue={account?.branch ?? ""} className="h-11" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`sortOrder-${account?.id ?? "new"}`} className="text-xs">
            {t(locale, "Order on the invoice")}
          </Label>
          <Input
            id={`sortOrder-${account?.id ?? "new"}`}
            name="sortOrder"
            type="number"
            min={0}
            max={999}
            defaultValue={account?.sortOrder ?? 0}
            className="money-input h-11"
          />
        </div>
      </div>

      {/* What the invoice will print, as it is typed. */}
      <p className="truncate font-mono text-xs text-muted-foreground">
        {preview.bankName || "…"} · {preview.accountNumber || "…"} · {preview.accountName || "…"}
      </p>
      {fixed ? (
        <p className="text-xs text-muted-foreground">
          {t(
            locale,
            "Money has moved through this account, so its number, holder, kind and currency stay as the bank statement has them. A new number is a new account: add it, then retire this one."
          )}
        </p>
      ) : null}

      <FormMessage error={state.error} />
      <div className="flex gap-2">
        <SubmitButton size="sm" pendingLabel={t(locale, "Saving…")}>
          {account ? t(locale, "Save account") : t(locale, "Add account")}
        </SubmitButton>
        <button type="button" onClick={onDone} className="rounded-md border px-3 text-xs text-muted-foreground">
          {t(locale, "Cancel")}
        </button>
      </div>
    </form>
  );
}
