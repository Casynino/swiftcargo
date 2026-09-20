"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";

import {
  deletePackage,
  overrideCbm,
  upsertPackage,
  type ActionState,
} from "@/lib/actions/cargo";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useT } from "@/components/app/locale-provider";
import { Tx } from "@/components/app/tx";
type Line = {
  id: string;
  reference: string;
  packageType: string;
  cargoType: string | null;
  description: string | null;
  quantity: number;
  unit: string;
  length: string | null;
  width: string | null;
  height: string | null;
  weightKg: string | null;
  cbm: string;
  cbmOverridden: boolean;
  balerNumber: string | null;
  /** The carbon page this kind of goods was written on. */
  paperReceiptNo: string | null;
  /* The packing list's customs columns. */
  descriptionZh?: string | null;
  pieces?: number | null;
  netWeightKg?: string | null;
  modelNo?: string | null;
  declaredUnitValue?: string | null;
};

const TYPES = [
  "CARTON",
  "BALE",
  "BAG",
  "PALLET",
  "CRATE",
  "DRUM",
  "PIECE",
  "OTHER",
];

/**
 * The measured lines — what is in this consignment, and what it measures.
 *
 * The cargo type on each line is what the office charges against, and it is
 * edited here rather than on a finance screen: the person who can see the goods
 * is the only one who knows whether a crate holds tiles or a machine. The price
 * that follows from it does not appear on this component at all.
 */
