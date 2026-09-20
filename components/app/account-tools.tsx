"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowLeftRight, Calculator } from "lucide-react";

import {
  countTheCash,
  moveMoney,
  setOpeningBalance,
  type ActionState,
} from "@/lib/actions/accounts";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

import { useT } from "@/components/app/locale-provider";
import { Tx } from "@/components/app/tx";
type Choice = {
  id: string;
  label: string;
  currency: string;
  kind: string;
  balance: string;
};

/**
 * MONEY CHANGING SHELVES.
 *
 * Kept beside the tin rather than on the expenses page, because it is not a
 * cost — the business is no poorer for banking its own takings, and a screen
 * that files it under spending makes the month look worse than it was.
 */
export function MoveMoneyCard({
  accounts,
  defaultFrom,
}: {
  accounts: Choice[];
  /** On one account's own page, the money most likely leaves that account. */
  defaultFrom?: string;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(moveMoney, {});
  const first = accounts.find((a) => a.id === defaultFrom) ?? accounts[0];
  const [from, setFrom] = useState(first?.id ?? "");
  const [to, setTo] = useState(
    accounts.find((a) => a.id !== first?.id)?.id ?? ""
  );

  const out = accounts.find((a) => a.id === from);
  const into = accounts.find((a) => a.id === to);
  /* Across currencies there is no arithmetic that turns one into the other, so
     the figure that arrived has to be typed. Same currency, it is derived. */
  const converting = Boolean(out && into && out.currency !== into.currency);

  return (
    <section
      id="move-money"
      className="scroll-mt-24 overflow-hidden rounded-xl border bg-card shadow-soft"
    >
      <header className="border-b px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <ArrowLeftRight className="size-4 text-muted-foreground" />
          {tx("Move money between accounts")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Banking the day&rsquo;s cash, topping up the tin, converting dollars.
          Neither income nor a cost — just money changing shelves.
        </p>
      </header>

      <form action={action} className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fromAccountId">{tx("Out of")}</Label>
            <NativeSelect
              id="fromAccountId"
              name="fromAccountId"
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  <Tx>{a.label}</Tx>
                </option>
              ))}
            </NativeSelect>
            {out ? (
              <p className="tnum text-xs text-muted-foreground">
                Holds {out.balance}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="toAccountId">{tx("Into")}</Label>
            <NativeSelect
              id="toAccountId"
              name="toAccountId"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  <Tx>{a.label}</Tx>
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="amount">
              Amount leaving{" "}
              <span className="text-muted-foreground">
                ({out?.currency ?? ""})
              </span>
            </Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="charge">
              Bank charge{" "}
              <span className="text-muted-foreground">
                ({out?.currency ?? ""}) (optional)
              </span>
            </Label>
            <Input
              id="charge"
              name="charge"
              type="number"
              step="0.01"
              min="0"
              defaultValue="0"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="amountArrived">
            Amount that arrived{" "}
            <span className="text-muted-foreground">
              {converting
                ? `(in ${into?.currency}) — required, the rate is yours`
                : "(blank = the amount above, less the charge)"}
            </span>
          </Label>
          <Input
            id="amountArrived"
            name="amountArrived"
            type="number"
            step="0.01"
            min="0"
            required={converting}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="purpose">{tx("What for (optional)")}</Label>
            <Input
              id="purpose"
              name="purpose"
              placeholder={tx("Banked Friday&rsquo;s takings")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="transferDate">{tx("Date (blank for today)")}</Label>
            <Input id="transferDate" name="transferDate" type="date" />
          </div>
        </div>

        <FormMessage error={state.error} ok={state.ok} />
        <SubmitButton>{tx("Record the move")}</SubmitButton>
      </form>
    </section>
  );
}

/**
 * COUNTING THE TIN.
 *
 * What is physically on the desk, against what the history says should be. The
 * count never writes a balance — see `countTheCash`.
 */
export function CountTheCashCard({ tins }: { tins: Choice[] }) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    countTheCash,
    {}
  );
  const [which, setWhich] = useState(tins[0]?.id ?? "");
  const tin = tins.find((t) => t.id === which);

  return (
    <section
      id="count-the-cash"
      className="scroll-mt-24 overflow-hidden rounded-xl border bg-card shadow-soft"
    >
      <header className="border-b px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Calculator className="size-4 text-muted-foreground" />
          {tx("Count the cash")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {tx("What is physically in the tin, against what the ledger says should be.")}
        </p>
      </header>

      <form action={action} className="space-y-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="accountId">{tx("Which tin")}</Label>
          <NativeSelect
            id="accountId"
            name="accountId"
            required
            value={which}
            onChange={(e) => setWhich(e.target.value)}
          >
            {tins.map((t) => (
              <option key={t.id} value={t.id}>
                <Tx>{t.label}</Tx>
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-2">
          <Label htmlFor="counted">
            Counted{" "}
            <span className="text-muted-foreground">
              ({tin?.currency ?? ""})
            </span>
          </Label>
          <Input
            id="counted"
            name="counted"
            type="number"
            step="0.01"
            min="0"
            required
          />
          {tin ? (
            <p className="tnum text-xs text-muted-foreground">
              The ledger says {tin.balance}.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="note">{tx("Note (optional)")}</Label>
          <Input
            id="note"
            name="note"
            placeholder={tx("Anything that explains a difference")}
          />
        </div>

        <FormMessage error={state.error} ok={state.ok} />
        <SubmitButton>{tx("Record the count")}</SubmitButton>
      </form>
    </section>
  );
}

/**
 * THE ONE TYPED FIGURE ON AN ACCOUNT.
 *
 * Asked for the reason only when it is being changed — the first time, the
 * reason is simply that the account has just been put on the system.
 */
export function OpeningBalanceForm({
  accountId,
  currency,
  current,
  isSet,
}: {
  accountId: string;
  currency: string;
  current: number;
  isSet: boolean;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    setOpeningBalance,
    {}
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <div>
        {state.ok ? <p className="text-xs text-success">{state.ok}</p> : null}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-brand hover:underline"
        >
          {isSet ? "Change" : "Set the opening balance"}
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="accountId" value={accountId} />
      <Input
        name="amount"
        type="number"
        step="0.01"
        defaultValue={isSet ? current : ""}
        placeholder={`What was in it (${currency})`}
        required
      />
      <Input name="on" type="date" aria-label={tx("As of")} />
      {isSet ? (
        <Input name="reason" placeholder={tx("Why it is changing")} />
      ) : null}
      <FormMessage error={state.error} />
      <div className="flex gap-2">
        <SubmitButton size="sm">{tx("Save")}</SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {tx("Cancel")}
        </button>
      </div>
    </form>
  );
}
