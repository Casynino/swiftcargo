import "server-only";

import {
  Prisma,
  type CargoStatus,
  type MeasurementUnit,
  type PackageType,
} from "@prisma/client";

import { recordAudit, recordFieldChange } from "@/lib/audit";
import { calculateCbm } from "@/lib/cbm";
import { LOADABLE_CONTAINER_STATUSES } from "@/lib/constants";
import { nextExceptionReference, packageReference } from "@/lib/ids";
import { notifyStaff, staffInDepartment } from "@/lib/notify";
import type { TxClient } from "@/lib/prisma";
import { can, canAmendCargo, cargoCustody } from "@/lib/rbac";
import type { SessionUser } from "@/lib/session";

/**
 * Correcting a consignment after it was taken in.
 *
 * The transactional half of the correction actions in lib/actions/cargo.ts. They
 * hold the permission check and the form parsing; this holds every rule about
 * what may move, so the door on the cargo page, the action behind it and a
 * script run against the database all ask the same questions.
 *
 * A refusal is thrown as CorrectionRefused inside the caller's transaction, so
 * nothing written before the refusal survives it.
 */
export class CorrectionRefused extends Error {}

type Actor = SessionUser;

const GONE: CargoStatus[] = ["COLLECTED", "DELIVERED", "CANCELLED"];

const CHECKED_IN_AT_DAR =
  "These packages were checked in at Dar, so the count cannot be lowered past them. Raise a case instead.";

const show = (v: Prisma.Decimal | number | string | null | undefined) =>
  v === null || v === undefined ? null : new Prisma.Decimal(v).toString();

const same = (
  a: Prisma.Decimal | number | null | undefined,
  b: Prisma.Decimal | number | null | undefined
) => {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return new Prisma.Decimal(a).equals(new Prisma.Decimal(b));
};

// ---------------------------------------------------------------------------
// Dar's own count
// ---------------------------------------------------------------------------

export type DarMeasurementInput = {
  cargoId: string;
  packagesCount: number;
  piecesCount: number | null;
  weightKg: number | null;
  cbm: number | null;
  reason: string;
};

/**
 * DAR CORRECTS ITS OWN COUNT.
 *
 * The totals on DarReceiving are what Dar counted, weighed and measured when
 * the boxes came off the container. China's receiving row is never reached
 * from here, so the comparison keeps both columns. The package lines have
 * their own door (applyPackageLine), which Dar holds on the same custody.
 *
 * Every field that moves is written to FieldChange with the reason before the
 * row is updated. The caller re-prices a draft bill afterwards, because an
 * untyped consignment is billed on these totals.
 *
 * Boxes that have been handed over cannot be counted away: after release the
 * package count may go up but not down. Weight, volume and pieces stay
 * correctable, the way a re-weigh is on any consignment still on the record.
 */
