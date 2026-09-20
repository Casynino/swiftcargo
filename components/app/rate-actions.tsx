"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";

import {
  deleteCustomerRate,
  deleteExchangeRate,
  deleteRate,
  updateCustomerRate,
  updateRate,
  type ActionState,
} from "@/lib/actions/finance-config";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

import { useT } from "@/components/app/locale-provider";
type Mode = "idle" | "edit" | "remove";

function Toggles({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const tx = useT();
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant={mode === "edit" ? "secondary" : "ghost"}
        className="h-7 px-2 text-xs"
        onClick={() => setMode(mode === "edit" ? "idle" : "edit")}
      >
        <Pencil className="size-3.5" />
        {tx("Edit")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={mode === "remove" ? "secondary" : "ghost"}
        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
        onClick={() => setMode(mode === "remove" ? "idle" : "remove")}
      >
        <Trash2 className="size-3.5" />
        {tx("Remove")}
      </Button>
    </div>
  );
}

/**
 * A pop-up over the page. Opening a form inside a card stretched every card in
 * its row to the same height; over the page, the grid never moves.
 */
function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const tx = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/70 p-4 backdrop-blur-sm sm:p-10">
      <button type="button" aria-label={tx("Close")} onClick={onClose} className="absolute inset-0 cursor-default" />
      <section role="dialog" aria-modal="true" aria-label={title} className="relative w-full max-w-lg rounded-xl border bg-card text-left shadow-lg">
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="font-semibold">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label={tx("Close")} className="rounded p-1 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}

/** Closes the panel once the server says it worked; the page itself re-renders. */
function useCloseOnOk(state: ActionState, close: () => void) {
  useEffect(() => {
    if (state.ok) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

function RemoveForm({
  id,
  action,
  state,
  warning,
  label,
  onCancel,
}: {
  id: string;
  action: (formData: FormData) => void;
  state: ActionState;
  warning: string;
  label: string;
  onCancel: () => void;
}) {
  const tx = useT();
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">{warning}</p>
      <FormMessage error={state.error} />
      <div className="flex gap-2">
        <SubmitButton size="sm" variant="destructive">
          {label}
        </SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {tx("Keep it")}
        </Button>
      </div>
    </form>
  );
}

export type EditableRate = {
  id: string;
  service: string;
  cargoType: string | null;
  basis: "PER_CBM" | "PER_KG" | "FLAT";
  rate: string;
  minimumCbm: string | null;
  minimumKg: string | null;
  published: boolean;
};

/**
 * EDIT OR REMOVE ONE RATE, ON ITS OWN CARD.
 *
 * Both keep history: an edit closes the row and writes the next one, a removal
 * retires it. Bills already priced never move either way, and both ask why.
 */
export function RateCardActions({ rate, cargoTypes }: { rate: EditableRate; cargoTypes: string[] }) {
  const tx = useT();
  const [mode, setMode] = useState<Mode>("idle");
  const [editState, editAction] = useActionState<ActionState, FormData>(updateRate, {});
  const [removeState, removeAction] = useActionState<ActionState, FormData>(deleteRate, {});
  useCloseOnOk(editState, () => setMode("idle"));
  useCloseOnOk(removeState, () => setMode("idle"));
  const listId = `types-${rate.id}`;

  return (
    <div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <FormMessage ok={editState.ok ?? removeState.ok} />
        <div className="ml-auto">
          <Toggles mode={mode} setMode={setMode} />
        </div>
      </div>

      {mode === "edit" ? (
        <Modal
          title={`Edit ${rate.cargoType ?? "general rate"}`}
          subtitle={`${rate.service} · currently USD ${Number(rate.rate).toFixed(2)}`}
          onClose={() => setMode("idle")}
        >
        <form action={editAction} className="space-y-3">
          <input type="hidden" name="id" value={rate.id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{tx("Kind of goods")}</Label>
              <Input
                name="cargoType"
                list={listId}
                defaultValue={rate.cargoType ?? ""}
                placeholder={tx("Blank = the general rate")}
                className="h-9"
              />
              <datalist id={listId}>
                {cargoTypes.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tx("Charged by")}</Label>
              <NativeSelect name="basis" defaultValue={rate.basis} className="h-9">
                <option value="PER_CBM">{tx("Cubic metre")}</option>
                <option value="PER_KG">{tx("Kilogram")}</option>
                <option value="FLAT">{tx("Flat")}</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tx("Rate (USD)")}</Label>
              <Input name="rate" type="number" step="0.01" min={0} required defaultValue={Number(rate.rate).toFixed(2)} className="tnum h-9" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{tx("Min CBM")}</Label>
                <Input name="minimumCbm" type="number" step="0.001" min={0} defaultValue={rate.minimumCbm ?? ""} className="tnum h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tx("Min kg")}</Label>
                <Input name="minimumKg" type="number" step="0.01" min={0} defaultValue={rate.minimumKg ?? ""} className="tnum h-9" />
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" name="published" defaultChecked={rate.published} className="size-4" />
            {tx("Show on the public rates page")}
          </label>
          <p className="text-[11px] text-muted-foreground">
            {tx("New bills use the new figures. Bills already raised keep the rate they were priced at.")}
          </p>
          <FormMessage error={editState.error} />
          <div className="flex gap-2">
            <SubmitButton size="sm">{tx("Save changes")}</SubmitButton>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>
              {tx("Cancel")}
            </Button>
          </div>
        </form>
        </Modal>
      ) : null}

      {mode === "remove" ? (
        <Modal
          title={`Remove ${rate.cargoType ?? "general rate"}`}
          subtitle={`${rate.service} · USD ${Number(rate.rate).toFixed(2)}`}
          onClose={() => setMode("idle")}
        >
        <RemoveForm
          id={rate.id}
          action={removeAction}
          state={removeState}
          label={tx("Remove rate")}
          onCancel={() => setMode("idle")}
          warning={
            rate.cargoType
              ? `${rate.cargoType} will be charged at the general rate on new bills. Bills already raised keep this rate.`
              : "This is the general rate. Goods with no rate of their own will reach Finance unpriced until another is published."
          }
        />
        </Modal>
      ) : null}
    </div>
  );
}

export function CustomerRateActions({
  id,
  customer,
  rate,
  basis,
}: {
  id: string;
  customer: string;
  rate: string;
  basis: "PER_CBM" | "PER_KG" | "FLAT";
}) {
  const tx = useT();
  const [mode, setMode] = useState<Mode>("idle");
  const [editState, editAction] = useActionState<ActionState, FormData>(updateCustomerRate, {});
  const [removeState, removeAction] = useActionState<ActionState, FormData>(deleteCustomerRate, {});
  useCloseOnOk(editState, () => setMode("idle"));
  useCloseOnOk(removeState, () => setMode("idle"));

  return (
    <div className="w-full">
      <div className="flex justify-end">
        <Toggles mode={mode} setMode={setMode} />
      </div>
      {mode === "edit" ? (
        <Modal title={`Edit ${customer}'s rate`} onClose={() => setMode("idle")}>
        <form action={editAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={id} />
          <div className="space-y-1.5">
            <Label className="text-xs">{tx("Rate (USD)")}</Label>
            <Input name="rate" type="number" step="0.01" min={0} required defaultValue={Number(rate).toFixed(2)} className="tnum h-9 w-28" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tx("Charged by")}</Label>
            <NativeSelect name="basis" defaultValue={basis} className="h-9 w-36">
              <option value="PER_CBM">{tx("Cubic metre")}</option>
              <option value="PER_KG">{tx("Kilogram")}</option>
              <option value="FLAT">{tx("Flat")}</option>
            </NativeSelect>
          </div>
          <SubmitButton size="sm">{tx("Save")}</SubmitButton>
          <div className="w-full">
            <FormMessage error={editState.error} />
          </div>
        </form>
        </Modal>
      ) : null}
      {mode === "remove" ? (
        <Modal title={`End ${customer}'s rate`} onClose={() => setMode("idle")}>
        <RemoveForm
          id={id}
          action={removeAction}
          state={removeState}
          label={tx("End agreed rate")}
          onCancel={() => setMode("idle")}
          warning={`${customer} will pay the book rate on new bills.`}
        />
        </Modal>
      ) : null}
    </div>
  );
}

/** Withdraw the live exchange rate, when nothing has been issued or paid at it. */
export function ExchangeRateRemove({ id, blockedBy }: { id: string; blockedBy: string | null }) {
  const tx = useT();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(deleteExchangeRate, {});
  useCloseOnOk(state, () => setOpen(false));

  if (blockedBy) {
    return <p className="text-[11px] text-muted-foreground">{blockedBy}</p>;
  }
  return (
    <div>
      {open ? (
        <RemoveForm
          id={id}
          action={action}
          state={state}
          label={tx("Withdraw rate")}
          onCancel={() => setOpen(false)}
          warning="Nothing has been issued or paid at this rate yet. Withdrawing it puts the previous rate back."
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
        >
          <Trash2 className="size-3.5" />
          {tx("Published by mistake? Withdraw it")}
        </button>
      )}
      <FormMessage ok={state.ok} />
    </div>
  );
}
