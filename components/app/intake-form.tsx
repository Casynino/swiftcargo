"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Plus, Trash2, UserPlus } from "lucide-react";

import { receiveNewCargo, type ActionState } from "@/lib/actions/cargo";
import {
  customerByPhone,
  registerCustomerAtCounter,
} from "@/lib/actions/customers";
import { CustomerPicker } from "@/components/app/customer-picker";
import { PhotoCapture } from "@/components/app/photo-capture";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { distinctMark } from "@/lib/customer-name";

const PACKAGE_TYPES = [
  ["CARTON", "Carton 纸箱"],
  ["BALE", "Bale 包"],
  ["BAG", "Bag 袋"],
  ["PALLET", "Pallet 托盘"],
  ["CRATE", "Crate 木箱"],
  ["DRUM", "Drum 桶"],
  ["PIECE", "Piece 件"],
  ["OTHER", "Other 其他"],
] as const;

type Line = {
  key: number;
  /** True once the clerk has typed a volume of their own. */
  cbmByHand: boolean;
  /** The carbon page this row was written on. One per kind of goods. */
  receiptNo: string;
  description: string;
  descriptionZh: string;
  cargoType: string;
  packageType: string;
  quantity: string;
  pieces: string;
  cbm: string;
  length: string;
  width: string;
  height: string;
  weightKg: string;
  netWeightKg: string;
  modelNo: string;
};

type KnownCustomer = {
  id: string;
  code: string;
  fullName: string;
  businessName: string | null;
  phone: string;
  shippingMark: string | null;
  _count: { cargoSent: number };
};

const blank = (key: number, receiptNo = ""): Line => ({
  key,
  cbmByHand: false,
  receiptNo,
  description: "",
  descriptionZh: "",
  cargoType: "",
  packageType: "CARTON",
  quantity: "1",
  pieces: "",
  cbm: "",
  length: "",
  width: "",
  height: "",
  weightKg: "",
  netWeightKg: "",
  modelNo: "",
});

/**
 * THE RECEIVING COUNTER.
 *
 * Laid out to match the paper book the warehouse already fills in, in the same
 * order: who it is for, who delivered it, then the item rows, then the photos.
 * A clerk who knows the book knows this screen.
 *
 * The running CBM total is the reason the maths lives in the browser as well as
 * on the server: the clerk is standing over the boxes with a tape measure and
 * needs the number before they commit, not after. The server recomputes it from
 * the same formula on save, and the server's answer is the one that is stored —
 * this is a preview, never the source.
 */
