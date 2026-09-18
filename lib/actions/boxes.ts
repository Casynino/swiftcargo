"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { parseScan } from "@/lib/qr";
import { checkRelease, RELEASE_INCLUDE } from "@/lib/release";
import { recordScan, resolveScanToken } from "@/lib/scan";
import { authorize, authorizeAny } from "@/lib/session";
import { store, UploadError } from "@/lib/storage";

export type BoxScanState = {
  error?: string;
  warning?: string;
  ok?: string;
  /** What was scanned, for the list under the scanner. */
  last?: { reference: string; sequence: number; of: number; customer: string };
  /** Progress on whatever the scanner is working through. */
  progress?: { done: number; total: number };
  at?: number;
};

const when = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Dar_es_Salaam",
  }).format(d);

/**
 * DAR BOOKS A BOX IN BY SCANNING IT.
 *
 * One scan, one box: the box is marked as arrived, against this container, by
 * this person, and the scanner is ready for the next. A box that belongs to a
 * different container, that was never loaded, that Dar already scanned, or that
 * has been handed over is not quietly accepted — the clerk is told exactly
 * which, and the scan is written to the box's history either way.
 *
 * It records arrival only. Checking the consignment in — the counts, the
 * review, the case for a shortage — stays with the check-in form, which now
 * shows how many of each consignment's boxes have been scanned.
 */
export async function scanBoxAtDar(
  _prev: BoxScanState,
  formData: FormData
): Promise<BoxScanState> {
  const actor = await authorize("receiving.dar");
  const containerId = String(formData.get("containerId") ?? "");
  const raw = String(formData.get("code") ?? "").trim();
  const at = Date.now();
  if (!raw) return { error: "Scan a box label.", at };

  const parsed = parseScan(raw);
  const token = "token" in parsed ? parsed.token : parsed.text;
  const scanned = "token" in parsed ? await resolveScanToken(parsed.token) : null;

  const progress = async () => {
    const [done, total] = await Promise.all([
      prisma.cargoBox.count({
        where: { voidedAt: null, darReceivedAt: { not: null }, darContainerId: containerId },
      }),
      prisma.cargoBox.count({
        where: { voidedAt: null, package: { containerId, deletedAt: null } },
      }),
    ]);
    return { done, total };
  };

  const log = (result: "ok" | "warning" | "refused" | "unknown", action: string, detail: string | null) =>
    recordScan({
      token,
      user: actor,
      workflow: "dar-receiving",
      action,
      result,
      detail,
      boxId: scanned?.box?.id ?? null,
      cargoId: scanned?.cargoId ?? null,
      containerId,
    });

  if (!scanned) {
    await log("unknown", "not-found", "No box has this code.");
    return { error: "That code is not a Swift Cargo box. Check the label, or type the tracking number to search.", at };
  }
  if (!scanned.box) {
    await log("refused", "not-a-box", "A consignment or pickup-note code, not a box.");
    return {
      error: `That is the ${scanned.reference} consignment code, not a box label. Scan the sticker on the box itself.`,
      at,
    };
  }

  const box = await prisma.cargoBox.findUniqueOrThrow({
    where: { id: scanned.box.id },
    include: {
      cargo: { select: { reference: true, sender: { select: { fullName: true } } } },
      package: { select: { containerId: true, container: { select: { reference: true } } } },
    },
  });
  const last = {
    reference: box.cargo.reference,
    sequence: box.sequence,
    of: scanned.box.of,
    customer: box.cargo.sender.fullName,
  };

  if (box.voidedAt) {
    await log("refused", "voided", "This box was taken off its line in Guangzhou.");
    return { error: `${box.cargo.reference} box ${box.sequence} was taken off its line in Guangzhou — this label should not be on a box.`, last, at };
  }
  if (box.collectedAt) {
    await log("refused", "already-collected", null);
    return { error: `${box.cargo.reference} box ${box.sequence} was handed over on ${when(box.collectedAt)}. It cannot be received again.`, last, at };
  }
  if (box.darReceivedAt) {
    await log("warning", "already-received", null);
    return { warning: `${box.cargo.reference} box ${box.sequence} of ${scanned.box.of} was already received on ${when(box.darReceivedAt)}.`, last, progress: await progress(), at };
  }

  const wrongContainer = box.package.containerId !== containerId;
  await prisma.cargoBox.update({
    where: { id: box.id },
    data: { darReceivedAt: new Date(), darReceivedById: actor.id, darContainerId: containerId },
  });

  if (wrongContainer) {
    const expected = box.package.container?.reference;
    const detail = expected
      ? `Loaded in ${expected}, found in this container.`
      : "Not loaded in any container, found in this one.";
    await log("warning", "received-unexpected", detail);
    return {
      warning: `Received ${box.cargo.reference} box ${box.sequence} — but it was not expected here. ${detail} Tell the manager.`,
      last,
      progress: await progress(),
      at,
    };
  }

  await log("ok", "received", null);
  revalidatePath(`/app/cargo/${box.cargoId}`);
  return {
    ok: `Received ${box.cargo.reference} box ${box.sequence} of ${scanned.box.of} — ${box.cargo.sender.fullName}.`,
    last,
    progress: await progress(),
    at,
  };
}

