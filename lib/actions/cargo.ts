"use server";

import { bilingual } from "@/lib/translate";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, type MeasurementUnit, type PackageType } from "@prisma/client";

import { recordAudit, recordFieldChange, withNote } from "@/lib/audit";
import { setCargoStatus } from "@/lib/cargo";
import { calculateCbm } from "@/lib/cbm";
import { readIntakeLines, readReceivingDate } from "@/lib/intake-lines";
import { cargoTypeOptions, loadRateBook, valueWith } from "@/lib/valuation";
import {
  generateQrToken,
  nextCargoReference,
  nextCustomerCode,
  nextDeliveryNoteNumber,
  packageReference,
  shippingMarkFor,
} from "@/lib/ids";
import { notifyCustomer } from "@/lib/notify";
import { normaliseTzPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { syncCargoBoxes } from "@/lib/boxes";
import { canAmendCargo } from "@/lib/rbac";
import {
  applyCargoDetails,
  applyDarMeasurement,
  applyPackageLine,
  CorrectionRefused,
  removePackageLine,
  syncLineTotals,
} from "@/lib/cargo-corrections";
import { repriceDraftsAfterCorrection } from "@/lib/invoice-reprice";
import { priceOnCheckIn } from "@/lib/price-confirmation";
import { store, UploadError } from "@/lib/storage";
import { formMessage } from "@/lib/safe-error";
import { authorize } from "@/lib/session";

export type ActionState = { error?: string; ok?: string; id?: string };

const PACKAGE_TYPES = [
  "CARTON",
  "BALE",
  "BAG",
  "PALLET",
  "CRATE",
  "DRUM",
  "PIECE",
  "OTHER",
] as const;

const createSchema = z.object({
  senderId: z.string().min(1, "Choose who is sending."),
  /* Blank means the sender collects it themselves, which is the common case. */
  receiverId: z.string().optional(),
  supplierName: z.string().trim().optional(),
  supplierRef: z.string().trim().optional(),
  service: z.enum(["LCL", "FCL"]),
  description: z.string().trim().min(2, "Say what the cargo is."),
  commodity: z.string().trim().optional(),
  declaredPackages: z.coerce.number().int().min(0).optional(),
  declaredCbm: z.coerce.number().min(0).optional(),
  notes: z.string().trim().optional(),
});

/*
  BOOKING AHEAD IS GONE, AND WITH IT THE SECOND KIND OF CARGO RECORD.

  A consignment used to be registerable before it existed — declared packages, a
  declared volume, status REGISTERED — and then received separately when the
  boxes turned up. In practice the boxes turned up without anyone remembering
  the booking, a second record was made at the counter, and the same goods
  existed twice under two references.

  A consignment now begins the moment Guangzhou has it in front of them, and
  there is exactly one way in: `receiveNewCargo`.
*/


// ---------------------------------------------------------------------------
// China receiving
// ---------------------------------------------------------------------------

const receiveSchema = z.object({
  cargoId: z.string().min(1),
  warehouseId: z.string().min(1, "Which warehouse?"),
  packagesCount: z.coerce.number().int().min(1, "At least one package."),
  piecesCount: z.coerce.number().int().min(0).optional(),
  weightKg: z.coerce.number().min(0).optional(),
  condition: z.enum(["GOOD", "MINOR_DAMAGE", "DAMAGED", "WET", "REPACKED"]),
  location: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

/**
 * The Guangzhou floor says the boxes are here.
 *
 * This is the moment the consignment stops being a promise. It writes the
 * receiving row, moves the status, and tells the customer — all in one
 * transaction, because a customer told their cargo arrived when the row did not
 * save is worse than not telling them at all.
 *
 * The CBM here is whatever the packages already sum to. Measuring is a separate
 * act (`upsertPackage`), often done later at the bale, and forcing it into the
 * receiving form means a clerk types a guess to get past the field.
 */
export async function receiveInChina(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("receiving.china");

  const parsed = receiveSchema.safeParse({
    cargoId: formData.get("cargoId"),
    warehouseId: formData.get("warehouseId"),
    packagesCount: formData.get("packagesCount"),
    piecesCount: formData.get("piecesCount") || undefined,
    weightKg: formData.get("weightKg") || undefined,
    condition: formData.get("condition") || "GOOD",
    location: formData.get("location") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  const cargo = await prisma.cargo.findFirst({
    where: { id: data.cargoId, deletedAt: null },
    select: {
      id: true,
      reference: true,
      status: true,
      senderId: true,
      chinaReceiving: { select: { id: true } },
      packages: { where: { deletedAt: null }, select: { cbm: true } },
    },
  });
  if (!cargo) return { error: "That cargo no longer exists." };

  if (!canAmendCargo(actor.role, cargo.status)) {
    return { error: "This consignment has left China and is Dar's to amend." };
  }

  const cbm = cargo.packages.reduce(
    (sum, p) => sum.add(p.cbm),
    new Prisma.Decimal(0)
  );

  await prisma.$transaction(async (tx) => {
    await tx.chinaReceiving.upsert({
      where: { cargoId: cargo.id },
      create: {
        cargoId: cargo.id,
        warehouseId: data.warehouseId,
        packagesCount: data.packagesCount,
        piecesCount: data.piecesCount ?? null,
        weightKg: data.weightKg ?? null,
        cbm,
        condition: data.condition,
        location: data.location || null,
        notes: data.notes || null,
        receivedById: actor.id,
      },
      update: {
        warehouseId: data.warehouseId,
        packagesCount: data.packagesCount,
        piecesCount: data.piecesCount ?? null,
        weightKg: data.weightKg ?? null,
        cbm,
        condition: data.condition,
        location: data.location || null,
        notes: data.notes || null,
      },
    });

    const moved = await setCargoStatus(
      tx,
      cargo.id,
      "RECEIVED_CHINA",
      actor,
      "Received at the Guangzhou warehouse"
    );

    if (moved) {
      await notifyCustomer(
        [cargo.senderId],
        {
          kind: "cargo.received_china",
          title: `${cargo.reference} received in China`,
          body: `We have received ${data.packagesCount} package(s) at our Guangzhou warehouse.`,
          href: `/portal/cargo/${cargo.reference}`,
        },
        tx
      );
    }
  });

  await recordAudit({
    actor,
    action: "cargo.receive.china",
    entity: "Cargo",
    entityId: cargo.id,
    summary: `${cargo.reference} received in China — ${data.packagesCount} package(s)`,
    metadata: { packages: data.packagesCount, weightKg: data.weightKg ?? null },
  });

  revalidatePath("/app/inventory");
  revalidatePath(`/app/cargo/${cargo.id}`);
  return { ok: "Received." };
}

// ---------------------------------------------------------------------------
// Packages and CBM
// ---------------------------------------------------------------------------

const packageSchema = z.object({
  cargoId: z.string().min(1),
  packageId: z.string().optional(),
  packageType: z.enum(PACKAGE_TYPES),
  description: z.string().trim().optional(),
  quantity: z.coerce.number().int().min(1, "At least one."),
  unit: z.enum(["CM", "M"]),
  length: z.coerce.number().min(0).optional(),
  width: z.coerce.number().min(0).optional(),
  height: z.coerce.number().min(0).optional(),
  weightKg: z.coerce.number().min(0).optional(),
  netWeightKg: z.coerce.number().min(0).optional(),
  modelNo: z.string().trim().max(120).optional(),
  declaredUnitValue: z.coerce.number().min(0).optional(),
  descriptionZh: z.string().trim().max(200).optional(),
  pieces: z.coerce.number().int().min(0).optional(),
  balerNumber: z.string().trim().optional(),
  cargoType: z.string().trim().optional(),
  cbm: z.coerce.number().min(0).optional(),
  reason: z.string().trim().max(300, "Keep the reason under 300 characters.").optional(),
});

/**
 * Add or correct one measured line.
 *
 * Whichever floor holds the cargo corrects its lines — Guangzhou before Dar
 * checks it in, Dar after — and every field that moves is written to
 * FieldChange before it takes effect. The rules are in
 * lib/cargo-corrections.ts; a draft bill is re-priced from the corrected lines
 * once the correction has committed.
 */
export async function upsertPackage(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("cargo.edit");

  const parsed = packageSchema.safeParse({
    cargoId: formData.get("cargoId"),
    packageId: formData.get("packageId") || undefined,
    packageType: formData.get("packageType") || "CARTON",
    description: formData.get("description") || undefined,
    quantity: formData.get("quantity") || 1,
    unit: formData.get("unit") || "CM",
    length: formData.get("length") || undefined,
    width: formData.get("width") || undefined,
    height: formData.get("height") || undefined,
    weightKg: formData.get("weightKg") || undefined,
    netWeightKg: formData.get("netWeightKg") || undefined,
    modelNo: formData.get("modelNo") || undefined,
    declaredUnitValue: formData.get("declaredUnitValue") || undefined,
    descriptionZh: formData.get("descriptionZh") || undefined,
    pieces: formData.get("pieces") || undefined,
    balerNumber: formData.get("balerNumber") || undefined,
    cargoType: formData.get("cargoType") || undefined,
    cbm: formData.get("cbm") || undefined,
    reason: formData.get("reason") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the measurements." };
  }
  const data = parsed.data;

  /* An editor without a Chinese box still gets one filled when the glossary
     knows the goods; one it does not know leaves the saved Chinese alone. */
  let description = data.description ?? null;
  let zhPatch: { descriptionZh?: string | null } = formData.has("descriptionZh")
    ? { descriptionZh: data.descriptionZh ?? null }
    : {};
  if (description && !formData.has("descriptionZh")) {
    const both = await bilingual(description).catch(() => null);
    if (both?.en && both.zh) {
      description = both.en;
      zhPatch = { descriptionZh: both.zh };
    }
  }

  try {
    const result = await prisma.$transaction((tx) =>
      applyPackageLine(tx, actor, {
        cargoId: data.cargoId,
        packageId: data.packageId ?? null,
        packageType: data.packageType as PackageType,
        cargoType: data.cargoType ?? null,
        description,
        quantity: data.quantity,
        unit: data.unit as MeasurementUnit,
        length: data.length ?? null,
        width: data.width ?? null,
        height: data.height ?? null,
        weightKg: data.weightKg ?? null,
        /* Sent only by an editor that shows the field; absent leaves it as saved. */
        ...(formData.has("netWeightKg") ? { netWeightKg: data.netWeightKg ?? null } : {}),
        ...(formData.has("modelNo") ? { modelNo: data.modelNo ?? null } : {}),
        ...(formData.has("declaredUnitValue")
          ? { declaredUnitValue: data.declaredUnitValue ?? null }
          : {}),
        ...zhPatch,
        ...(formData.has("pieces") ? { pieces: data.pieces ?? null } : {}),
        cbm: data.cbm ?? null,
        balerNumber: data.balerNumber ?? null,
        reason: data.reason ?? null,
      })
    );
    const repriced = result.measurementMoved
      ? await repriceDraftsAfterCorrection(
          actor,
          data.cargoId,
          data.reason || `Package line on ${result.reference} corrected`
        )
      : null;
    revalidatePath(`/app/cargo/${data.cargoId}`);
    if (repriced?.repriced.length) revalidatePath("/app/finance/invoices");
    /* The floor is not told what happened to the bill: it measures, and the
       money that follows is Finance's to read. */
    return { ok: result.created ? "Line added." : "Measurements saved." };
  } catch (error) {
    if (error instanceof CorrectionRefused) return { error: error.message };
    throw error;
  }
}

export async function deletePackage(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("cargo.edit");

  const packageId = String(formData.get("packageId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;

  try {
    const result = await prisma.$transaction((tx) =>
      removePackageLine(tx, actor, packageId, reason)
    );
    const repriced = await repriceDraftsAfterCorrection(
      actor,
      result.cargoId,
      reason ?? `Package line removed from ${result.reference}`
    );
    revalidatePath(`/app/cargo/${result.cargoId}`);
    if (repriced?.repriced.length) revalidatePath("/app/finance/invoices");
    return { ok: "Line removed." };
  } catch (error) {
    if (error instanceof CorrectionRefused) return { error: error.message };
    throw error;
  }
}

/**
 * Replace a computed CBM with a typed one.
 *
 * The only path in the system that writes a volume a machine did not derive, and
 * it costs the caller a permission and a reason. Both the old value and the new
 * one go into FieldChange BEFORE the column moves, so the original measurement
 * survives its own replacement — that is the whole point.
 */
export async function overrideCbm(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("cbm.override");

  const packageId = String(formData.get("packageId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "No reason given";
  const raw = String(formData.get("cbm") ?? "").trim();

  let value: Prisma.Decimal;
  try {
    value = new Prisma.Decimal(raw);
  } catch {
    return { error: "That is not a number." };
  }
  if (value.lessThanOrEqualTo(0)) return { error: "A volume must be above zero." };

  const line = await prisma.cargoPackage.findUnique({
    where: { id: packageId },
    select: {
      id: true,
      reference: true,
      cbm: true,
      cargo: { select: { id: true, reference: true, status: true } },
    },
  });
  if (!line) return { error: "That package no longer exists." };
  if (!canAmendCargo(actor.role, line.cargo.status)) {
    return { error: "This consignment is not yours to amend." };
  }

  await prisma.$transaction(async (tx) => {
    await recordFieldChange(
      {
        actor,
        entity: "CargoPackage",
        entityId: line.id,
        field: "cbm",
        oldValue: line.cbm.toString(),
        newValue: value.toString(),
        reason,
      },
      tx
    );

    await tx.cargoPackage.update({
      where: { id: line.id },
      data: { cbm: value, cbmOverridden: true },
    });

    await syncLineTotals(tx, actor, line.cargo.id, reason);
  });

  await recordAudit({
    actor,
    action: "cbm.override",
    entity: "CargoPackage",
    entityId: line.id,
    summary: `${line.reference}: CBM ${line.cbm} → ${value} — ${reason}`,
    metadata: { from: line.cbm.toString(), to: value.toString(), reason },
  });

  await repriceDraftsAfterCorrection(actor, line.cargo.id, reason);

  revalidatePath(`/app/cargo/${line.cargo.id}`);
  return { ok: "Override recorded." };
}

// ---------------------------------------------------------------------------
// Delivery note
// ---------------------------------------------------------------------------

/**
 * Swift Cargo's signature that the boxes were received in Guangzhou.
 *
 * The snapshot is the point. The cargo record can be corrected afterwards; the
 * paper in the customer's hand cannot, so the note keeps what it said when it
 * was issued and can still explain itself when the two disagree.
 *
 * Issued once. A second press returns the existing note rather than minting a
 * second number for the same boxes.
 */
export async function issueDeliveryNote(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("deliveryNote.issue");

  const cargoId = String(formData.get("cargoId") ?? "");
  const cargo = await prisma.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    include: {
      sender: true,
      receiver: true,
      supplier: true,
      packages: { where: { deletedAt: null }, orderBy: { reference: "asc" } },
      chinaReceiving: { include: { warehouse: true } },
      deliveryNote: true,
    },
  });
  if (!cargo) return { error: "That cargo no longer exists." };
  if (cargo.deliveryNote) {
    return { ok: `Delivery note ${cargo.deliveryNote.number} already issued.` };
  }
  if (!cargo.chinaReceiving) {
    return { error: "Receive the cargo first — a note says the boxes are here." };
  }

  const note = await prisma.$transaction(async (tx) => {
    const number = await nextDeliveryNoteNumber(tx);
    return tx.deliveryNote.create({
      data: {
        number,
        cargoId: cargo.id,
        issuedById: actor.id,
        snapshot: {
          cargoReference: cargo.reference,
          shippingMark: cargo.shippingMark,
          sender: {
            name: cargo.sender.fullName,
            phone: cargo.sender.phone,
            code: cargo.sender.code,
          },
          receiver: {
            name: cargo.receiver.fullName,
            phone: cargo.receiver.phone,
          },
          supplier: cargo.supplier?.name ?? null,
          supplierRef: cargo.supplierRef,
          description: cargo.description,
          warehouse: cargo.chinaReceiving!.warehouse.name,
          receivedAt: cargo.chinaReceiving!.receivedAt.toISOString(),
          packagesCount: cargo.chinaReceiving!.packagesCount,
          piecesCount: cargo.chinaReceiving!.piecesCount,
          weightKg: cargo.chinaReceiving!.weightKg?.toString() ?? null,
          cbm: cargo.chinaReceiving!.cbm.toString(),
          condition: cargo.chinaReceiving!.condition,
          lines: cargo.packages.map((p) => ({
            reference: p.reference,
            type: p.packageType,
            description: p.description,
            quantity: p.quantity,
            unit: p.unit,
            length: p.length?.toString() ?? null,
            width: p.width?.toString() ?? null,
            height: p.height?.toString() ?? null,
            cbm: p.cbm.toString(),
            weightKg: p.weightKg?.toString() ?? null,
            balerNumber: p.balerNumber,
          })),
        },
      },
    });
  });

  await recordAudit({
    actor,
    action: "deliveryNote.issue",
    entity: "DeliveryNote",
    entityId: note.id,
    summary: `Issued ${note.number} for ${cargo.reference}`,
  });

  await notifyCustomer([cargo.senderId], {
    kind: "deliveryNote.issued",
    title: `Delivery note ${note.number}`,
    body: `Your delivery note for ${cargo.reference} is ready.`,
    href: `/portal/cargo/${cargo.reference}`,
  });

  revalidatePath(`/app/cargo/${cargo.id}`);
  return { ok: `Delivery note ${note.number} issued.`, id: note.id };
}

// ---------------------------------------------------------------------------
// Holds
// ---------------------------------------------------------------------------

/**
 * Stop a release for a reason that is not money.
 *
 * A customs question, a dispute, an open case. It is separate from the financial
 * check because the two are answered by different desks and clearing one must
 * never clear the other.
 */
export async function setOperationalHold(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("cargo.hold");

  const cargoId = String(formData.get("cargoId") ?? "");
  const on = formData.get("hold") === "on";
  const reason = String(formData.get("reason") ?? "").trim() || "No reason given";

  if (on && !reason) return { error: "Say why it is being held." };

  const cargo = await prisma.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    select: {
      id: true,
      reference: true,
      operationalHold: true,
      operationalHoldReason: true,
    },
  });
  if (!cargo) return { error: "That cargo no longer exists." };

  /* Already where it is being asked to go. Writing the row again would leave a
     second lift in the history with nothing behind it. */
  if (cargo.operationalHold === on) {
    return { ok: on ? "Already held." : "There was no hold on it." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.cargo.update({
      where: { id: cargo.id },
      data: {
        operationalHold: on,
        operationalHoldReason: on ? reason : null,
      },
    });

    /* A HOLD IS AN OVERRIDE, AND EVERY OVERRIDE KEEPS BOTH VALUES.

       It is the one thing in the system that stops goods a customer has paid
       for, and the column moved with no before-image: the reason a consignment
       was held was overwritten with null the moment somebody lifted it, so
       "why were these boxes held in March" had no answer by April. The old
       reason is written here before it goes. */
    await recordFieldChange(
      {
        actor,
        entity: "Cargo",
        entityId: cargo.id,
        field: "operationalHold",
        oldValue: cargo.operationalHold,
        newValue: on,
        reason: on ? reason : "Hold lifted",
      },
      tx
    );
    if (cargo.operationalHoldReason || on) {
      await recordFieldChange(
        {
          actor,
          entity: "Cargo",
          entityId: cargo.id,
          field: "operationalHoldReason",
          oldValue: cargo.operationalHoldReason,
          newValue: on ? reason : null,
          reason: on ? "Held" : "Hold lifted",
        },
        tx
      );
    }
  });

  await recordAudit({
    actor,
    action: on ? "cargo.hold" : "cargo.release_hold",
    entity: "Cargo",
    entityId: cargo.id,
    summary: on
      ? `Held ${cargo.reference} — ${reason}`
      : withNote(`Lifted the hold on ${cargo.reference}`, reason),
    metadata: {
      oldValue: cargo.operationalHold,
      newValue: on,
      previousReason: cargo.operationalHoldReason,
      reason: on ? reason : reason || null,
    },
  });

  revalidatePath(`/app/cargo/${cargo.id}`);
  return { ok: on ? "Held." : "Hold lifted." };
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

const PHOTO_KINDS = [
  "PACKAGE",
  "SHIPPING_MARK",
  "LABEL",
  "CONDITION",
  "DAMAGE",
  "RECEIVING_EVIDENCE",
  "RELEASE_EVIDENCE",
  "OTHER",
] as const;

/**
 * Attach evidence to a consignment.
 *
 * The photo is linked to the cargo, never dropped in a folder — a file with no
 * consignment behind it is evidence of nothing, and the damage argument three
 * weeks later is won or lost on being able to say which bale this was.
 *
 * The warehouse is recorded from the uploader's own posting, so a Guangzhou
 * photo and a Dar photo of the same bale can be told apart by more than their
 * timestamps.
 */
export async function uploadCargoPhotos(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("cargo.photo");

  const cargoId = String(formData.get("cargoId") ?? "");
  const kindRaw = String(formData.get("kind") ?? "PACKAGE");
  const caption = String(formData.get("caption") ?? "").trim();
  const kind = (PHOTO_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as (typeof PHOTO_KINDS)[number])
    : "PACKAGE";

  const cargo = await prisma.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    select: { id: true, reference: true },
  });
  if (!cargo) return { error: "That cargo no longer exists." };

  const files = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Choose at least one photo." };

  const warehouseKind = actor.warehouseId
    ? ((
        await prisma.warehouse.findUnique({
          where: { id: actor.warehouseId },
          select: { kind: true },
        })
      )?.kind ?? null)
    : null;

  const stored: string[] = [];
  try {
    for (const file of files) {
      stored.push(await store(file, "cargo"));
    }
  } catch (error) {
    return {
      error:
        error instanceof UploadError
          ? error.message
          : "That upload did not work.",
    };
  }

  await prisma.cargoPhoto.createMany({
    data: stored.map((url) => ({
      cargoId: cargo.id,
      kind,
      url,
      caption: caption || null,
      warehouseKind,
      uploadedById: actor.id,
    })),
  });

  await recordAudit({
    actor,
    action: "cargo.photo.upload",
    entity: "Cargo",
    entityId: cargo.id,
    summary: `Added ${stored.length} photo(s) to ${cargo.reference}`,
  });

  revalidatePath(`/app/cargo/${cargo.id}`);
  return { ok: `${stored.length} photo(s) added.` };
}

// ---------------------------------------------------------------------------
// Receiving at the counter, in one act
// ---------------------------------------------------------------------------

const intakeSchema = z.object({
  customerId: z.string().optional(),
  newCustomerName: z.string().trim().optional(),
  newCustomerPhone: z.string().trim().optional(),
  shippingMark: z.string().trim().optional(),

  paperReceiptNo: z.string().trim().optional(),
  /* Where on the floor it was put down. Not derivable — the building knows it
     and the database cannot work it out — and it is the one question that makes
     a consignment findable between receiving and loading. */
  location: z.string().trim().max(60, "Keep the location short.").optional(),
  /* WHO DELIVERED IT, AND UNDER WHAT NUMBER OF THEIRS.
     A customer chasing a factory quotes the factory's own reference, and
     nothing else in this system can match that sentence to a consignment.
     Both optional: a walk-in with a taxi full of boxes has neither, and a
     driver at the door must not be held up by a field. */
  supplierName: z.string().trim().max(120, "Keep the supplier name short.").optional(),
  supplierRef: z.string().trim().max(60, "Keep the supplier reference short.").optional(),
  receivedAt: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  unit: z.enum(["CM", "M"]),
});


/**
 * THE GUANGZHOU COUNTER, IN ONE ACT.
 *
 * A supplier's driver is at the door with the boxes on the floor. Everything
 * that has to happen — the customer, the consignment, every item line, the
 * measurements, the receiving record, the reference, the delivery note and the
 * customer's notification — happens here, in one transaction, from one form.
 *
 * The flow this replaces made a clerk register a consignment on one screen,
 * find it again on a second and receive it on a third. That is three screens
 * for one physical event, and the gaps between them are where a half-entered
 * consignment lives. This cannot half-happen: either the cargo exists with its
 * note and its notification, or nothing was written at all.
 *
 * ONE RECEIPT, MANY ITEMS. The paper book records a delivery, and a delivery is
 * routinely a ladder, a washing machine and fifty tubes of toothpaste. Each is
 * its own line with its own measurement, because that is what the packing list
 * has to print and what Finance later prices.
 *
 * A customer not yet on the system is created here. Turning a driver away
 * because the office has not registered somebody is not a thing a warehouse can
 * do.
 */
export async function receiveNewCargo(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("receiving.china");

  /*
    ONE PRESS, ONE CONSIGNMENT.

    The form carries a key made when it was opened. A retry after a timeout the
    server had already answered — a warehouse phone on a bad connection does
    this — arrives with the same key, and is told about the consignment that
    already exists instead of taking the same boxes in a second time.
  */
  const intakeKey = String(formData.get("intakeKey") ?? "").trim() || null;
  if (intakeKey) {
    const already = await prisma.cargo.findUnique({
      where: { intakeKey },
      select: { id: true, reference: true, deliveryNote: { select: { number: true } } },
    });
    if (already) {
      return {
        ok: `${already.reference} was already received.`,
        id: already.id,
        reference: already.reference,
        noteNumber: already.deliveryNote?.number,
      } as ActionState;
    }
  }

  /* The book number is written per item now, so the consignment takes the
     first of them — one delivery still answers to one number in a search, on
     the timeline and on the delivery note. */
  const headlineNote =
    formData.getAll("itemReceiptNo").map(String).find((v) => v.trim()) ?? "";

  const parsed = intakeSchema.safeParse({
    customerId: formData.get("customerId") || undefined,
    newCustomerName: formData.get("newCustomerName") || undefined,
    newCustomerPhone: formData.get("newCustomerPhone") || undefined,
    shippingMark: formData.get("shippingMark") || undefined,
    paperReceiptNo: headlineNote || undefined,
    location: formData.get("location") || undefined,
    supplierName: formData.get("supplierName") || undefined,
    supplierRef: formData.get("supplierRef") || undefined,
    receivedAt: formData.get("receivedAt") || undefined,
    notes: formData.get("notes") || undefined,
    unit: formData.get("unit") || "CM",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  if (!data.customerId && !data.newCustomerName) {
    return { error: "Choose a customer, or enter a new one." };
  }
  if (!data.customerId && !data.newCustomerPhone) {
    return { error: "A new customer needs a phone number." };
  }

  /* The rules are in lib/intake-lines.ts, beside the ones about the item rows. */
  const dated = readReceivingDate(data.receivedAt);
  if ("error" in dated) return { error: dated.error };
  const { receivedAt, backdated } = dated;

  /* An id off a form is a claim, not a customer. A stale tab, a merged record
     or a customer removed while the counter was busy all arrive here as a
     string that looks fine; without this the transaction fails halfway with
     "That did not save" and the clerk retypes the whole delivery. */
  if (data.customerId) {
    const chosen = await prisma.customer.findFirst({
      where: { id: data.customerId, deletedAt: null },
      select: { id: true },
    });
    if (!chosen) {
      return {
        error:
          "That customer is no longer on the books. Search for them again, or enter them as new.",
      };
    }
  }

  const { lines, error: lineError } = readIntakeLines(formData);
  if (lineError) return { error: lineError };
  if (lines.length === 0) {
    return { error: "Add at least one item — what did the driver bring?" };
  }

  /*
    THE WAREHOUSE IS NOT A QUESTION.

    A clerk in Guangzhou is standing in the Guangzhou warehouse; asking which
    one only creates the possibility of the wrong answer, and a receiving record
    filed against the wrong floor is invisible to the people holding the boxes.
    It comes off the person's own posting, and failing that off the single live
    China warehouse. If there genuinely are several and this user belongs to
    none, that is an administrator's problem to fix, not a dropdown to guess at.
  */
  const warehouse =
    (actor.warehouseId
      ? await prisma.warehouse.findFirst({
          where: { id: actor.warehouseId, active: true, kind: "CHINA" },
          select: { id: true, name: true },
        })
      : null) ??
    (await prisma.warehouse.findFirst({
      where: { active: true, kind: "CHINA" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }));

  if (!warehouse) {
    return {
      error:
        "No China warehouse is set up to receive against. An administrator has to add one first.",
    };
  }

  /* Files are written before the transaction opens. An upload from a warehouse
     phone is slow and can fail on its own terms; holding row locks across it
     would block the counter for everybody else. */
  const files = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);

  /*
    NO PHOTOGRAPH, NO RECEIPT.

    The picture is the only evidence of what the boxes looked like when they
    were handed over, and it is the thing the customer opens when they track.
    Asked for politely, it was skipped on the busy days — which are exactly the
    days a consignment is later argued about. It is a condition of receiving.
  */
  if (files.length === 0) {
    return {
      error:
        "Take at least one photo of the goods before confirming. The picture is what the customer sees when they track, and the only record of how the boxes arrived.",
    };
  }

  const stored: string[] = [];
  try {
    for (const file of files) stored.push(await store(file, "cargo"));
  } catch (error) {
    return {
      error: error instanceof UploadError ? error.message : "That upload failed.",
    };
  }

  const unit = data.unit as MeasurementUnit;

  /*
    THE TYPED VOLUME WINS.

    The paper book has one "Dimension (CBM)" column and the clerk writes the
    figure straight into it — often measured with a tape at the pallet rather
    than derived from three sides of a box that is not a box. Length, width and
    height stay available for the cases where a clerk would rather have the
    system multiply, and are used only when no volume was typed.
  */
  /*
    BOTH LANGUAGES, FROM WHAT WAS TYPED.

    Guangzhou types the goods in Chinese; Dar reads them in English. The
    glossary fills whichever is missing when it knows the term, and a line the
    clerk described twice teaches it. Never fatal — a description saved in one
    language is still a box somebody can identify.
  */
  for (const line of lines) {
    const both = await bilingual(line.description, line.descriptionZh).catch(() => null);
    if (both) {
      line.description = both.en ?? both.zh ?? line.description;
      line.descriptionZh = both.zh;
    }
  }

  const measured = lines.map((line) => {
    const typed =
      line.cbm !== null && line.cbm > 0 ? new Prisma.Decimal(line.cbm) : null;
    const derived = calculateCbm({
      length: line.length,
      width: line.width,
      height: line.height,
      quantity: line.quantity,
      unit,
    });

    /* A figure that three sides do not account for is marked as hand-entered,
       and stays marked for the life of the line. Nothing is forbidden by it —
       a pallet of engine parts has no three sides — but Dar and Finance can see
       at a glance which volumes came off a tape measure and which off a note,
       and an argument about a bill starts from that. */
    const byHand = typed !== null && (derived === null || !derived.equals(typed));

    return {
      line,
      cbm: typed ?? derived ?? new Prisma.Decimal(0),
      byHand,
    };
  });

  /*
    WHAT THE BOOK SAYS IT IS WORTH, WORKED OUT HERE AND STORED WITH THE RECORD.

    The clerk is not asked and is not shown. They record what arrived; the
    system already knows the rate for that cargo type, so nobody types a price,
    picks a rate or opens a calculator.

    Read before the transaction, for the reason loadRateBook gives, and never
    fatal: a consignment that failed to save is a box nobody can find, while a
    consignment saved without an estimate is a figure the office can recompute
    from the same book any time it opens the record.
  */
  const book = await loadRateBook({
    service: "LCL",
    /* A rate agreed with this customer beats the published one. A customer
       being created at this counter has no agreed rates yet by definition. */
    customerId: data.customerId || undefined,
  }).catch(() => null);

  const valuation = book
    ? valueWith(
        book,
        measured.map((m, index) => ({
          reference: `Line ${index + 1}`,
          paperReceiptNo: m.line.paperReceiptNo,
          description: m.line.description,
          descriptionZh: m.line.descriptionZh,
          cargoType: m.line.cargoType,
          quantity: m.line.quantity,
          pieces: m.line.pieces,
          cbm: m.cbm,
          weightKg:
            m.line.weightKg !== null ? new Prisma.Decimal(m.line.weightKg) : null,
        }))
      )
    : null;

  const totalCbm = measured.reduce(
    (sum, m) => sum.add(m.cbm),
    new Prisma.Decimal(0)
  );
  const totalPackages = lines.reduce((sum, l) => sum + l.quantity, 0);
  const totalPieces = lines.reduce((sum, l) => sum + (l.pieces ?? 0), 0);
  const totalWeight = lines.reduce(
    (sum, l) => sum.add(l.weightKg ?? 0),
    new Prisma.Decimal(0)
  );

  let result: { reference: string; noteNumber: string; id: string };

  try {
    result = await prisma.$transaction(async (tx) => {
      // --- the customer ---------------------------------------------------
      let customerId = data.customerId ?? "";
      if (!customerId) {
        const phone = normaliseTzPhone(data.newCustomerPhone!);
        if (!phone) throw new Error("Enter the customer's Tanzanian mobile number: +255 and nine digits.");
        const existing = await tx.customer.findFirst({
          where: { phone, deletedAt: null },
          select: { id: true },
        });
        if (existing) {
          /* Already on the books, reached by number rather than by name.
             Attaching to them keeps one history instead of two. */
          customerId = existing.id;
        } else {
          const code = await nextCustomerCode(tx);
          const created = await tx.customer.create({
            data: {
              code,
              fullName: data.newCustomerName!,
              phone,
              country: "Tanzania",
              /* The mark is the customer's own trading name, as written on the
                 boxes — not something this system invents. Only when nobody
                 supplies one do we fall back to a generated mark. */
              shippingMark:
                await shippingMarkFor(tx, data.newCustomerName!, code, data.shippingMark),
            },
          });
          customerId = created.id;
        }
      }

      const customer = await tx.customer.findUniqueOrThrow({
        where: { id: customerId },
        select: { id: true, code: true, fullName: true, phone: true, shippingMark: true },
      });

      /* A mark typed at the counter wins: the clerk is looking at the box. */
      const mark = data.shippingMark || customer.shippingMark;
      if (data.shippingMark && data.shippingMark !== customer.shippingMark) {
        await tx.customer.update({
          where: { id: customer.id },
          data: { shippingMark: data.shippingMark },
        });
      }

      /*
        WHO DROPPED THE BOXES OFF.

        Matched on the name the clerk typed rather than picked from a list of
        ids, because the supplier is written on the delivery note in the
        driver's handwriting and the counter should not have to go and register
        a factory first. An existing name attaches; a new one is created here,
        the same trade the customer beside it makes.

        Matched case-insensitively and on the whole name: "Guangzhou Leather
        Factory" typed twice in two capitalisations is one factory, and two rows
        for it means a customer chasing their supplier matches neither.
      */
      let supplierId: string | null = null;
      if (data.supplierName) {
        const existing = await tx.supplier.findFirst({
          where: { name: { equals: data.supplierName, mode: "insensitive" } },
          select: { id: true },
        });
        supplierId =
          existing?.id ??
          (await tx.supplier.create({
            data: { name: data.supplierName },
            select: { id: true },
          })).id;
      }

      // --- the consignment ------------------------------------------------
      const reference = await nextCargoReference(tx);
      const summary =
        lines.length === 1
          ? lines[0].description
          : `${lines[0].description} and ${lines.length - 1} more`;
      const summaryZh = lines[0].descriptionZh
        ? lines.length === 1
          ? lines[0].descriptionZh
          : `${lines[0].descriptionZh} 等${lines.length}项`
        : null;

      const cargo = await tx.cargo.create({
        data: {
          reference,
          qrToken: generateQrToken(),
          senderId: customer.id,
          receiverId: customer.id,
          shippingMark: mark,
          paperReceiptNo: data.paperReceiptNo || null,
          supplierId,
          supplierRef: data.supplierRef || null,
          service: "LCL",
          intakeKey,
          description: summary,
          descriptionZh: summaryZh,
          declaredPackages: totalPackages,
          declaredCbm: totalCbm,
          notes: data.notes || null,
          status: "RECEIVED_CHINA",
          createdById: actor.id,
          ...(valuation
            ? {
                estimatedValue: valuation.subtotal,
                estimatedCurrency: valuation.currency,
                estimatedAt: new Date(),
                valuationSnapshot: {
                  pricedOn: new Date().toISOString(),
                  currency: valuation.currency,
                  subtotal: valuation.subtotal.toString(),
                  unpriced: valuation.unpriced,
                  lines: valuation.lines.map((v, index) => ({
                    line: index + 1,
                    description: v.description,
                    cargoType: v.cargoType,
                    quantity: v.quantity,
                    pieces: v.pieces,
                    cbm: v.cbm.toString(),
                    weightKg: v.weightKg?.toString() ?? null,
                    rate: v.rate?.toString() ?? null,
                    basis: v.basis,
                    amount: v.amount.toString(),
                    blocked: v.blocked,
                  })),
                },
              }
            : {}),
        },
      });

      /* Registered and received in the same breath, because they happened in
         the same breath. Both lines are written so the timeline reads as a
         sequence rather than starting halfway through.

         DATED WHEN THE BOXES CAME IN, NOT WHEN THEY WERE TYPED UP. This is the
         timeline the customer reads, and it has to agree with the note in their
         hand. The pair is kept a millisecond apart so a list ordered by time
         cannot put "received" before "registered". That the row was written
         later, and by whom, is in the audit log, which is where a backdate is
         looked for. */
      await tx.cargoStatusHistory.createMany({
        data: [
          {
            cargoId: cargo.id,
            to: "REGISTERED",
            actorId: actor.id,
            createdAt: receivedAt,
          },
          {
            cargoId: cargo.id,
            from: "REGISTERED",
            to: "RECEIVED_CHINA",
            reason: data.paperReceiptNo
              ? `Received at Guangzhou against note ${data.paperReceiptNo}`
              : "Received at the Guangzhou warehouse",
            actorId: actor.id,
            createdAt: new Date(receivedAt.getTime() + 1),
          },
        ],
      });

      await tx.cargoPackage.createMany({
        data: measured.map((m, index) => ({
          cargoId: cargo.id,
          reference: packageReference(reference, index + 1),
          packageType: m.line.packageType,
          description: m.line.description,
          descriptionZh: m.line.descriptionZh,
          cargoType: m.line.cargoType,
          quantity: m.line.quantity,
          pieces: m.line.pieces,
          unit,
          length: m.line.length,
          width: m.line.width,
          height: m.line.height,
          weightKg: m.line.weightKg,
          netWeightKg: m.line.netWeightKg,
          modelNo: m.line.modelNo,
          declaredUnitValue: m.line.declaredUnitValue,
          paperReceiptNo: m.line.paperReceiptNo,
          cbm: m.cbm,
          cbmOverridden: m.byHand,
        })),
      });
      /* One box row, and one label code, for every carton just counted. */
      await syncCargoBoxes(tx, cargo.id);

      await tx.chinaReceiving.create({
        data: {
          cargoId: cargo.id,
          warehouseId: warehouse.id,
          packagesCount: totalPackages,
          piecesCount: totalPieces > 0 ? totalPieces : null,
          weightKg: totalWeight.greaterThan(0) ? totalWeight : null,
          cbm: totalCbm,
          /* Damage is reported as a case, with photographs, by the person who
             saw it — not chosen from a dropdown at the moment of receiving. */
          condition: "GOOD",
          location: data.location || null,
          notes: data.notes || null,
          receivedAt,
          receivedById: actor.id,
        },
      });

      if (stored.length > 0) {
        await tx.cargoPhoto.createMany({
          data: stored.map((url) => ({
            cargoId: cargo.id,
            /* The counter's photographs are the customer's: the boxes and
               their mark, shown on tracking. Evidence of damage or a
               discrepancy is filed under its own kinds and stays internal. */
            kind: "PACKAGE" as const,
            url,
            warehouseKind: "CHINA" as const,
            uploadedById: actor.id,
          })),
        });
      }

      // --- the paper ------------------------------------------------------
      const noteNumber = await nextDeliveryNoteNumber(tx);
      await tx.deliveryNote.create({
        data: {
          number: noteNumber,
          cargoId: cargo.id,
          issuedById: actor.id,
          snapshot: {
            cargoReference: reference,
            paperReceiptNo: data.paperReceiptNo ?? null,
            shippingMark: mark,
            sender: {
              name: customer.fullName,
              phone: customer.phone,
              code: customer.code,
            },
            receiver: { name: customer.fullName, phone: customer.phone },
            supplier: data.supplierName || null,
            supplierRef: data.supplierRef || null,
            description: summary,
            warehouse: warehouse.name,
            location: data.location || null,
            receivedAt: receivedAt.toISOString(),
            packagesCount: totalPackages,
            piecesCount: totalPieces > 0 ? totalPieces : null,
            weightKg: totalWeight.greaterThan(0) ? totalWeight.toString() : null,
            cbm: totalCbm.toString(),
            condition: "GOOD",
            lines: measured.map((m, index) => ({
              reference: packageReference(reference, index + 1),
              type: m.line.packageType,
              description: m.line.description,
              descriptionZh: m.line.descriptionZh,
              cargoType: m.line.cargoType,
              quantity: m.line.quantity,
              pieces: m.line.pieces,
              unit,
              length: m.line.length?.toString() ?? null,
              width: m.line.width?.toString() ?? null,
              height: m.line.height?.toString() ?? null,
              cbm: m.cbm.toString(),
              weightKg: m.line.weightKg?.toString() ?? null,
              balerNumber: null,
            })),
          },
        },
      });

      // --- tell the customer ----------------------------------------------
      await notifyCustomer(
        [customer.id],
        {
          kind: "cargo.received_china",
          title: `${reference} received at our China warehouse`,
          body: `${totalPackages} package(s) received in Guangzhou. It will wait here until it is loaded into a container — we will tell you when it sails.`,
          href: `/portal/cargo/${reference}`,
        },
        tx
      );

      return { reference, noteNumber, id: cargo.id };
    });
  } catch (error) {
    /* Both presses got through at once: one of them created it, and the key's
       unique index caught the other. Answer with the consignment that exists. */
    if (
      intakeKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const already = await prisma.cargo.findUnique({
        where: { intakeKey },
        select: { id: true, reference: true, deliveryNote: { select: { number: true } } },
      });
      if (already) {
        return {
          ok: `${already.reference} was already received.`,
          id: already.id,
          reference: already.reference,
          noteNumber: already.deliveryNote?.number,
        } as ActionState;
      }
    }
    return {
      error: formMessage(error, "That did not save. Try again."),
    };
  }

  await recordAudit({
    actor,
    action: "cargo.receive.intake",
    entity: "Cargo",
    entityId: result.id,
    /* A DAY OTHER THAN TODAY IS SAID OUT LOUD.
       The receiving date is the customer's timeline and it may legitimately be
       last Thursday's page of the book. It is also the one field at this
       counter somebody could move to make a consignment look older or newer
       than it is, so when it is not today the summary says so in words — the
       audit log is read as sentences, and a date buried in metadata is a date
       nobody notices. */
    summary: `Received ${result.reference} at the counter — ${lines.length} item line(s), ${totalPackages} package(s), ${totalCbm} CBM; note ${result.noteNumber}${
      data.paperReceiptNo ? `, book ${data.paperReceiptNo}` : ""
    }${
      backdated
        ? `; dated ${receivedAt.toISOString().slice(0, 10)}, entered today`
        : ""
    }${data.supplierName ? `; from ${data.supplierName}` : ""}`,
    metadata: {
      packages: totalPackages,
      pieces: totalPieces,
      cbm: totalCbm.toString(),
      lines: lines.length,
      photos: stored.length,
      paperReceiptNo: data.paperReceiptNo ?? null,
      receivedAt: receivedAt.toISOString(),
      enteredAt: new Date().toISOString(),
      backdated,
      supplier: data.supplierName ?? null,
      supplierRef: data.supplierRef ?? null,
    },
  });

  revalidatePath("/app/inventory");
  /* The loading bay draws its floor list from the same rows. A consignment
     received while a clerk had the container open was invisible to them until
     they reloaded by hand, and cargo nobody can see is cargo nobody loads. */
  revalidatePath("/app/containers/loading");
  revalidatePath("/app/dashboard");

  return {
    ok: `${result.reference} received — ${totalPackages} package(s), ${totalCbm.toFixed(3)} CBM. Delivery note ${result.noteNumber} is ready and the customer has been told.`,
    id: result.id,
  };
}

// ---------------------------------------------------------------------------
// Corrections after receiving
// ---------------------------------------------------------------------------

const optionalNumber = (raw: FormDataEntryValue | null) => {
  const text = String(raw ?? "").trim();
  return text === "" ? null : Number(text);
};

/**
 * Dar corrects its own count: packages, pieces, weight and volume on the Dar
 * receiving row. China's totals are not reachable from here. A draft bill is
 * re-priced afterwards, because an untyped consignment is billed on these.
 * The rules are in lib/cargo-corrections.ts.
 */
export async function correctDarMeasurement(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("cargo.edit");

  const cargoId = String(formData.get("cargoId") ?? "");
  const packagesCount = Number(String(formData.get("packagesCount") ?? "").trim());
  const piecesCount = optionalNumber(formData.get("piecesCount"));
  const weightKg = optionalNumber(formData.get("weightKg"));
  const cbm = optionalNumber(formData.get("cbm"));

  if (!Number.isInteger(packagesCount) || packagesCount < 0) {
    return { error: "Count the packages." };
  }
  if (piecesCount !== null && (!Number.isInteger(piecesCount) || piecesCount < 0)) {
    return { error: "Pieces is a whole number." };
  }
  for (const value of [weightKg, cbm]) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      return { error: "Weight and volume cannot be below zero." };
    }
  }

  try {
    const result = await prisma.$transaction((tx) =>
      applyDarMeasurement(tx, actor, {
        cargoId,
        packagesCount,
        piecesCount,
        weightKg,
        cbm,
        reason: String(formData.get("reason") ?? ""),
      })
    );
    await repriceDraftsAfterCorrection(
      actor,
      cargoId,
      String(formData.get("reason") ?? "").trim() || "Dar's count corrected"
    );
    revalidatePath(`/app/cargo/${cargoId}`);
    revalidatePath("/app/receive/dar");
    if (result.caseRef) revalidatePath("/app/exceptions");
    return {
      ok: result.caseRef
        ? `Dar's count corrected. Case ${result.caseRef} opened on the difference.`
        : result.unverified
          ? "Dar's count corrected. It needs verifying again."
          : "Dar's count corrected.",
    };
  } catch (error) {
    if (error instanceof CorrectionRefused) return { error: error.message };
    throw error;
  }
}

/**
 * Who the consignment belongs to and what it is: receiver, sender, mark,
 * description, cargo types, receipt number and notes. Never a measurement.
 * The rules are in lib/cargo-corrections.ts.
 */
export async function updateCargoDetails(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("cargo.edit");

  const cargoId = String(formData.get("cargoId") ?? "");
  const text = (name: string) => {
    const value = formData.get(name);
    return value === null ? null : String(value);
  };

  const lineTypes: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("lineType:")) lineTypes[key.slice("lineType:".length)] = String(value);
  }

  try {
    const allowedTypes = await cargoTypeOptions();
    const result = await prisma.$transaction((tx) =>
      applyCargoDetails(tx, actor, {
        cargoId,
        receiverId: String(formData.get("receiverId") ?? ""),
        senderId: String(formData.get("senderId") ?? ""),
        shippingMark: text("shippingMark"),
        description: String(formData.get("description") ?? ""),
        commodity: text("commodity"),
        paperReceiptNo: text("paperReceiptNo"),
        notes: text("notes"),
        /* Absent from the form for a desk that cannot read them, and absent
           means leave alone — never "clear". */
        internalNotes: formData.has("internalNotes") ? text("internalNotes") : undefined,
        lineTypes,
        allowedTypes,
        reason: String(formData.get("reason") ?? ""),
      })
    );
    if (result.changes.some((c) => c.field === "cargoType")) {
      /* Raises the draft where Dar counted the cargo before it had a type the
         book could price, and re-prices the one already there otherwise. */
      await priceOnCheckIn(actor, [cargoId], {
        reason: String(formData.get("reason") ?? "").trim() || "Cargo type corrected",
      });
    }
    revalidatePath(`/app/cargo/${cargoId}`);
    for (const customerId of result.customers) {
      revalidatePath(`/app/customers/${customerId}`);
    }
    return { ok: `${result.reference} updated.` };
  } catch (error) {
    if (error instanceof CorrectionRefused) return { error: error.message };
    throw error;
  }
}