export function IntakeForm({
  cargoTypes,
  nextReceiptNo,
  suppliers = [],
}: {
  /** The number after the last one written in the book. A suggestion, not a rule. */
  nextReceiptNo?: string;
  /**
   * The categories the rate book prices. The clerk picks one; what it costs is
   * Finance's business and deliberately does not appear on this screen.
   */
  cargoTypes: string[];
  /**
   * The factories already known to us, to be picked from rather than retyped.
   * A name not on the list is still accepted — the counter should not have to
   * go and register a factory before it can take in its boxes.
   */
  suppliers?: string[];
}) {
  const router = useRouter();
  /* The browser argues first about a forward date; the server is what actually
     refuses one. Computed on the client because the clerk's own day is the day
     they mean, and a server rendering from another timezone would stop them
     entering this morning's deliveries. */
  const receivedLabel = `Today · ${new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
  const [state, action] = useActionState<ActionState, FormData>(
    receiveNewCargo,
    {},
  );

  const [newCustomer, setNewCustomer] = useState(false);
  const [phone, setPhone] = useState("");
  const [known, setKnown] = useState<KnownCustomer | null>(null);
  const [picked, setPicked] = useState<KnownCustomer | null>(null);
  /*
    THE MARK AND THE NOTE NUMBER ARE SHOWN, NOT GUESSED AT.

    Both fields used to sit empty behind a grey hint, and a clerk could not tell
    whether the words in them were something the system already knew or
    something they still had to type. Picking a customer now fills in the mark
    that is on their account — visible, and editable if this shipment carries a
    different one — and the note number arrives one past the last one used.
  */
  const [mark, setMark] = useState("");
  const [newName, setNewName] = useState("");
  const [markByHand, setMarkByHand] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  /* Debounced, because this fires on every keystroke of a phone number and the
     answer only matters once there is a whole number to answer about. */
  useEffect(() => {
    if (!newCustomer) return;
    const timer = setTimeout(() => {
      customerByPhone(phone)
        .then(setKnown)
        .catch(() => setKnown(null));
    }, 350);
    return () => clearTimeout(timer);
  }, [phone, newCustomer]);
  const [unit, setUnit] = useState<"CM" | "M">("CM");
  const [lines, setLines] = useState<Line[]>([blank(1, nextReceiptNo ?? "")]);
  const [nextKey, setNextKey] = useState(2);

  /*
    THE BOOK RUNS ON, ROW BY ROW.

    Each kind of goods is written on its own numbered page, so a second item is
    the next page — not the same one again. Counted off the highest number
    already on the form rather than off the row count, because a clerk who
    corrects the first number to the pad actually in their hand expects the rest
    to follow it.
  */
  const afterLastNote = () => {
    let highest = 0;
    let width = nextReceiptNo?.length ?? 7;
    for (const line of lines) {
      const n = Number(line.receiptNo);
      if (Number.isFinite(n) && n > highest) {
        highest = n;
        width = line.receiptNo.trim().length;
      }
    }
    if (!highest) return "";
    return String(highest + 1).padStart(width, "0");
  };

  useEffect(() => {
    if (state.id) router.push(`/app/cargo/${state.id}`);
  }, [state.id, router]);

  const totals = useMemo(() => {
    let cbm = 0;
    let packages = 0;
    let pieces = 0;
    for (const line of lines) {
      packages += Number(line.quantity) || 0;
      pieces += Number(line.pieces) || 0;
      cbm += Number(line.cbm) || 0;
    }
    return { cbm, packages, pieces };
  }, [lines]);

  /**
   * The tape measure, offered rather than imposed.
   *
   * Volume is a field the clerk types, because that is what the paper book
   * asks for and half the loads are not box-shaped. When they do measure three
   * sides, this fills the volume in for them — and they can still type over it,
   * which is the whole point of it being a field.
   */
  /*
    What one package of a typed volume measures, as a cube.
    Rounded to whole centimetres — nobody measures a carton to a millimetre,
    and a suggestion carrying four decimal places pretends to be a measurement.
  */
  const cubeSide = (line: Line) => {
    const total = Number(line.cbm);
    const count = Number(line.quantity) || 1;
    if (!total || total <= 0) return null;
    const each = total / count;
    const metres = Math.cbrt(each);
    if (!Number.isFinite(metres) || metres <= 0) return null;
    return unit === "CM" ? String(Math.round(metres * 100)) : metres.toFixed(2);
  };

  const update = (key: number, field: keyof Line, value: string) =>
    setLines((rows) =>
      rows.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, [field]: value } as Line;

        /* Typing in the volume box claims it. From then on the three sides are
           a note of how the goods were measured, not an instruction to
           recalculate — a clerk who wrote 12 from the tape does not want it
           replaced the moment they correct a package count. Clearing the box
           hands the arithmetic back. */
        if (field === "cbm") {
          next.cbmByHand = value.trim() !== "";
          return next;
        }

        if (
          !next.cbmByHand &&
          (field === "length" ||
            field === "width" ||
            field === "height" ||
            field === "quantity")
        ) {
          const l = Number(next.length);
          const w = Number(next.width);
          const h = Number(next.height);
          const q = Number(next.quantity) || 0;
          if (l && w && h && q) {
            const raw = l * w * h * q;
            next.cbm = (unit === "CM" ? raw / 1_000_000 : raw).toFixed(4);
          }
        }
        return next;
      }),
    );

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="unit" value={unit} />

      {/* ---------------------------------------------------------- Customer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who is it for?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {newCustomer ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="newCustomerPhone">Phone 电话</Label>
                  <Input
                    id="newCustomerPhone"
                    name="newCustomerPhone"
                    required
                    inputMode="tel"
                    placeholder="0767 852 126"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    The number is the customer. Names get written down
                    differently every time; a number does not.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newCustomerName">
                    Name / shipping mark 客户名称 · 唛头
                  </Label>
                  <Input
                    id="newCustomerName"
                    name="newCustomerName"
                    required
                    placeholder="As written on the boxes"
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      /* The mark follows the name until somebody types their
                         own — most customers are marked with their own name and
                         retyping it is work the desk should not be doing. */
                      if (!markByHand) setMark(e.target.value.toUpperCase());
                    }}
                  />
                </div>
              </div>

              {/*
                WHOSE NUMBER IS THIS?

                Checked as it is typed, before anything is saved. A trader
                called "Mama Zainab" at the counter and "Zainab Ally" on the
                invoice is one customer with one history — and the way that
                stops being true is a clerk in a hurry creating the second one.
              */}
              {/*
                SAVING THE PERSON, WITHOUT SAVING A CONSIGNMENT.

                A customer used to come into existence only as a side effect of
                confirming a whole delivery, so somebody registering over the
                phone could not be written down until their boxes turned up. The
                number and the name are all it takes; the rest of this form is
                about goods that may not be here yet.
              */}
              {!known && newName.trim() && phone.trim() ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      setSaveError(null);
                      const result = await registerCustomerAtCounter({
                        fullName: newName,
                        phone,
                        shippingMark: mark,
                      });
                      setSaving(false);
                      if ("error" in result && result.error) {
                        setSaveError(result.error);
                        return;
                      }
                      if ("customer" in result && result.customer) {
                        setPicked({
                          ...result.customer,
                          _count: { cargoSent: 0 },
                        });
                        setMark(result.customer.shippingMark ?? "");
                        setSaved(result.ok ?? "Saved.");
                        setNewCustomer(false);
                      }
                    }}
                  >
                    <UserPlus />
                    {saving ? "Saving…" : "Save this customer"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Adds them to the book now. You can carry on and receive
                    their cargo, or come back to it later.
                  </span>
                </div>
              ) : null}

              {saveError ? (
                <p className="text-sm text-destructive">{saveError}</p>
              ) : null}

              {known ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-marine/40 bg-marine/[0.07] p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      This number is already {known.fullName}
                      {known.businessName ? ` · ${known.businessName}` : ""}
                    </p>
                    <p className="tnum text-xs text-muted-foreground">
                      {known.code}
                      {distinctMark(known.fullName, known.shippingMark)
                        ? ` · ${known.shippingMark}`
                        : ""} · {known._count.cargoSent} consignment
                      {known._count.cargoSent === 1 ? "" : "s"} with us
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setPicked(known);
                      setMark(known.shippingMark ?? "");
                      setNewCustomer(false);
                    }}
                  >
                    <Check />
                    Use {known.fullName.split(" ")[0]}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              {saved ? (
                <p className="rounded-md border border-success/30 bg-success/[0.08] px-3 py-2 text-sm">
                  {saved} Their cargo goes on this consignment.
                </p>
              ) : null}
              <CustomerPicker
                name="customerId"
                label="Customer 客户名称"
                hint="Search by name, phone, code or shipping mark."
                initial={picked ?? undefined}
                onPick={(customer) => {
                  setMark(customer?.shippingMark ?? "");
                  if (!customer) setSaved(null);
                }}
              />
            </>
          )}

          {/*
            THE NAME IS THE MARK.

            Asking for both put the same words in two boxes: the mark written on
            the boxes in Guangzhou is the customer's own name nine times out of
            ten, and the tenth is a trading name they gave the supplier — which
            is then their name as far as this warehouse is concerned. One field,
            carried through as both.
          */}
          <input type="hidden" name="shippingMark" value={mark} />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setNewCustomer((v) => !v)}
          >
            <UserPlus />
            {newCustomer ? "Pick an existing customer" : "New customer"}
          </Button>

          {/*
            WHO BROUGHT IT, AND WHEN IT CAME IN.

            The date is the moment the record is saved — never typed.

            The paper book asks both after the customer, and this follows it.
            All three are optional and none of them holds up a driver at the
            door: a walk-in with a taxi full of boxes has no factory and no
            reference, and a delivery being taken in as it happens is today.

            The supplier is typed or picked from the factories already known —
            a name not on the list is accepted and registered, the same trade
            the customer above makes, because the counter should not have to go
            and register a factory before it can take in its boxes.
          */}
          <div className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="supplierName">
                Supplier 供应商{" "}
                <span className="font-normal text-muted-foreground">
                  optional
                </span>
              </Label>
              <Input
                id="supplierName"
                name="supplierName"
                list="known-suppliers"
                maxLength={120}
                autoComplete="off"
                placeholder="Who delivered the boxes"
              />
              <datalist id="known-suppliers">
                {suppliers.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierRef">
                Supplier ref{" "}
                <span className="font-normal text-muted-foreground">
                  optional
                </span>
              </Label>
              <Input
                id="supplierRef"
                name="supplierRef"
                maxLength={60}
                placeholder="Their own delivery number"
              />
              <p className="text-xs text-muted-foreground">
                What the factory calls this delivery. It is how a customer
                chasing their supplier is matched to a consignment.
              </p>
            </div>
            <div className="space-y-2">
              {/* Not asked: the counter records the moment it saves, so the
                  date is always the day the boxes were taken in. */}
              <p className="text-sm font-medium">Received on 收货日期</p>
              <p suppressHydrationWarning className="flex h-10 items-center rounded-md border border-dashed bg-secondary/40 px-3 text-sm">
                {receivedLabel}
              </p>
              <p className="text-xs text-muted-foreground">
                Set automatically when you confirm receiving.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* -------------------------------------------------------------- Items */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">What did they bring?</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              One row per kind of goods, as on the packing list — each with the
              number of the page it was written on.
              {nextReceiptNo
                ? " The numbers run on from the last one recorded; change the first to the pad in your hand and the rest follow."
                : ""}
            </p>
          </div>
          <div className="w-36 space-y-1.5">
            <Label htmlFor="unit-select" className="text-xs">
              Measured in
            </Label>
            <NativeSelect
              id="unit-select"
              value={unit}
              onChange={(e) => {
                const next = e.target.value as "CM" | "M";
                setUnit(next);
                /* A volume worked out from three sides was worked out in the
                   old unit. Left alone it would stay on screen, be sent as if
                   typed, and the line would be stored as hand-entered at a
                   figure a million times off. Typed volumes are the clerk's
                   and stay as they are. */
                setLines((rows) =>
                  rows.map((row) => {
                    if (row.cbmByHand) return row;
                    const l = Number(row.length);
                    const w = Number(row.width);
                    const h = Number(row.height);
                    const q = Number(row.quantity) || 0;
                    if (!(l && w && h && q)) return row;
                    const raw = l * w * h * q;
                    return {
                      ...row,
                      cbm: (next === "CM" ? raw / 1_000_000 : raw).toFixed(4),
                    };
                  }),
                );
              }}
              className="h-9"
            >
              <option value="CM">Centimetres</option>
              <option value="M">Metres</option>
            </NativeSelect>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {lines.map((line, index) => {
            const cbm = Number(line.cbm) || null;
            return (
              <div
                key={line.key}
                className="rounded-lg border bg-surface-2/50 p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-medium">Item {index + 1}</p>
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`n-${line.key}`}
                        className="text-xs text-muted-foreground"
                      >
                        Receipt book no.
                      </Label>
                      <Input
                        id={`n-${line.key}`}
                        name="itemReceiptNo"
                        inputMode="numeric"
                        placeholder="0002989"
                        className="tnum h-8 w-28"
                        value={line.receiptNo}
                        onChange={(e) =>
                          update(line.key, "receiptNo", e.target.value)
                        }
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {cbm !== null ? (
                      <span className="tnum text-sm font-semibold text-marine">
                        {cbm.toFixed(3)} CBM
                      </span>
                    ) : null}
                    {lines.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove item ${index + 1}`}
                        onClick={() =>
                          setLines((rows) =>
                            rows.filter((r) => r.key !== line.key),
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`d-${line.key}`}>
                      Description (English)
                    </Label>
                    <Input
                      id={`d-${line.key}`}
                      name="itemDescription"
                      value={line.description}
                      onChange={(e) =>
                        update(line.key, "description", e.target.value)
                      }
                      placeholder="Cigarette paper"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`z-${line.key}`}>描述 (中文)</Label>
                    <Input
                      id={`z-${line.key}`}
                      name="itemDescriptionZh"
                      value={line.descriptionZh}
                      onChange={(e) =>
                        update(line.key, "descriptionZh", e.target.value)
                      }
                      placeholder="卷烟纸"
                    />
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  <Label htmlFor={`c-${line.key}`}>Cargo type 货物类别</Label>
                  <NativeSelect
                    id={`c-${line.key}`}
                    name="itemCargoType"
                    required
                    value={line.cargoType}
                    onChange={(e) =>
                      update(line.key, "cargoType", e.target.value)
                    }
                  >
                    <option value="" disabled>
                      Choose the category…
                    </option>
                    {cargoTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </NativeSelect>
                  <p className="text-xs text-muted-foreground">
                    Pick what the goods actually are. It decides how the office
                    charges for this line, so a wrong category is a wrong bill.
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor={`t-${line.key}`}>Package type</Label>
                    <NativeSelect
                      id={`t-${line.key}`}
                      name="itemPackageType"
                      value={line.packageType}
                      onChange={(e) =>
                        update(line.key, "packageType", e.target.value)
                      }
                    >
                      {PACKAGE_TYPES.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`q-${line.key}`}>Packages 包裹</Label>
                    <Input
                      id={`q-${line.key}`}
                      name="itemQuantity"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={line.quantity}
                      onChange={(e) =>
                        update(line.key, "quantity", e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`p-${line.key}`}>Pieces 件数</Label>
                    <Input
                      id={`p-${line.key}`}
                      name="itemPieces"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={line.pieces}
                      onChange={(e) =>
                        update(line.key, "pieces", e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`w-${line.key}`}>
                      Gross weight kg 毛重{" "}
                      <span className="font-normal text-muted-foreground">
                        optional
                      </span>
                    </Label>
                    <Input
                      id={`w-${line.key}`}
                      name="itemWeightKg"
                      type="number"
                      step="0.01"
                      min={0}
                      inputMode="decimal"
                      value={line.weightKg}
                      onChange={(e) =>
                        update(line.key, "weightKg", e.target.value)
                      }
                    />
                  </div>
                </div>

                {/* The customs columns of the packing list. All optional. No
                    price here: the category decides what a line is charged,
                    and the floor is never asked for money. */}
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`mo-${line.key}`}>
                      Model no. 型号{" "}
                      <span className="font-normal text-muted-foreground">optional</span>
                    </Label>
                    <Input
                      id={`mo-${line.key}`}
                      name="itemModelNo"
                      value={line.modelNo}
                      onChange={(e) => update(line.key, "modelNo", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`nw-${line.key}`}>
                      Net weight kg 净重{" "}
                      <span className="font-normal text-muted-foreground">optional</span>
                    </Label>
                    <Input
                      id={`nw-${line.key}`}
                      name="itemNetWeightKg"
                      type="number"
                      step="0.01"
                      min={0}
                      inputMode="decimal"
                      value={line.netWeightKg}
                      onChange={(e) => update(line.key, "netWeightKg", e.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor={`cbm-${line.key}`}>Volume CBM 体积</Label>
                    <Input
                      id={`cbm-${line.key}`}
                      name="itemCbm"
                      type="number"
                      step="0.0001"
                      min={0}
                      inputMode="decimal"
                      required
                      className="tnum font-medium"
                      value={line.cbm}
                      onChange={(e) => update(line.key, "cbm", e.target.value)}
                      placeholder="0.150"
                    />
                  </div>
                  {(["length", "width", "height"] as const).map((dim) => (
                    <div key={dim} className="space-y-1.5">
                      <Label
                        htmlFor={`${dim}-${line.key}`}
                        className="text-muted-foreground"
                      >
                        <span className="capitalize">{dim}</span> (
                        {unit === "CM" ? "cm" : "m"})
                      </Label>
                      <Input
                        id={`${dim}-${line.key}`}
                        name={`item${dim[0].toUpperCase()}${dim.slice(1)}`}
                        type="number"
                        step="0.01"
                        min={0}
                        inputMode="decimal"
                        value={line[dim]}
                        onChange={(e) => update(line.key, dim, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
                {/*
                  THE ARITHMETIC, BOTH WAYS.

                  A clerk who types 1 CBM over twelve cartons is told what one
                  carton of that size measures — and can put those three numbers
                  in the boxes with one press. It is a cube, and says so: real
                  cartons are not cubes, and the figure is offered as a sanity
                  check on a volume somebody wrote on a note, not as a
                  measurement anybody took.
                */}
                {line.cbmByHand && cubeSide(line) ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {line.cbm} CBM over {line.quantity || 1} package
                    {Number(line.quantity) === 1 ? "" : "s"} is about{" "}
                    <span className="tnum font-medium text-foreground">
                      {cubeSide(line)} × {cubeSide(line)} × {cubeSide(line)}{" "}
                      {unit === "CM" ? "cm" : "m"}
                    </span>{" "}
                    each.{" "}
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => {
                        const side = cubeSide(line);
                        if (!side) return;
                        setLines((rows) =>
                          rows.map((row) =>
                            row.key === line.key
                              ? {
                                  ...row,
                                  length: side,
                                  width: side,
                                  height: side,
                                }
                              : row,
                          ),
                        );
                      }}
                    >
                      Put that in the boxes
                    </button>
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {line.cbmByHand
                      ? "Volume typed in. Clear the box to have it worked out from the three sides again."
                      : Number(line.length) &&
                          Number(line.width) &&
                          Number(line.height)
                        ? `Worked out from ${line.length} × ${line.width} × ${line.height} ${unit === "CM" ? "cm" : "m"} × ${line.quantity || 0}.`
                        : "Write the volume straight in, as on the note — or measure the three sides and it works it out for you."}
                  </p>
                )}
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setLines((rows) => [...rows, blank(nextKey, afterLastNote())]);
              setNextKey((n) => n + 1);
            }}
          >
            <Plus />
            Add another item
          </Button>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------- Photos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Photos <span className="text-destructive">*</span>
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            At least one. It is what the customer sees when they track their
            cargo, and the only record of how the boxes looked on arrival.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <PhotoCapture />
          <p className="text-xs text-muted-foreground">
            Take them now, while the boxes are in front of you. The shipping
            mark and anything damaged are the two that matter later.
          </p>

          {/*
            WHERE IT WAS PUT DOWN.

            The one fact about a consignment the building knows and the database
            cannot work out. Between receiving and loading somebody has to walk
            to it, and "row C, bay 4" is the difference between that walk and a
            search of the whole floor. Optional, because a driver at the door
            waiting on a shelf number is the worse trade.
          */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="location">
                Location 位置{" "}
                <span className="font-normal text-muted-foreground">
                  optional
                </span>
              </Label>
              <Input
                id="location"
                name="location"
                maxLength={60}
                placeholder="Row C, bay 4"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={2} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* -------------------------------------------------------------- Total */}
      {/*
        THE WAY OUT, ALWAYS IN VIEW.

        The form is long — a customer, a mark, a note number, then a row per
        kind of goods — and the button that saves it sat at the very bottom. A
        clerk halfway down had no way to tell whether what they had typed was
        going anywhere. It follows them now, carrying the running totals, so the
        answer to "where do I save this" is never further than the bottom of the
        screen.
      */}
      <Card className="sticky bottom-4 z-20 border-marine/30 bg-marine/[0.05] shadow-raised backdrop-blur">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div className="flex flex-wrap gap-8">
            {[
              ["For", picked?.fullName ?? (newCustomer ? newName || "—" : "—")],
              [
                "Items",
                String(lines.filter((l) => l.description.trim()).length),
              ],
              ["Packages", String(totals.packages)],
              ["Pieces", totals.pieces > 0 ? String(totals.pieces) : "—"],
              ["Total CBM", `${totals.cbm.toFixed(3)} CBM`],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <p
                  className={cn(
                    "mt-1 text-xl font-semibold",
                    label === "For" ? "max-w-[12rem] truncate" : "tnum",
                    label === "Total CBM" && "text-marine",
                  )}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>

          <SubmitButton size="lg" pendingLabel="Receiving…">
            <Check />
            Confirm receiving
          </SubmitButton>
        </CardContent>
      </Card>

      <FormMessage error={state.error} ok={state.ok} />

      <p className="text-xs text-muted-foreground">
        Confirming generates the cargo reference and the delivery note, and
        tells the customer their goods have arrived in Guangzhou. It does not
        tell them anything has shipped.
      </p>
    </form>
  );
}