export function PackageEditor({
  cargoId,
  lines,
  canEdit,
  canOverride,
  cargoTypes,
  checkedInAtDar = false,
}: {
  cargoId: string;
  lines: Line[];
  canEdit: boolean;
  canOverride: boolean;
  cargoTypes: string[];
  /** Once Dar has booked the boxes in, a line is never removed and its quantity only goes up. */
  checkedInAtDar?: boolean;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(upsertPackage, {});
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(
    deletePackage,
    {}
  );
  const [editing, setEditing] = useState<Line | null>(null);
  const [adding, setAdding] = useState(false);

  /* The form holds the line as it was when Edit was pressed, and React resets
     an action's form to those defaults once the save lands. Left open it shows
     the old measurements under "Measurements saved." — and saving again would
     write them back. */
  useEffect(() => {
    if (state.ok) {
      setEditing(null);
      setAdding(false);
    }
  }, [state]);

  const total = lines.reduce((sum, l) => sum + Number(l.cbm), 0);
  const showForm = adding || editing !== null;

  return (
    <div className="space-y-4">
      {lines.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tx("Line")}</TableHead>
              <TableHead>{tx("Cargo type")}</TableHead>
              <TableHead>{tx("Packed as")}</TableHead>
              <TableHead className="text-right">{tx("Qty")}</TableHead>
              <TableHead className="text-right">L × W × H</TableHead>
              <TableHead className="text-right">CBM</TableHead>
              <TableHead className="text-right">{tx("Weight")}</TableHead>
              {canEdit ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>
                  <span className="tnum text-sm font-medium">{line.reference}</span>
                  {line.description ? (
                    <span className="block text-xs text-muted-foreground">
                      <Tx>{line.description}</Tx>
                    </span>
                  ) : null}
                  {/* The page the customer is holding. Each kind of goods has
                      its own, so it belongs on the line and not on the header. */}
                  {line.paperReceiptNo ? (
                    <span className="tnum block text-xs text-muted-foreground">
                      note {line.paperReceiptNo}
                    </span>
                  ) : null}
                  {line.balerNumber ? (
                    <span className="tnum block text-xs text-muted-foreground">
                      Bale {line.balerNumber}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm">
                  {line.cargoType ?? (
                    <Badge tone="warn">{tx("No category")}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm">{line.packageType}</TableCell>
                <TableCell className="tnum text-right text-sm">
                  {line.quantity}
                </TableCell>
                <TableCell className="tnum text-right text-sm text-muted-foreground">
                  {line.length && line.width && line.height
                    ? `${line.length} × ${line.width} × ${line.height} ${line.unit.toLowerCase()}`
                    : "not measured"}
                </TableCell>
                <TableCell className="tnum text-right text-sm font-medium">
                  {Number(line.cbm).toFixed(3)}
                  {line.cbmOverridden ? (
                    <Badge tone="warn" className="ml-2">
                      set by hand
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="tnum text-right text-sm text-muted-foreground">
                  {line.weightKg ? `${Number(line.weightKg).toFixed(2)} kg` : "—"}
                </TableCell>
                {canEdit ? (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${line.reference}`}
                        onClick={() => {
                          setEditing(line);
                          setAdding(false);
                        }}
                      >
                        <Pencil />
                      </Button>
                      {checkedInAtDar ? null : (
                        <form action={deleteAction}>
                          <input type="hidden" name="packageId" value={line.id} />
                          <SubmitButton
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${line.reference}`}
                          >
                            <Trash2 />
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            <TableRow className="bg-secondary/40 font-medium">
              <TableCell colSpan={5} className="text-sm">
                {tx("Total")}
              </TableCell>
              <TableCell className="tnum text-right text-sm">
                {total.toFixed(3)} CBM
              </TableCell>
              <TableCell colSpan={canEdit ? 2 : 1} />
            </TableRow>
          </TableBody>
        </Table>
      ) : (
        <p className="px-1 text-sm text-muted-foreground">
          {tx("Nothing measured yet.")}
        </p>
      )}

      <FormMessage error={state.error ?? deleteState.error} ok={state.ok} />

      {canEdit && !showForm ? (
        <Button variant="outline" onClick={() => setAdding(true)}>
          <Plus />
          {tx("Add a line")}
        </Button>
      ) : null}

      {canEdit && showForm ? (
        <form
          action={action}
          key={editing?.id ?? "new"}
          className="space-y-4 rounded-lg border p-4"
        >
          <input type="hidden" name="cargoId" value={cargoId} />
          {editing ? (
            <input type="hidden" name="packageId" value={editing.id} />
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="cargoType">{tx("Cargo type")}</Label>
            <NativeSelect
              id="cargoType"
              name="cargoType"
              defaultValue={editing?.cargoType ?? ""}
              required
            >
              <option value="" disabled>
                {tx("Choose the category…")}
              </option>
              {cargoTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="packageType">{tx("Packed as")}</Label>
              <NativeSelect
                id="packageType"
                name="packageType"
                defaultValue={editing?.packageType ?? "CARTON"}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0) + t.slice(1).toLowerCase()}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">{tx("Quantity")}</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                min={checkedInAtDar && editing ? editing.quantity : 1}
                inputMode="numeric"
                defaultValue={editing?.quantity ?? 1}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">{tx("Measured in")}</Label>
              <NativeSelect
                id="unit"
                name="unit"
                defaultValue={editing?.unit ?? "CM"}
              >
                <option value="CM">{tx("Centimetres")}</option>
                <option value="M">{tx("Metres")}</option>
              </NativeSelect>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            {(["length", "width", "height"] as const).map((dim) => (
              <div key={dim} className="space-y-2">
                <Label htmlFor={dim} className="capitalize">
                  {dim}
                </Label>
                <Input
                  id={dim}
                  name={dim}
                  type="number"
                  step="0.01"
                  min={0}
                  inputMode="decimal"
                  defaultValue={editing?.[dim] ?? ""}
                />
              </div>
            ))}
            <div className="space-y-2">
              <Label htmlFor="weightKg">{tx("Gross weight (kg)")}</Label>
              <Input
                id="weightKg"
                name="weightKg"
                type="number"
                step="0.01"
                min={0}
                inputMode="decimal"
                defaultValue={editing?.weightKg ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cbm">{tx("Volume (CBM)")}</Label>
              <Input
                id="cbm"
                name="cbm"
                type="number"
                step="0.0001"
                min={0}
                inputMode="decimal"
                className="tnum"
                defaultValue={editing?.cbm ?? ""}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="description">{tx("Description")}</Label>
              <Input
                id="description"
                name="description"
                defaultValue={editing?.description ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="balerNumber">{tx("Bale number")}</Label>
              <Input
                id="balerNumber"
                name="balerNumber"
                placeholder={tx("Written on the outside in China")}
                defaultValue={editing?.balerNumber ?? ""}
              />
            </div>
          </div>

          {/* What the packing list prints beside the measurements, for the
              shipping line and the clearing agent. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="descriptionZh">Chinese name 中文品名</Label>
              <Input id="descriptionZh" name="descriptionZh" defaultValue={editing?.descriptionZh ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="modelNo">{tx("Model no.")}</Label>
              <Input id="modelNo" name="modelNo" defaultValue={editing?.modelNo ?? ""} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pieces">{tx("Pieces / sets")}</Label>
              <Input id="pieces" name="pieces" type="number" min={0} inputMode="numeric" defaultValue={editing?.pieces ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="netWeightKg">{tx("Net weight (kg)")}</Label>
              <Input id="netWeightKg" name="netWeightKg" type="number" step="0.001" min={0} inputMode="decimal" defaultValue={editing?.netWeightKg ?? ""} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="line-reason">{tx("Why (optional)")}</Label>
            <Input
              id="line-reason"
              name="reason"
              maxLength={300}
              placeholder={checkedInAtDar ? "Re-measured in Dar" : "Re-measured at the bale"}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {tx("Leave the volume blank to have it calculated from the three sides and the quantity. A volume typed in is used as it stands and is marked on the line as entered by hand. Either way the change is recorded against you with the old figure beside the new one.")}
          </p>

          <div className="flex gap-2">
            <SubmitButton>{editing ? "Save line" : "Add line"}</SubmitButton>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setAdding(false);
              }}
            >
              {tx("Cancel")}
            </Button>
          </div>
        </form>
      ) : null}

      {canOverride && lines.length > 0 ? (
        <OverrideCbm lines={lines} />
      ) : null}
    </div>
  );
}

function OverrideCbm({ lines }: { lines: Line[] }) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(overrideCbm, {});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <div className="space-y-2">
        <FormMessage ok={state.ok} />
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <TriangleAlert />
          {tx("Override a calculated CBM")}
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/50 p-4">
      <p className="text-sm font-medium">{tx("Replace a calculated volume")}</p>
      <p className="text-xs text-muted-foreground">
        {tx("The measurement being replaced is kept, along with your name and reason. Use this only when the calculation genuinely does not describe the cargo.")}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="override-packageId">{tx("Line")}</Label>
          <NativeSelect id="override-packageId" name="packageId" required>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.reference} ({Number(l.cbm).toFixed(3)} CBM)
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="override-cbm">{tx("New CBM")}</Label>
          <Input
            id="override-cbm"
            name="cbm"
            type="number"
            step="0.0001"
            min={0}
            required
            inputMode="decimal"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="override-reason">{tx("Reason")}</Label>
          <Input id="override-reason" name="reason" />
        </div>
      </div>
      <FormMessage error={state.error} ok={state.ok} />
      <div className="flex gap-2">
        <SubmitButton variant="destructive">{tx("Record override")}</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {tx("Cancel")}
        </Button>
      </div>
    </form>
  );
}
