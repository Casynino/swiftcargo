"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, Pencil } from "lucide-react";

import { updateCargoDetails, type ActionState } from "@/lib/actions/cargo";
import { CustomerPicker } from "@/components/app/customer-picker";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { distinctMark } from "@/lib/customer-name";
import { t, type Locale } from "@/lib/i18n";

import { Tx } from "@/components/app/tx";
type Party = {
  id: string;
  code: string;
  fullName: string;
  businessName: string | null;
  phone: string;
  shippingMark: string | null;
};

export type EditableCargoDetails = {
  id: string;
  reference: string;
  receiver: Party;
  sender: Party;
  shippingMark: string | null;
  description: string;
  commodity: string | null;
  paperReceiptNo: string | null;
  notes: string | null;
  /** Undefined when this desk may not read internal notes — the field is then not sent. */
  internalNotes: string | null | undefined;
  lines: { id: string; reference: string; description: string | null; cargoType: string | null }[];
};

/**
 * Correcting who a consignment belongs to and what it is.
 *
 * A dialog on the cargo record rather than a page of its own: the person fixing
 * a misspelt mark is looking at the record that shows it. Measurements are not
 * here — each warehouse corrects its own figures where they are shown — and a
 * reason is asked for, because "the receiver was X and is now Y" is the change
 * somebody will be asked to explain.
 *
 * The receiver control closes when a bill or a pickup note already names the
 * receiver. The server refuses the same change for the same reason; this only
 * says so before the clerk has typed anything.
 */