export async function applyDarMeasurement(
  tx: TxClient,
  actor: Actor,
  input: DarMeasurementInput
) {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new CorrectionRefused("Say why the count is being corrected.");
  }

  const cargo = await tx.cargo.findFirst({
    where: { id: input.cargoId, deletedAt: null },
    select: {
      id: true,
      reference: true,
      status: true,
      senderId: true,
      release: { select: { id: true } },
      chinaReceiving: { select: { packagesCount: true } },
      darReceiving: true,
      containerLines: { select: { containerId: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!cargo) throw new CorrectionRefused("That cargo no longer exists.");

  if (cargoCustody(cargo.status) !== "DAR" || !canAmendCargo(actor.role, cargo.status)) {
    throw new CorrectionRefused("This consignment is not yours to amend.");
  }
  const dar = cargo.darReceiving;
  if (!dar) {
    throw new CorrectionRefused(
      "Dar has not received this consignment, so there is no Dar count to correct."
    );
  }
  /* A box that has been handed over is not deleted by lowering a number: the
     release is the proof somebody took it, and a count that shrinks after it
     is a shortage nobody can check. That is a case to raise. */
  const handedOver = !!cargo.release || GONE.includes(cargo.status);
  if (handedOver && input.packagesCount < dar.packagesCount) {
    throw new CorrectionRefused(
      "This consignment has already been handed over, so its package count cannot be lowered. Raise a case instead."
    );
  }

  const weightKg =
    input.weightKg === null ? null : new Prisma.Decimal(input.weightKg).toDecimalPlaces(3);
  const cbm = input.cbm === null ? null : new Prisma.Decimal(input.cbm).toDecimalPlaces(4);

  const changes: { field: string; from: string | null; to: string | null }[] = [];
  if (dar.packagesCount !== input.packagesCount) {
    changes.push({ field: "packagesCount", from: String(dar.packagesCount), to: String(input.packagesCount) });
  }
  if ((dar.piecesCount ?? null) !== input.piecesCount) {
    changes.push({ field: "piecesCount", from: show(dar.piecesCount), to: show(input.piecesCount) });
  }
  if (!same(dar.weightKg, weightKg)) {
    changes.push({ field: "weightKg", from: show(dar.weightKg), to: show(weightKg) });
  }
  if (!same(dar.cbm, cbm)) {
    changes.push({ field: "cbm", from: show(dar.cbm), to: show(cbm) });
  }
  if (changes.length === 0) throw new CorrectionRefused("Nothing was changed.");

  const countMoved = changes.some((c) => c.field === "packagesCount");
  const china = cargo.chinaReceiving;
  const shortOrOver = !!china && china.packagesCount !== input.packagesCount;

  /*
    A SIGN-OFF IS OF THE COUNT IT SAW.

    Verification is somebody saying "this many boxes, checked". When the number
    of boxes changes afterwards, that sentence is about a different count, and
    the release engine would go on trusting it.
  */
  const unverify = countMoved && dar.verified;
  /* A count that now disagrees with China is the same event check-in treats as
     a discrepancy, and it gets the same case. A count that now agrees does not
     clear a flag: an open case is closed by resolving it, not by retyping. */
  const raiseCase = countMoved && shortOrOver && !dar.discrepancy;

  for (const change of changes) {
    await recordFieldChange(
      {
        actor: actor,
        entity: "DarReceiving",
        entityId: dar.id,
        field: change.field,
        oldValue: change.from,
        newValue: change.to,
        reason,
      },
      tx
    );
  }
  if (unverify) {
    await recordFieldChange(
      { actor: actor, entity: "DarReceiving", entityId: dar.id, field: "verified", oldValue: "true", newValue: "false", reason },
      tx
    );
  }
  if (raiseCase) {
    await recordFieldChange(
      { actor: actor, entity: "DarReceiving", entityId: dar.id, field: "discrepancy", oldValue: "false", newValue: "true", reason },
      tx
    );
  }

  await tx.darReceiving.update({
    where: { id: dar.id },
    data: {
      packagesCount: input.packagesCount,
      piecesCount: input.piecesCount,
      weightKg,
      cbm,
      ...(unverify ? { verified: false, verifiedAt: null } : {}),
      ...(raiseCase
        ? { discrepancy: true, discrepancyNotes: dar.discrepancyNotes ?? reason }
        : {}),
    },
  });

  let caseRef: string | null = null;
  if (raiseCase && china) {
    caseRef = await nextExceptionReference(tx);
    const short = input.packagesCount < china.packagesCount;
    const opened = await tx.exceptionCase.create({
      data: {
        reference: caseRef,
        type: short ? "MISSING_CARGO" : "PACKAGE_MISMATCH",
        priority: short ? "HIGH" : "NORMAL",
        cargoId: cargo.id,
        customerId: cargo.senderId,
        containerId: dar.containerId ?? cargo.containerLines.at(-1)?.containerId ?? null,
        department: "DAR_WAREHOUSE",
        title: `${cargo.reference}: China counted ${china.packagesCount}, Dar counted ${input.packagesCount}`,
        description: reason,
        raisedById: actor.id,
      },
      select: { id: true },
    });
    await tx.exceptionEvent.create({
      data: {
        caseId: opened.id,
        to: "OPEN",
        note: "Opened when Dar corrected its count.",
        actorId: actor.id,
      },
    });
    await notifyStaff(
      [
        ...(await staffInDepartment("CUSTOMER_SUPPORT", tx)),
        ...(await staffInDepartment("MANAGEMENT", tx)),
      ],
      {
        kind: "exception.raised",
        title: `Issue on ${cargo.reference}`,
        body: `China counted ${china.packagesCount}, Dar counted ${input.packagesCount}.`,
        href: "/app/exceptions",
      },
      tx
    );
  }

  await recordAudit(
    {
      actor: actor,
      action: "cargo.measure.dar",
      entity: "Cargo",
      entityId: cargo.id,
      summary: `${cargo.reference}: Dar count corrected — ${changes
        .map((c) => `${c.field} ${c.from ?? "—"} → ${c.to ?? "—"}`)
        .join(", ")} — ${reason}`,
      metadata: { darReceivingId: dar.id, changes, reason, caseRef, unverified: unverify },
    },
    tx
  );

  return { reference: cargo.reference, changes, caseRef, unverified: unverify };
}

// ---------------------------------------------------------------------------
// Package lines
// ---------------------------------------------------------------------------

export type PackageLineInput = {
  cargoId: string;
  packageId: string | null;
  packageType: PackageType;
  cargoType: string | null;
  description: string | null;
  quantity: number;
  unit: MeasurementUnit;
  length: number | null;
  width: number | null;
  height: number | null;
  weightKg: number | null;
  /** A volume typed straight in. Wins over the three sides. */
  cbm: number | null;
  balerNumber: string | null;
  /* The packing list's own columns. Undefined leaves the saved value alone —
     an editor that does not show a field must not blank it. */
  descriptionZh?: string | null;
  pieces?: number | null;
  netWeightKg?: number | null;
  modelNo?: string | null;
  declaredUnitValue?: number | null;
  /** Offered, not demanded. Blank is stored as the plain description of the act. */
  reason: string | null;
};

const LINE_LABELS: Record<string, string> = {
  descriptionZh: "Chinese name",
  pieces: "Pieces",
  netWeightKg: "Net weight",
  modelNo: "Model no.",
  declaredUnitValue: "Unit price (USD)",
  packageType: "Packed as",
  cargoType: "Cargo type",
  description: "Description",
  quantity: "Quantity",
  unit: "Measured in",
  length: "Length",
  width: "Width",
  height: "Height",
  weightKg: "Weight (kg)",
  cbm: "CBM",
  balerNumber: "Bale number",
};

async function lineCargo(tx: TxClient, cargoId: string) {
  return tx.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    select: {
      id: true,
      reference: true,
      status: true,
      darReceiving: { select: { id: true, cbm: true } },
    },
  });
}

/** Dar has checked this consignment in and is holding it. */
const checkedInAtDar = (cargo: {
  status: CargoStatus;
  darReceiving: { id: string } | null;
}) => cargoCustody(cargo.status) === "DAR" && cargo.darReceiving !== null;

/**
 * KEEP THE HOLDING FLOOR'S VOLUME EQUAL TO ITS LINES.
 *
 * While Guangzhou holds the cargo, China's receiving CBM is the sum of the
 * lines — the loading screen and the packing list order by it.
 *
 * Once Dar has checked it in, China's row is left exactly as China measured it:
 * it is the left column of the comparison and the only record of what went
 * into the container. A line Dar corrects is Dar's measurement, so it is Dar's
 * volume that follows the lines, with the old figure kept in FieldChange.
 */
export async function syncLineTotals(
  tx: TxClient,
  actor: Actor,
  cargoId: string,
  reason: string
) {
  const cargo = await lineCargo(tx, cargoId);
  if (!cargo) return;

  await syncContainerLines(tx, cargoId);

  const lines = await tx.cargoPackage.findMany({
    where: { cargoId, deletedAt: null },
    select: { cbm: true, quantity: true, pieces: true, weightKg: true },
  });
  const sum = lines.reduce((total, l) => total.add(l.cbm), new Prisma.Decimal(0));

  if (checkedInAtDar(cargo)) {
    const dar = cargo.darReceiving!;
    if (same(dar.cbm, sum)) return;
    await recordFieldChange(
      {
        actor,
        entity: "DarReceiving",
        entityId: dar.id,
        field: "cbm",
        oldValue: show(dar.cbm),
        newValue: sum.toString(),
        reason,
      },
      tx
    );
    await tx.darReceiving.update({ where: { id: dar.id }, data: { cbm: sum } });
    return;
  }

  const receiving = await tx.chinaReceiving.findUnique({
    where: { cargoId },
    select: { id: true },
  });
  if (!receiving) return;
  /* The count and the weight follow the lines as the volume does. A carton
     added to a line while Guangzhou holds it left China's receiving at the old
     count, so Dar's "present and correct" tick copied a number the lines no
     longer said, and a correct delivery arrived looking one carton short. */
  const pieces = lines.reduce((total, l) => total + (l.pieces ?? 0), 0);
  const weight = lines.reduce(
    (total, l) => total.add(l.weightKg ?? 0),
    new Prisma.Decimal(0)
  );
  await tx.chinaReceiving.update({
    where: { id: receiving.id },
    data: {
      cbm: sum,
      /* Only what the lines actually carry: a consignment taken in before
         weights moved onto the lines keeps the total it was given. */
      ...(lines.length > 0
        ? { packagesCount: lines.reduce((total, l) => total + l.quantity, 0) }
        : {}),
      ...(lines.some((l) => l.pieces !== null) ? { piecesCount: pieces } : {}),
      ...(lines.some((l) => l.weightKg !== null) ? { weightKg: weight } : {}),
    },
  });
}

/**
 * KEEP AN OPEN CONTAINER'S LINE EQUAL TO THE BOXES IN IT.
 *
 * The container line is the packing list line and the container's totals, and
 * it is summed from the packages when the consignment is loaded. A line
 * corrected afterwards — re-measured, a carton added or taken off — while the
 * box is still open has to move the container's figure with it, or the list
 * that freezes at the seal prints a volume the boxes do not add up to.
 *
 * Sealed containers are left alone: their line is what went into the box when
 * it was shut, and the packing list issued from it is already on paper.
 */
export async function syncContainerLines(tx: TxClient, cargoId: string) {
  const lines = await tx.containerCargo.findMany({
    where: { cargoId, container: { status: { in: LOADABLE_CONTAINER_STATUSES } } },
    select: { id: true, containerId: true },
  });
  for (const line of lines) {
    const boxes = await tx.cargoPackage.findMany({
      where: { cargoId, containerId: line.containerId, deletedAt: null },
      select: { quantity: true, cbm: true, weightKg: true },
    });
    const cbm = boxes.reduce((sum, b) => sum.add(b.cbm), new Prisma.Decimal(0));
    const weight = boxes.reduce((sum, b) => sum.add(b.weightKg ?? 0), new Prisma.Decimal(0));
    await tx.containerCargo.update({
      where: { id: line.id },
      data: {
        cbm,
        packagesCount: boxes.reduce((sum, b) => sum + b.quantity, 0),
        weightKg: weight.greaterThan(0) ? weight : null,
      },
    });
  }
}

/**
 * ADD OR CORRECT ONE PACKAGE LINE.
 *
 * The lines are the consignment's record, and they belong to whichever floor
 * holds the cargo: Guangzhou until Dar checks it in, Dar from then on, and
 * management always. Dar re-measuring a bale corrects the line the same way
 * Guangzhou would, and the bill follows the corrected line.
 *
 * Every field that moves is diffed against the saved line and written to
 * FieldChange before the update — the warehouse sees the current version, and
 * "the volume was 1.2 and now it is 1.4" stays answerable for ever.
 *
 * Once Dar has checked the boxes in, a line's quantity may go up and never
 * down. A carton that came off the container and is now missing is a shortage,
 * and a shortage is a case, not a smaller number.
 *
 * The volume follows the receiving counter's rule: three sides and a quantity
 * are multiplied in lib/cbm.ts, a volume typed in outright wins, and a figure
 * the sides do not account for is marked as hand-entered and stays marked.
 */
export async function applyPackageLine(
  tx: TxClient,
  actor: Actor,
  input: PackageLineInput
) {
  const reason = input.reason?.trim() || "Measurements corrected";

  const cargo = await lineCargo(tx, input.cargoId);
  if (!cargo) throw new CorrectionRefused("That cargo no longer exists.");
  if (!canAmendCargo(actor.role, cargo.status)) {
    throw new CorrectionRefused("This consignment is not yours to amend.");
  }
  if (input.quantity < 1 || !Number.isInteger(input.quantity)) {
    throw new CorrectionRefused("At least one.");
  }

  const derived = calculateCbm({
    length: input.length,
    width: input.width,
    height: input.height,
    quantity: input.quantity,
    unit: input.unit,
  });
  const typed =
    input.cbm !== null && input.cbm > 0 ? new Prisma.Decimal(input.cbm) : null;
  const cbm = typed ?? derived ?? new Prisma.Decimal(0);
  const byHand = typed !== null && (derived === null || !derived.equals(typed));

  const clean = (v: string | null) => (v?.trim() ? v.trim() : null);
  const dec = (v: number | null) => (v === null ? null : new Prisma.Decimal(v));

  const next = {
    packageType: input.packageType,
    cargoType: clean(input.cargoType),
    description: clean(input.description),
    quantity: input.quantity,
    unit: input.unit,
    length: dec(input.length),
    width: dec(input.width),
    height: dec(input.height),
    weightKg: dec(input.weightKg),
    balerNumber: clean(input.balerNumber),
    cbm,
    ...(input.descriptionZh !== undefined ? { descriptionZh: clean(input.descriptionZh) } : {}),
    ...(input.pieces !== undefined ? { pieces: input.pieces } : {}),
    ...(input.netWeightKg !== undefined ? { netWeightKg: dec(input.netWeightKg) } : {}),
    ...(input.modelNo !== undefined ? { modelNo: clean(input.modelNo) } : {}),
    ...(input.declaredUnitValue !== undefined
      ? { declaredUnitValue: dec(input.declaredUnitValue) }
      : {}),
  };

  if (input.packageId) {
    const before = await tx.cargoPackage.findFirst({
      where: { id: input.packageId, cargoId: cargo.id, deletedAt: null },
    });
    if (!before) throw new CorrectionRefused("That package no longer exists.");

    if (checkedInAtDar(cargo) && input.quantity < before.quantity) {
      throw new CorrectionRefused(CHECKED_IN_AT_DAR);
    }

    const changes: { field: string; from: string | null; to: string | null }[] = [];
    const text = (field: string, from: string | null, to: string | null) => {
      if (from !== to) changes.push({ field, from, to });
    };
    const num = (field: string, from: Prisma.Decimal | null, to: Prisma.Decimal | null) => {
      if (!same(from, to)) changes.push({ field, from: show(from), to: show(to) });
    };
    text("packageType", before.packageType, next.packageType);
    text("cargoType", before.cargoType, next.cargoType);
    text("description", before.description, next.description);
    text("quantity", String(before.quantity), String(next.quantity));
    text("unit", before.unit, next.unit);
    num("length", before.length, next.length);
    num("width", before.width, next.width);
    num("height", before.height, next.height);
    num("weightKg", before.weightKg, next.weightKg);
    num("cbm", before.cbm, next.cbm);
    text("balerNumber", before.balerNumber, next.balerNumber);
    if ("descriptionZh" in next) text("descriptionZh", before.descriptionZh, next.descriptionZh ?? null);
    if ("pieces" in next)
      text("pieces", before.pieces === null ? null : String(before.pieces), next.pieces == null ? null : String(next.pieces));
    if ("netWeightKg" in next) num("netWeightKg", before.netWeightKg, next.netWeightKg ?? null);
    if ("modelNo" in next) text("modelNo", before.modelNo, next.modelNo ?? null);
    if ("declaredUnitValue" in next)
      num("declaredUnitValue", before.declaredUnitValue, next.declaredUnitValue ?? null);

    if (changes.length === 0) throw new CorrectionRefused("Nothing was changed.");

    for (const change of changes) {
      await recordFieldChange(
        {
          actor,
          entity: "CargoPackage",
          entityId: before.id,
          field: change.field,
          oldValue: change.from,
          newValue: change.to,
          reason,
        },
        tx
      );
    }

    await tx.cargoPackage.update({
      where: { id: before.id },
      /* A hand-entered volume stays marked even when a later figure happens
         to match the sides: the line was once typed over, and that is what
         the mark says. */
      data: { ...next, cbmOverridden: before.cbmOverridden || byHand },
    });

    const measurementMoved = changes.some((c) =>
      ["cbm", "weightKg", "quantity", "cargoType"].includes(c.field)
    );
    if (changes.some((c) => c.field === "cbm")) {
      await syncLineTotals(tx, actor, cargo.id, reason);
    } else if (changes.some((c) => c.field === "quantity" || c.field === "weightKg")) {
      await syncContainerLines(tx, cargo.id);
    }

    await recordAudit(
      {
        actor,
        action: "cargo.package.edit",
        entity: "CargoPackage",
        entityId: before.id,
        summary: `Corrected ${before.reference} on ${cargo.reference} — ${changes
          .map((c) => `${LINE_LABELS[c.field] ?? c.field} ${c.from ?? "—"} → ${c.to ?? "—"}`)
          .join(", ")}`,
        metadata: { reason, changes, custody: cargoCustody(cargo.status) },
      },
      tx
    );

    return { reference: cargo.reference, created: false, measurementMoved };
  }

  /* The line number counts every line this consignment has ever had, deleted
     ones included, so a reference printed on a bale is never reused for a
     different bale. */
  const used = await tx.cargoPackage.count({ where: { cargoId: cargo.id } });
  const reference = packageReference(cargo.reference, used + 1);
  const created = await tx.cargoPackage.create({
    data: { ...next, cargoId: cargo.id, reference, cbmOverridden: byHand },
    select: { id: true },
  });

  /* A line that did not exist has no old value, but the new one is still a
     change to what this consignment measures — and on Dar's floor it is the
     carton Guangzhou never wrote down. */
  await recordFieldChange(
    {
      actor,
      entity: "CargoPackage",
      entityId: created.id,
      field: "created",
      oldValue: null,
      newValue: `${next.quantity} × ${next.packageType}${next.cargoType ? ` (${next.cargoType})` : ""}, ${cbm.toString()} CBM`,
      reason: input.reason?.trim() || "Line added",
    },
    tx
  );
  if (!cbm.isZero()) {
    await syncLineTotals(tx, actor, cargo.id, input.reason?.trim() || "Line added");
  }

  await recordAudit(
    {
      actor,
      action: "cargo.package.add",
      entity: "CargoPackage",
      entityId: created.id,
      summary: `Added ${reference} to ${cargo.reference} — ${next.quantity} × ${next.packageType}, ${cbm.toString()} CBM`,
      metadata: { reason: input.reason?.trim() || null, custody: cargoCustody(cargo.status) },
    },
    tx
  );

  return { reference: cargo.reference, created: true, measurementMoved: true };
}

/**
 * Take a line off the consignment.
 *
 * Soft, as every removal is: the line keeps its reference and its history.
 * Refused once Dar has checked the boxes in — a line that came off the
 * container and cannot now be found is a shortage, and removing it would erase
 * the evidence of the thing somebody will be asked to explain.
 */
export async function removePackageLine(
  tx: TxClient,
  actor: Actor,
  packageId: string,
  reason: string | null
) {
  const line = await tx.cargoPackage.findFirst({
    where: { id: packageId, deletedAt: null },
    select: { id: true, reference: true, cargoId: true, cbm: true, quantity: true },
  });
  if (!line) throw new CorrectionRefused("That package no longer exists.");

  const cargo = await lineCargo(tx, line.cargoId);
  if (!cargo) throw new CorrectionRefused("That cargo no longer exists.");
  if (!canAmendCargo(actor.role, cargo.status)) {
    throw new CorrectionRefused("This consignment is not yours to amend.");
  }
  if (checkedInAtDar(cargo)) throw new CorrectionRefused(CHECKED_IN_AT_DAR);

  const why = reason?.trim() || "Line removed";
  await recordFieldChange(
    {
      actor,
      entity: "CargoPackage",
      entityId: line.id,
      field: "deletedAt",
      oldValue: null,
      newValue: new Date().toISOString(),
      reason: why,
    },
    tx
  );
  await tx.cargoPackage.update({
    where: { id: line.id },
    data: { deletedAt: new Date(), containerId: null },
  });
  await syncLineTotals(tx, actor, cargo.id, why);

  await recordAudit(
    {
      actor,
      action: "cargo.package.delete",
      entity: "CargoPackage",
      entityId: line.id,
      summary: `Removed ${line.reference} from ${cargo.reference}`,
      metadata: { reason: why, quantity: line.quantity, cbm: line.cbm.toString() },
    },
    tx
  );

  return { reference: cargo.reference, cargoId: cargo.id };
}

// ---------------------------------------------------------------------------
// The consignment's details
// ---------------------------------------------------------------------------

type ReceiverGuardCargo = {
  invoices: { status: string }[];
  release: { id: string } | null;
  pickupNote: { status: string } | null;
};

/**
 * WHY THE RECEIVER CAN NO LONGER BE CHANGED, OR NULL WHEN IT STILL CAN.
 *
 * The receiver is who the bill is addressed to and who may collect. A bill that
 * exists was priced at that customer's agreed rate and names them; a pickup note
 * is their permission to walk out with the boxes. Moving the consignment to
 * somebody else underneath either leaves a document in one person's name for
 * goods that now belong to another — so the change is refused until the
 * document is cancelled, and the new one is raised for the right person.
 *
 * Exported so the cargo page offers the same answer the action enforces.
 */
export function receiverLockReason(cargo: ReceiverGuardCargo): string | null {
  if (cargo.release) {
    return "This consignment has been released. The receiver can no longer be changed.";
  }
  if (cargo.pickupNote && cargo.pickupNote.status !== "CANCELLED") {
    return "A pickup note is out in the receiver's name. Cancel it before changing the receiver.";
  }
  const live = cargo.invoices.filter((i) => i.status !== "CANCELLED");
  if (live.some((i) => i.status !== "DRAFT")) {
    return "The bill has been issued to the receiver. Finance must cancel it before the receiver can change.";
  }
  if (live.length > 0) {
    return "A draft bill is priced for the receiver. Finance must cancel the draft before the receiver can change.";
  }
  return null;
}

export type CargoDetailsInput = {
  cargoId: string;
  receiverId: string;
  senderId: string;
  shippingMark: string | null;
  description: string;
  commodity: string | null;
  paperReceiptNo: string | null;
  notes: string | null;
  /** Undefined when the editor may not read internal notes: left as it is. */
  internalNotes?: string | null;
  /** packageId → the cargo type chosen for that line. */
  lineTypes: Record<string, string>;
  /** The rate book's live categories. A line may keep a retired one it already has. */
  allowedTypes: string[];
  reason: string;
};

const LABELS: Record<string, string> = {
  receiverId: "Receiver",
  senderId: "Sender",
  shippingMark: "Shipping mark",
  description: "Description",
  commodity: "Goods type",
  paperReceiptNo: "Receipt number",
  notes: "Notes",
  internalNotes: "Internal notes",
  cargoType: "Cargo type",
};

/**
 * EDIT THE CONSIGNMENT'S DETAILS.
 *
 * Who it belongs to and what it is — never what it measures. Measurements have
 * their own doors, each keeping the other warehouse's figure intact.
 *
 * Custody as everywhere else: Guangzhou corrects cargo still on its side, Dar
 * corrects cargo on its floor, management both. Every field that moves is
 * diffed against the saved row and written to FieldChange with the reason
 * before the update, and the whole edit is one audit line.
 */
export async function applyCargoDetails(
  tx: TxClient,
  actor: Actor,
  input: CargoDetailsInput
) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new CorrectionRefused("Say why the details are changing.");
  if (input.description.trim().length < 2) throw new CorrectionRefused("Say what the cargo is.");

  const cargo = await tx.cargo.findFirst({
    where: { id: input.cargoId, deletedAt: null },
    select: {
      id: true,
      reference: true,
      status: true,
      receiverId: true,
      senderId: true,
      shippingMark: true,
      description: true,
      commodity: true,
      paperReceiptNo: true,
      notes: true,
      internalNotes: true,
      receiver: { select: { code: true, fullName: true } },
      sender: { select: { code: true, fullName: true } },
      invoices: { select: { status: true } },
      release: { select: { id: true } },
      pickupNote: { select: { status: true } },
      packages: {
        where: { deletedAt: null },
        select: { id: true, reference: true, cargoType: true },
      },
    },
  });
  if (!cargo) throw new CorrectionRefused("That cargo no longer exists.");
  if (!canAmendCargo(actor.role, cargo.status)) {
    throw new CorrectionRefused("This consignment is not yours to amend.");
  }

  const [receiver, sender] = await Promise.all([
    tx.customer.findFirst({
      where: { id: input.receiverId, deletedAt: null },
      select: { id: true, code: true, fullName: true },
    }),
    tx.customer.findFirst({
      where: { id: input.senderId, deletedAt: null },
      select: { id: true, code: true, fullName: true, shippingMark: true },
    }),
  ]);
  if (!receiver) throw new CorrectionRefused("Choose who receives this cargo.");
  if (!sender) throw new CorrectionRefused("Choose who is sending this cargo.");

  if (receiver.id !== cargo.receiverId) {
    const locked = receiverLockReason(cargo);
    if (locked) throw new CorrectionRefused(locked);
  }

  /* The mark belongs to the sender. Left blank, it is the sender's own — the
     same rule the receiving counter follows. */
  const mark = input.shippingMark?.trim() || sender.shippingMark || null;
  const clean = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

  const changes: { entity: string; entityId: string; field: string; from: string | null; to: string | null }[] = [];
  const note = (field: string, from: string | null, to: string | null) => {
    if (from !== to) changes.push({ entity: "Cargo", entityId: cargo.id, field, from, to });
  };

  const who = (c: { code: string; fullName: string }) => `${c.fullName} (${c.code})`;
  if (receiver.id !== cargo.receiverId) note("receiverId", who(cargo.receiver), who(receiver));
  if (sender.id !== cargo.senderId) note("senderId", who(cargo.sender), who(sender));
  note("shippingMark", cargo.shippingMark, mark);
  note("description", cargo.description, input.description.trim());
  note("commodity", cargo.commodity, clean(input.commodity));
  note("paperReceiptNo", cargo.paperReceiptNo, clean(input.paperReceiptNo));
  note("notes", cargo.notes, clean(input.notes));
  const internal =
    input.internalNotes !== undefined && can(actor.role, "cargo.viewInternal");
  if (internal) note("internalNotes", cargo.internalNotes, clean(input.internalNotes));

  const lineMoves: { id: string; cargoType: string }[] = [];
  for (const [packageId, chosen] of Object.entries(input.lineTypes)) {
    const line = cargo.packages.find((p) => p.id === packageId);
    if (!line) throw new CorrectionRefused("One of those package lines no longer exists.");
    const next = chosen.trim();
    if (!next || next === line.cargoType) continue;
    if (!input.allowedTypes.includes(next)) {
      throw new CorrectionRefused(`${next} is not a cargo type in the rate book.`);
    }
    changes.push({ entity: "CargoPackage", entityId: line.id, field: "cargoType", from: line.cargoType, to: next });
    lineMoves.push({ id: line.id, cargoType: next });
  }

  if (changes.length === 0) throw new CorrectionRefused("Nothing was changed.");

  for (const change of changes) {
    await recordFieldChange(
      {
        actor: actor,
        entity: change.entity,
        entityId: change.entityId,
        field: change.field,
        oldValue: change.from,
        newValue: change.to,
        reason,
      },
      tx
    );
  }

  await tx.cargo.update({
    where: { id: cargo.id },
    data: {
      receiverId: receiver.id,
      senderId: sender.id,
      shippingMark: mark,
      description: input.description.trim(),
      commodity: clean(input.commodity),
      paperReceiptNo: clean(input.paperReceiptNo),
      notes: clean(input.notes),
      ...(internal ? { internalNotes: clean(input.internalNotes) } : {}),
    },
  });
  for (const move of lineMoves) {
    await tx.cargoPackage.update({ where: { id: move.id }, data: { cargoType: move.cargoType } });
  }

  await recordAudit(
    {
      actor: actor,
      action: "cargo.details.edit",
      entity: "Cargo",
      entityId: cargo.id,
      summary: `Edited ${cargo.reference} — ${[...new Set(changes.map((c) => LABELS[c.field] ?? c.field))].join(", ")} — ${reason}`,
      metadata: {
        reason,
        changes: changes.map((c) => ({
          entity: c.entity,
          entityId: c.entityId,
          field: c.field,
          from: c.from,
          to: c.to,
        })),
        previousReceiverId: cargo.receiverId,
        previousSenderId: cargo.senderId,
      },
    },
    tx
  );

  return {
    reference: cargo.reference,
    changes,
    customers: [...new Set([cargo.receiverId, cargo.senderId, receiver.id, sender.id])],
  };
}
