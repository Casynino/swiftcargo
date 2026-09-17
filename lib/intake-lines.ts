import type { PackageType } from "@prisma/client";

/**
 * THE ITEM ROWS OFF THE RECEIVING FORM, AND WHAT IS REFUSED.
 *
 * Its own module rather than a helper inside the action, because a `"use
 * server"` file may export nothing but server actions — and the arithmetic
 * that decides what the Guangzhou counter is allowed to write down is the part
 * most worth being able to test on its own.
 */

export const PACKAGE_TYPES = [
  "CARTON",
  "BALE",
  "BAG",
  "PALLET",
  "CRATE",
  "DRUM",
  "PIECE",
  "OTHER",
] as const;

export type IntakeLine = {
  /** The carbon page this kind of goods was written on. */
  paperReceiptNo: string | null;
  description: string;
  descriptionZh: string | null;
  cargoType: string | null;
  packageType: PackageType;
  quantity: number;
  pieces: number | null;
  /** Typed straight in, the way the paper book records it. */
  cbm: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  weightKg: number | null;
};

/**
 * Read the item rows off the form.
 *
 * Posted as parallel arrays rather than as JSON, so the form still works with
 * JavaScript disabled and a half-typed row cannot corrupt the whole payload.
 * A row with no description is somebody who added a line and changed their
 * mind; it is dropped rather than saved empty.
 *
 * NOTHING BELOW ZERO GETS IN. The browser's `min=0` is a hint to a person, not
 * a rule about a request body, and a form field is a public endpoint whether or
 * not a form renders in front of it. A negative weight or volume is not a small
 * consignment — it is a figure that subtracts from a container total, from a
 * packing list and eventually from a bill, and there is no reading of a minus
 * sign on a tape measure that makes sense of it. Refused by row and by box, so
 * the clerk is told which of eight fields is wrong rather than being coerced to
 * a number nobody typed.
 */
export function readIntakeLines(formData: FormData): {
  lines: IntakeLine[];
  error?: string;
} {
  const get = (name: string) => formData.getAll(name).map(String);

  const descriptions = get("itemDescription");
  const zh = get("itemDescriptionZh");
  const cargoTypes = get("itemCargoType");
  const cbms = get("itemCbm");
  const types = get("itemPackageType");
  const quantities = get("itemQuantity");
  const pieces = get("itemPieces");
  const lengths = get("itemLength");
  const widths = get("itemWidth");
  const heights = get("itemHeight");
  const weights = get("itemWeightKg");
  const receiptNos = get("itemReceiptNo");

  let refusal: string | undefined;

  const num = (v: string | undefined, row: number, field: string) => {
    if (refusal) return null;
    if (!v || v.trim() === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) {
      refusal = `Item ${row}: ${field} is not a number.`;
      return null;
    }
    if (n < 0) {
      refusal = `Item ${row}: ${field} cannot be below zero.`;
      return null;
    }
    return n;
  };

  const lines: IntakeLine[] = [];
  for (let i = 0; i < descriptions.length; i++) {
    const description = descriptions[i]?.trim();
    if (!description) continue;

    const row = lines.length + 1;
    const typedQuantity = num(quantities[i], row, "packages");
    /* Blank means one package, which is what the counter means by leaving it
       alone. Zero or a fraction is a typing mistake, and quietly rounding it up
       to one stores a count nobody wrote. */
    if (
      typedQuantity !== null &&
      (!Number.isInteger(typedQuantity) || typedQuantity < 1)
    ) {
      refusal ??= `Item ${row}: packages is a whole number, at least one.`;
    }
    const piecesValue = num(pieces[i], row, "pieces");
    if (piecesValue !== null && !Number.isInteger(piecesValue)) {
      refusal ??= `Item ${row}: pieces is a whole number.`;
    }

    lines.push({
      paperReceiptNo: receiptNos[i]?.trim() || null,
      description,
      descriptionZh: zh[i]?.trim() || null,
      cargoType: cargoTypes[i]?.trim() || null,
      packageType: ((PACKAGE_TYPES as readonly string[]).includes(types[i])
        ? types[i]
        : "CARTON") as PackageType,
      quantity: typedQuantity ?? 1,
      pieces: piecesValue,
      cbm: num(cbms[i], row, "volume"),
      length: num(lengths[i], row, "length"),
      width: num(widths[i], row, "width"),
      height: num(heights[i], row, "height"),
      weightKg: num(weights[i], row, "weight"),
    });
  }

  /* One bad figure fails the whole delivery rather than saving the good rows
     around it: half a consignment on the floor under a reference the customer
     is holding a note for is worse than a form that has to be corrected. */
  return refusal ? { lines: [], error: refusal } : { lines };
}