export function CargoDetailsEdit({
  cargo,
  cargoTypes,
  receiverLocked,
  locale,
}: {
  cargo: EditableCargoDetails;
  cargoTypes: string[];
  receiverLocked: string | null;
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil />
        {t(locale, "Edit details")}
      </Button>
      {open ? (
        <Dialog
          cargo={cargo}
          cargoTypes={cargoTypes}
          receiverLocked={receiverLocked}
          locale={locale}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function Dialog({
  cargo,
  cargoTypes,
  receiverLocked,
  locale,
  onClose,
}: {
  cargo: EditableCargoDetails;
  cargoTypes: string[];
  receiverLocked: string | null;
  locale: Locale;
  onClose: () => void;
}) {
  const [state, action] = useActionState<ActionState, FormData>(updateCargoDetails, {});
  const [mark, setMark] = useState(cargo.shippingMark ?? "");
  const [senderName, setSenderName] = useState(cargo.sender.fullName);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  /* Portalled to the body so the card's overflow does not clip it. */
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        action={action}
        className="max-h-[92vh] w-full max-w-2xl space-y-5 overflow-y-auto rounded-xl border bg-card p-5 text-left shadow-lg"
      >
        <input type="hidden" name="cargoId" value={cargo.id} />
        <div>
          <h2 className="text-base font-semibold">
            {t(locale, "Edit details")} · <span className="tnum">{cargo.reference}</span>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              locale,
              "Every change is kept with the old value, your name and your reason. Weights, counts and volumes are corrected where each warehouse's figures are shown."
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {receiverLocked ? (
            <div className="space-y-2">
              <Label>{t(locale, "Receiver")}</Label>
              <input type="hidden" name="receiverId" value={cargo.receiver.id} />
              <div className="rounded-md border bg-secondary/40 p-3">
                <p className="truncate text-sm font-medium">{cargo.receiver.fullName}</p>
                <p className="tnum text-xs text-muted-foreground">{cargo.receiver.code}</p>
              </div>
              <p className="flex gap-1.5 text-xs text-muted-foreground">
                <Lock className="mt-0.5 size-3 shrink-0" />
                {t(locale, receiverLocked)}
              </p>
            </div>
          ) : (
            <CustomerPicker
              name="receiverId"
              label={t(locale, "Receiver")}
              required
              initial={cargo.receiver}
              hint={t(locale, "Invoiced, and the only person who may collect.")}
            />
          )}
          <CustomerPicker
            name="senderId"
            label={t(locale, "Sender")}
            required
            initial={cargo.sender}
            hint={t(locale, "Who dealt with the supplier in China.")}
            onPick={(picked) => {
              if (picked) {
                setMark(picked.shippingMark ?? "");
                setSenderName(picked.fullName);
              }
            }}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="details-mark">{t(locale, "Shipping mark")}</Label>
            <Input
              id="details-mark"
              name="shippingMark"
              value={mark}
              onChange={(e) => setMark(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {distinctMark(senderName, mark)
                ? t(locale, "Differs from the sender's name, so it is shown beside it.")
                : t(locale, "What is written on the boxes. Blank means the sender's own mark.")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="details-receipt">{t(locale, "Receipt number")}</Label>
            <Input
              id="details-receipt"
              name="paperReceiptNo"
              className="tnum"
              defaultValue={cargo.paperReceiptNo ?? ""}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="details-description">{t(locale, "Description")}</Label>
          <Input
            id="details-description"
            name="description"
            required
            minLength={2}
            defaultValue={cargo.description}
          />
        </div>

        {cargo.lines.length > 0 ? (
          <div className="space-y-2">
            <Label>{t(locale, "Cargo type")}</Label>
            <div className="divide-y rounded-md border">
              {cargo.lines.map((line) => {
                /* A line keeps a category the rate book has since retired until
                   somebody picks a live one. */
                const options =
                  line.cargoType && !cargoTypes.includes(line.cargoType)
                    ? [line.cargoType, ...cargoTypes]
                    : cargoTypes;
                return (
                  <div key={line.id} className="grid grid-cols-1 items-center gap-2 p-3 sm:grid-cols-2">
                    <div className="min-w-0">
                      <p className="tnum text-sm font-medium">{line.reference}</p>
                      {line.description ? (
                        <p className="truncate text-xs text-muted-foreground"><Tx>{line.description}</Tx></p>
                      ) : null}
                    </div>
                    <NativeSelect
                      name={`lineType:${line.id}`}
                      defaultValue={line.cargoType ?? ""}
                      aria-label={`${t(locale, "Cargo type")} ${line.reference}`}
                    >
                      <option value="" disabled>
                        {t(locale, "Choose the category…")}
                      </option>
                      {options.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="details-commodity">{t(locale, "Goods type")}</Label>
            <NativeSelect
              id="details-commodity"
              name="commodity"
              defaultValue={cargo.commodity ?? ""}
            >
              <option value="">{t(locale, "Not recorded")}</option>
              {(cargo.commodity && !cargoTypes.includes(cargo.commodity)
                ? [cargo.commodity, ...cargoTypes]
                : cargoTypes
              ).map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        {cargo.lines.length > 0 ? (
          <input type="hidden" name="commodity" value={cargo.commodity ?? ""} />
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="details-notes">{t(locale, "Notes")}</Label>
            <Textarea
              id="details-notes"
              name="notes"
              rows={2}
              defaultValue={cargo.notes ?? ""}
            />
          </div>
          {cargo.internalNotes !== undefined ? (
            <div className="space-y-2">
              <Label htmlFor="details-internal">{t(locale, "Internal notes")}</Label>
              <Textarea
                id="details-internal"
                name="internalNotes"
                rows={2}
                defaultValue={cargo.internalNotes ?? ""}
              />
              <p className="text-xs text-muted-foreground">
                {t(locale, "Never shown to the customer.")}
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="details-reason">{t(locale, "Why")}</Label>
          <Input
            id="details-reason"
            name="reason"
            maxLength={300}
            placeholder={t(locale, "e.g. Mark misread at the counter")}
          />
        </div>

        <FormMessage error={state.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t(locale, "Cancel")}
          </Button>
          <SubmitButton>{t(locale, "Save changes")}</SubmitButton>
        </div>
      </form>
    </div>,
    document.body
  );
}