/**
 * A BOX IS DAMAGED.
 *
 * Written on the box itself — who saw it, when, what they saw, with a photo
 * when there is one — and on the consignment's history. The box stays in the
 * system and keeps its code; it can still be received and handed over.
 */
export async function markBoxDamaged(
  _prev: BoxScanState,
  formData: FormData
): Promise<BoxScanState> {
  const actor = await authorizeAny(["receiving.dar", "receiving.china"]);
  const boxId = String(formData.get("boxId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (note.length < 3) return { error: "Say what is wrong with the box." };

  const box = await prisma.cargoBox.findUnique({
    where: { id: boxId },
    include: { cargo: { select: { id: true, reference: true } } },
  });
  if (!box || box.voidedAt) return { error: "That box is no longer on the consignment." };

  const files = formData.getAll("photo").filter((f): f is File => f instanceof File && f.size > 0);
  const urls: string[] = [];
  try {
    for (const file of files.slice(0, 4)) urls.push(await store(file, "cargo"));
  } catch (error) {
    return { error: error instanceof UploadError ? error.message : "That photo did not upload." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.cargoBox.update({
      where: { id: box.id },
      data: {
        damagedAt: box.damagedAt ?? new Date(),
        damagedById: actor.id,
        damageNote: box.damageNote ? `${box.damageNote}\n${note}` : note,
      },
    });
    for (const url of urls) {
      await tx.cargoPhoto.create({
        data: {
          cargoId: box.cargo.id,
          url,
          kind: "DAMAGE",
          caption: `Box ${box.sequence}: ${note}`.slice(0, 200),
          uploadedById: actor.id,
        },
      });
    }
  });

  await recordScan({
    token: box.qrToken,
    user: actor,
    workflow: "damage",
    action: "marked-damaged",
    result: "ok",
    detail: note,
    boxId: box.id,
    cargoId: box.cargo.id,
  });
  await recordAudit({
    actor,
    action: "cargo.box.damaged",
    entity: "Cargo",
    entityId: box.cargo.id,
    summary: `Box ${box.sequence} of ${box.cargo.reference} reported damaged: ${note}`,
    metadata: { boxId: box.id, photos: urls.length },
  });
  revalidatePath(`/app/cargo/${box.cargo.id}`);
  return { ok: `Box ${box.sequence} marked damaged.` };
}

/**
 * A BOX THE PACKING LIST PROMISED AND THE FLOOR CANNOT FIND.
 *
 * Marked, never deleted: the box, its code and its line stay exactly where
 * they were so the question can be answered later. Scanning it afterwards
 * still receives it, and both facts stay on the record.
 */
export async function markBoxMissing(
  _prev: BoxScanState,
  formData: FormData
): Promise<BoxScanState> {
  const actor = await authorize("receiving.dar");
  const boxId = String(formData.get("boxId") ?? "");
  const box = await prisma.cargoBox.findUnique({
    where: { id: boxId },
    include: { cargo: { select: { id: true, reference: true } } },
  });
  if (!box || box.voidedAt) return { error: "That box is no longer on the consignment." };
  if (box.darReceivedAt) return { error: `Box ${box.sequence} was scanned in at Dar — it is not missing.` };
  if (box.missingAt) return { ok: `Box ${box.sequence} is already marked missing.` };

  await prisma.cargoBox.update({
    where: { id: box.id },
    data: { missingAt: new Date(), missingById: actor.id },
  });
  await recordAudit({
    actor,
    action: "cargo.box.missing",
    entity: "Cargo",
    entityId: box.cargo.id,
    summary: `Box ${box.sequence} of ${box.cargo.reference} reported missing at Dar`,
    metadata: { boxId: box.id },
  });
  revalidatePath(`/app/cargo/${box.cargo.id}`);
  return { ok: `Box ${box.sequence} marked missing. It stays on the record until it is found or the case is settled.` };
}

/**
 * HANDING OVER, ONE BOX AT A TIME.
 *
 * The customer is at the counter with a pickup note; each box is scanned as it
 * is carried out. The box must belong to this consignment, the consignment
 * must still pass the release check — paid or on credit, not held, note live —
 * and the box must not have gone already. Completing the release afterwards
 * needs every box that came in to have been scanned out this way.
 */
export async function scanBoxForRelease(
  _prev: BoxScanState,
  formData: FormData
): Promise<BoxScanState> {
  const actor = await authorize("release.execute");
  const cargoId = String(formData.get("cargoId") ?? "");
  const raw = String(formData.get("code") ?? "").trim();
  const at = Date.now();
  if (!raw) return { error: "Scan a box label.", at };

  const parsed = parseScan(raw);
  const token = "token" in parsed ? parsed.token : parsed.text;
  const scanned = "token" in parsed ? await resolveScanToken(parsed.token) : null;
  const log = (result: "ok" | "warning" | "refused" | "unknown", action: string, detail: string | null) =>
    recordScan({
      token,
      user: actor,
      workflow: "release",
      action,
      result,
      detail,
      boxId: scanned?.box?.id ?? null,
      cargoId: scanned?.cargoId ?? cargoId,
    });

  if (!scanned?.box) {
    await log(scanned ? "refused" : "unknown", scanned ? "not-a-box" : "not-found", null);
    return { error: scanned ? "That is not a box label. Scan the sticker on the box." : "That code is not a Swift Cargo box.", at };
  }
  if (scanned.cargoId !== cargoId) {
    await log("refused", "wrong-consignment", `Belongs to ${scanned.reference}.`);
    return { error: `Stop — that box belongs to ${scanned.reference}, not to this pickup. Do not hand it over.`, at };
  }

  const cargo = await prisma.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    include: { ...RELEASE_INCLUDE, release: true },
  });
  if (!cargo) return { error: "That consignment no longer exists.", at };
  const check = checkRelease(cargo);
  if (!check.ok) {
    await log("refused", "not-releasable", check.blockedBy ?? null);
    return { error: check.blockedBy ?? "This consignment may not be released.", at };
  }

  const box = await prisma.cargoBox.findUniqueOrThrow({ where: { id: scanned.box.id } });
  if (box.voidedAt) {
    await log("refused", "voided", null);
    return { error: `Box ${box.sequence} was taken off its line — this label should not be on a box.`, at };
  }
  if (box.collectedAt) {
    await log("warning", "already-collected", null);
    return { warning: `Box ${box.sequence} was already handed over on ${when(box.collectedAt)}.`, at, progress: await releaseProgress(cargoId) };
  }

  const note = await prisma.pickupNote.findFirst({
    where: { cargoId, status: "ACTIVE" },
    select: { id: true },
  });
  await prisma.cargoBox.update({
    where: { id: box.id },
    data: { collectedAt: new Date(), collectedById: actor.id, pickupNoteId: note?.id ?? null },
  });
  await log("ok", "released", null);
  const progress = await releaseProgress(cargoId);
  revalidatePath(`/app/cargo/${cargoId}`);
  return {
    ok: `Box ${box.sequence} of ${scanned.box.of} handed over.${progress.done >= progress.total ? " Every box is out — complete the release." : ""}`,
    progress,
    at,
  };
}

async function releaseProgress(cargoId: string) {
  const [done, total] = await Promise.all([
    prisma.cargoBox.count({ where: { cargoId, voidedAt: null, collectedAt: { not: null } } }),
    prisma.cargoBox.count({ where: { cargoId, voidedAt: null } }),
  ]);
  return { done, total };
}
