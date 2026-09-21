"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, type CargoStatus } from "@prisma/client";

import { recordAudit, recordFieldChange } from "@/lib/audit";
import { setCargoStatus } from "@/lib/cargo";
import { announceDarArrival, announceIfReady } from "@/lib/clearance";
import { variance } from "@/lib/cbm";
import { nextExceptionReference } from "@/lib/ids";
import { notifyCustomer, notifyStaff, staffInDepartment } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { applyDarMeasurement, CorrectionRefused } from "@/lib/cargo-corrections";
import { advanceContainer } from "@/lib/actions/containers";
import {
  ConfirmationRefused,
  confirmContainerAtDar,
} from "@/lib/container-confirmation";
import { can } from "@/lib/rbac";
import {
  priceOnCheckIn,
  PriceListRefused,
  setWaitingCargoType,
} from "@/lib/price-confirmation";
import { acceptAsExpectedBy } from "@/lib/accept-as-expected";
import { authorize } from "@/lib/session";
import { store, UploadError } from "@/lib/storage";
import { cargoTypeOptions } from "@/lib/valuation";

export type ActionState = { error?: string; ok?: string; id?: string };

/** Where a first check-in at Dar may start from. */
const DAR_RECEIVABLE: CargoStatus[] = ["ARRIVED_TANZANIA", "MISSING_AT_DAR"];
const HANDED_OVER: CargoStatus[] = ["COLLECTED", "DELIVERED", "CANCELLED"];

const receiveSchema = z.object({
  cargoId: z.string().min(1),
  warehouseId: z.string().min(1, "Which warehouse?"),
  packagesCount: z.coerce.number().int().min(0, "Count the packages."),
  piecesCount: z.coerce.number().int().min(0).optional(),
  weightKg: z.coerce.number().min(0).optional(),
  cbm: z.coerce.number().min(0).optional(),
  condition: z.enum(["GOOD", "MINOR_DAMAGE", "DAMAGED", "WET", "REPACKED"]),
  location: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  discrepancyNotes: z.string().trim().optional(),
});

/**
 * Dar takes the boxes off the container.
 *
 * DAR'S FIGURES DO NOT OVERWRITE CHINA'S. They go in their own row, and the
 * difference between the two is computed for display — never resolved. The
 * system does not decide which warehouse was right; it shows both and lets a
 * person decide, which is the only reason anyone can reconstruct what happened
 * on the water.
 *
 * A short count, a damaged carton or a volume that has moved raises a case
 * automatically. Nothing here is left to somebody remembering to report it.
 */
export async function receiveInDar(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("receiving.dar");

  const parsed = receiveSchema.safeParse({
    cargoId: formData.get("cargoId"),
    warehouseId: formData.get("warehouseId"),
    packagesCount: formData.get("packagesCount"),
    piecesCount: formData.get("piecesCount") || undefined,
    weightKg: formData.get("weightKg") || undefined,
    cbm: formData.get("cbm") || undefined,
    condition: formData.get("condition") || "GOOD",
    location: formData.get("location") || undefined,
    notes: formData.get("notes") || undefined,
    discrepancyNotes: formData.get("discrepancyNotes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  const cargo = await prisma.cargo.findFirst({
    where: { id: data.cargoId, deletedAt: null },
    include: {
      chinaReceiving: true,
      containerLines: { include: { container: true } },
      darReceiving: true,
    },
  });
  if (!cargo) return { error: "That cargo no longer exists." };

  /*
    DAR RECEIVES WHAT HAS LANDED, AND ONLY THAT.

    A first check-in is for a consignment whose container has been recorded as
    arrived, or one reported missing that has turned up. Anything earlier is
    still in Guangzhou or on the water, and a Dar receiving row for it would put
    boxes nobody in Dar has seen into Dar's inventory — billable, and on the
    way to a pickup list. A consignment already handed over is past receiving:
    its count is corrected, not taken again, and it must never be moved back to
    "received".
  */
  if (!cargo.darReceiving && !DAR_RECEIVABLE.includes(cargo.status)) {
    return {
      error: `${cargo.reference} has not arrived at Dar. Record the container's arrival before checking it in.`,
    };
  }
  if (cargo.darReceiving && HANDED_OVER.includes(cargo.status)) {
    return {
      error: `${cargo.reference} has already been handed over. Correct Dar's count instead of receiving it again.`,
    };
  }

  const china = cargo.chinaReceiving;
  const containerId = cargo.containerLines.at(-1)?.containerId ?? null;

  /*
    A SECOND CHECK-IN IS A CORRECTION, AND IS RECORDED AS ONE.

    Check-in can be run again — the clerk re-counts a pallet, the scale is
    read again. Different figures go through the same rules as "Correct Dar's
    count": each moved field is written to FieldChange with the old value, a
    changed count un-verifies and opens a case when it now disagrees with China,
    and the draft bill is re-priced. Overwriting them silently took the only
    evidence of what came off the container with them.
  */
  const before = cargo.darReceiving;
  const sameNumber = (a: Prisma.Decimal | number | null, b: number | null | undefined) =>
    (a === null ? null : Number(a)) === (b ?? null);
  const recountReason =
    data.discrepancyNotes && data.discrepancyNotes.length >= 3
      ? data.discrepancyNotes
      : "Counted again at the Dar counter";
  const figuresMoved =
    !!before &&
    (before.packagesCount !== data.packagesCount ||
      !sameNumber(before.piecesCount, data.piecesCount) ||
      !sameNumber(before.weightKg, data.weightKg) ||
      !sameNumber(before.cbm, data.cbm));

  /*
    WHAT COUNTS AS A DISCREPANCY.

    A short or over count, or anything that is not in good condition. Weight and
    volume are deliberately NOT included: they move a little on every sailing —
    packing settles, scales differ — and a case raised on every consignment is a
    queue nobody reads. The figures are still shown side by side, and a person
    can raise a case on them.
  */
  const shortOrOver =
    !!china && china.packagesCount !== data.packagesCount;
  const damaged = data.condition !== "GOOD";
  const discrepancy = shortOrOver || damaged;

  /* A damage claim is argued from the Guangzhou photograph and the Dar one of
     the same bale, so the picture is taken at the bench where the damage is
     found and filed on the consignment and on the case in the same save.
     Written before the transaction, for the reason receiving in China gives:
     a slow upload must not hold row locks. */
  const photos = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const stored: string[] = [];
  try {
    for (const file of photos) stored.push(await store(file, "cargo"));
  } catch (error) {
    return {
      error: error instanceof UploadError ? error.message : "That upload failed.",
    };
  }

  let result: { receiving: { id: string }; caseRef: string | null };
  try {
    result = await prisma.$transaction(async (tx) => {
      const recount = figuresMoved
        ? await applyDarMeasurement(tx, actor, {
            cargoId: cargo.id,
            packagesCount: data.packagesCount,
            piecesCount: data.piecesCount ?? null,
            weightKg: data.weightKg ?? null,
            cbm: data.cbm ?? null,
            reason: recountReason,
          })
        : null;

      if (before) {
        const was: Record<string, string | null> = {
          warehouseId: before.warehouseId,
          condition: before.condition,
          location: before.location,
          notes: before.notes,
          discrepancyNotes: before.discrepancyNotes,
        };
        const now: Record<string, string | null> = {
          warehouseId: data.warehouseId,
          condition: data.condition,
          location: data.location || null,
          notes: data.notes || null,
          discrepancyNotes: data.discrepancyNotes || null,
        };
        for (const field of Object.keys(was)) {
          if (was[field] !== now[field]) {
            await recordFieldChange(
              {
                actor,
                entity: "DarReceiving",
                entityId: before.id,
                field,
                oldValue: was[field],
                newValue: now[field],
                reason: "Received again at the Dar counter",
              },
              tx
            );
          }
        }
      }

      const receiving = await tx.darReceiving.upsert({
        where: { cargoId: cargo.id },
        create: {
          cargoId: cargo.id,
          warehouseId: data.warehouseId,
          containerId,
          packagesCount: data.packagesCount,
          piecesCount: data.piecesCount ?? null,
          weightKg: data.weightKg ?? null,
          cbm: data.cbm ?? null,
          condition: data.condition,
          discrepancy,
          discrepancyNotes: data.discrepancyNotes || null,
          location: data.location || null,
          notes: data.notes || null,
          receivedById: actor.id,
        },
        update: {
          warehouseId: data.warehouseId,
          containerId,
          packagesCount: data.packagesCount,
          piecesCount: data.piecesCount ?? null,
          weightKg: data.weightKg ?? null,
          cbm: data.cbm ?? null,
          condition: data.condition,
          /* An open flag is closed by resolving its case, not by checking in
             again with figures that happen to agree. */
          discrepancy: discrepancy || !!recount?.caseRef || !!before?.discrepancy,
          discrepancyNotes: data.discrepancyNotes || null,
          location: data.location || null,
          notes: data.notes || null,
        },
      });

      /* A re-count leaves the status where it is: cargo already marked ready
         for release is not sent back a step by somebody re-reading a scale. */
      const moved = DAR_RECEIVABLE.includes(cargo.status)
        ? await setCargoStatus(
            tx,
            cargo.id,
            "RECEIVED_DAR",
            actor,
            cargo.status === "MISSING_AT_DAR"
              ? "Found after being reported missing, and received at the Dar es Salaam warehouse"
              : "Received at the Dar es Salaam warehouse"
          )
        : false;

      let caseRef: string | null = recount?.caseRef ?? null;
      if (discrepancy && !cargo.darReceiving?.discrepancy && !caseRef) {
        const reference = await nextExceptionReference(tx);
        caseRef = reference;

        const shortfall = china ? data.packagesCount - china.packagesCount : 0;
        await tx.exceptionCase.create({
          data: {
            reference,
            type: damaged
              ? data.condition === "DAMAGED" || data.condition === "WET"
                ? "DAMAGED_CARGO"
                : "DAMAGED_CARGO"
              : shortfall < 0
                ? "MISSING_CARGO"
                : "PACKAGE_MISMATCH",
            priority: shortfall < 0 || data.condition === "DAMAGED" ? "HIGH" : "NORMAL",
            cargoId: cargo.id,
            customerId: cargo.senderId,
            containerId,
            department: "DAR_WAREHOUSE",
            title: damaged
              ? `${cargo.reference} arrived ${data.condition.toLowerCase().replace("_", " ")}`
              : `${cargo.reference}: China counted ${china?.packagesCount}, Dar counted ${data.packagesCount}`,
            description:
              data.discrepancyNotes ||
              "Raised automatically when the cargo was received at Dar.",
            raisedById: actor.id,
            evidence: stored.length > 0 ? stored : undefined,
          },
        });

        await tx.exceptionEvent.create({
          data: {
            caseId: (await tx.exceptionCase.findUniqueOrThrow({
              where: { reference },
              select: { id: true },
            })).id,
            to: "OPEN",
            note: "Opened at Dar receiving.",
            actorId: actor.id,
          },
        });

        /* Support and management, not the whole company. A case about somebody's
           boxes is a phone call waiting to happen. */
        await notifyStaff(
          [
            ...(await staffInDepartment("CUSTOMER_SUPPORT", tx)),
            ...(await staffInDepartment("MANAGEMENT", tx)),
          ],
          {
            kind: "exception.raised",
            title: `Issue on ${cargo.reference}`,
            body: damaged
              ? `Arrived ${data.condition.toLowerCase().replace("_", " ")}.`
              : `China counted ${china?.packagesCount}, Dar counted ${data.packagesCount}.`,
            href: "/app/exceptions",
          },
          tx
        );
      }

      if (stored.length > 0) {
        await tx.cargoPhoto.createMany({
          data: stored.map((url) => ({
            cargoId: cargo.id,
            kind: damaged ? ("DAMAGE" as const) : ("CONDITION" as const),
            url,
            warehouseKind: "TANZANIA" as const,
            uploadedById: actor.id,
          })),
        });
      }

      if (moved) {
        await announceDarArrival(tx, cargo, { arrivedAt: new Date(), discrepancy, actorId: actor.id });
      }

      return { receiving, caseRef };
    });
  } catch (error) {
    if (error instanceof CorrectionRefused) return { error: error.message };
    throw error;
  }

  /* The rate book prices it now, as a draft, so the price list already holds
     a figure for whoever confirms it. A re-count re-prices the draft on the
     corrected figures. Outside the check-in and never able to fail it. */
  await priceOnCheckIn(
    actor,
    [cargo.id],
    figuresMoved ? { reason: recountReason } : undefined
  );

  await recordAudit({
    actor,
    action: "cargo.receive.dar",
    entity: "Cargo",
    entityId: cargo.id,
    summary: `${cargo.reference} received at Dar — ${data.packagesCount} package(s)${
      discrepancy ? " (discrepancy)" : ""
    }`,
    metadata: {
      chinaPackages: china?.packagesCount ?? null,
      darPackages: data.packagesCount,
      condition: data.condition,
    },
  });

  revalidatePath("/app/receive/dar");
  revalidatePath("/app/receive/dar");
  revalidatePath(`/app/cargo/${cargo.id}`);

  return {
    ok: result.caseRef
      ? `Received. Case ${result.caseRef} opened on the difference.`
      : "Received.",
  };
}

/**
 * Dar signs off the count.
 *
 * Verification is a separate act from receiving on purpose: boxes come off a
 * container in a rush and are checked properly afterwards. Until this is done
 * the release engine will not let the cargo go, whatever the customer has paid.
 */
export async function verifyCargo(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("receiving.verify");

  const cargoId = String(formData.get("cargoId") ?? "");
  const receiving = await prisma.darReceiving.findUnique({
    where: { cargoId },
    include: { cargo: { select: { reference: true } } },
  });
  if (!receiving) return { error: "That cargo has not been received yet." };
  if (receiving.discrepancy) {
    return {
      error:
        "There is an open discrepancy on this consignment. Resolve the case before verifying.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.darReceiving.update({
      where: { id: receiving.id },
      data: { verified: true, verifiedAt: new Date() },
    });
    /* Signing the count off can be the last thing standing between a cleared,
       paid consignment and the customer being told to come. */
    await announceIfReady(tx, cargoId, actor);
  });

  await recordAudit({
    actor,
    action: "cargo.verify",
    entity: "Cargo",
    entityId: cargoId,
    summary: `Verified ${receiving.cargo.reference} on the Dar floor`,
  });

  revalidatePath("/app/receive/dar");
  revalidatePath(`/app/cargo/${cargoId}`);
  return { ok: "Verified." };
}

/**
 * CONFIRMING THE CONTAINER.
 *
 * The last act of a discharge: the floor says every consignment on the manifest
 * has been accounted for, signs off the clean ones and shuts the box. The rules
 * about what may be signed off and what blocks it are in
 * lib/container-confirmation.ts, so the counters on the screen and the button
 * under them answer the same questions.
 */
export async function verifyContainer(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("receiving.verify");

  const containerId = String(formData.get("containerId") ?? "");
  const overrideReason = String(formData.get("overrideReason") ?? "").trim();

  const container = await prisma.container.findFirst({
    where: { id: containerId, deletedAt: null },
    select: { id: true, reference: true, status: true },
  });
  if (!container) return { error: "That container no longer exists." };

  let result: Awaited<ReturnType<typeof confirmContainerAtDar>>;
  try {
    result = await prisma.$transaction(
      (tx) =>
        confirmContainerAtDar(tx, actor, {
          container,
          overrideReason,
          mayOverride: can(actor.role, "container.confirmUnchecked"),
        }),
      { timeout: 20_000 }
    );
  } catch (error) {
    if (error instanceof ConfirmationRefused) return { error: error.message };
    throw error;
  }

  const { counts, stranded, overridden } = result;

  await recordAudit({
    actor,
    action: "container.verify",
    entity: "Container",
    entityId: container.id,
    summary: `Confirmed ${container.reference} at Dar — ${counts.toSign.length} signed off, ${counts.counted.length} counted, ${counts.missing.length} missing, ${counts.damaged.length} damaged, ${counts.flagged.length} flagged${
      overridden ? `, ${counts.unchecked.length} unchecked (${overrideReason})` : ""
    }`,
    metadata: {
      expected: counts.expected.length,
      counted: counts.counted.length,
      signedOff: counts.toSign.length,
      missing: counts.missing.length,
      damaged: counts.damaged.length,
      flagged: counts.flagged.length,
      unchecked: counts.unchecked.length,
      overridden,
      overrideReason: overridden ? overrideReason : null,
      stranded,
    },
  });

  /*
    AND THE BOX IS SHUT.

    Confirming is the end of the discharge, so the container reaches its closed
    state here rather than waiting for somebody to find the container page —
    through the same door and the same permission as pressing Close there, so
    there is one set of rules about when a container may close and not two.
    Never over an override: a box with cargo nobody counted still has work on
    it, and it stays on the dock where that work is listed.
  */
  let closed = false;
  if (!overridden && container.status === "ARRIVED") {
    const close = new FormData();
    close.set("containerId", container.id);
    close.set("to", "CLOSED");
    const advanced = await advanceContainer({}, close);
    closed = !advanced.error;
  }

  revalidatePath("/app/receive/dar");
  revalidatePath(`/app/receive/dar/${container.id}`);
  revalidatePath(`/app/containers/${container.id}`);
  revalidatePath("/app/exceptions");

  return {
    ok: [
      `${container.reference} confirmed.`,
      counts.toSign.length ? `${counts.toSign.length} signed off.` : "",
      counts.flagged.length ? `${counts.flagged.length} left flagged.` : "",
      counts.missing.length ? `${counts.missing.length} missing.` : "",
      stranded.length
        ? `${stranded.length} unchecked, each with a case: ${stranded.join(", ")}.`
        : "",
      closed ? "The container is closed." : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

/**
 * ON THE MANIFEST, NOT ON THE FLOOR.
 *
 * The container has been emptied and this consignment is not among what came
 * off it. It does not become "received with zero packages" — that would put an
 * absent box into Dar inventory, and everything downstream would treat it as
 * collectable: it would appear on the floor list, a release could be prepared
 * for it, and a customer would be told to come for goods nobody can find.
 *
 * Instead the consignment stops here in its own state, a case is opened naming
 * exactly what was expected against what arrived, and the rest of the container
 * carries on being received. A hundred boxes are not held hostage by one.
 */
export async function reportMissingAtDar(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("receiving.dar");

  const cargoId = String(formData.get("cargoId") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  const cargo = await prisma.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    include: {
      chinaReceiving: true,
      darReceiving: { select: { id: true } },
      containerLines: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { container: { select: { id: true, reference: true } } },
      },
      exceptions: {
        where: { type: "MISSING_CARGO", status: { notIn: ["RESOLVED", "CLOSED"] } },
        select: { reference: true },
      },
    },
  });
  if (!cargo) return { error: "That cargo no longer exists." };
  if (cargo.darReceiving) {
    return {
      error:
        "This consignment has already been received at Dar. If something is short, correct the receiving record — the difference raises its own case.",
    };
  }
  if (cargo.exceptions.length > 0) {
    return { ok: `Already reported — case ${cargo.exceptions[0].reference}.` };
  }

  const line = cargo.containerLines.at(0);
  const expected = cargo.chinaReceiving?.packagesCount ?? cargo.declaredPackages;

  const result = await prisma.$transaction(async (tx) => {
    /* The claim, stated as a condition: only cargo that is still at sea or
       landed can go missing. Anything already received, released or cancelled
       is a different conversation, and two people on the floor pressing this at
       once must not both open a case. */
    const claim = await tx.cargo.updateMany({
      where: {
        id: cargo.id,
        status: { in: ["CONTAINER_LOADED", "DEPARTED_CHINA", "IN_TRANSIT", "ARRIVED_TANZANIA"] },
      },
      data: { status: "MISSING_AT_DAR" },
    });
    if (claim.count === 0) {
      throw new Error(
        "This consignment is not in a state where it can be reported missing."
      );
    }

    await tx.cargoStatusHistory.create({
      data: {
        cargoId: cargo.id,
        from: cargo.status,
        to: "MISSING_AT_DAR",
        reason: line?.container
          ? `Not found when ${line.container.reference} was unloaded`
          : "Not found at Dar",
        actorId: actor.id,
      },
    });

    const reference = await nextExceptionReference(tx);
    const created = await tx.exceptionCase.create({
      data: {
        reference,
        type: "MISSING_CARGO",
        priority: "URGENT",
        cargoId: cargo.id,
        customerId: cargo.senderId,
        containerId: line?.containerId ?? null,
        department: "DAR_WAREHOUSE",
        title: `${cargo.reference} did not come off ${line?.container.reference ?? "the container"}`,
        description:
          note ||
          `Expected ${expected} package(s) from ${cargo.shippingMark ?? "this consignment"}. Nothing was found when the container was unloaded.`,
        raisedById: actor.id,
      },
      select: { id: true, reference: true },
    });

    await tx.exceptionEvent.create({
      data: {
        caseId: created.id,
        to: "OPEN",
        note: "Reported missing when the container was unloaded.",
        actorId: actor.id,
      },
    });

    await notifyStaff(
      [
        ...(await staffInDepartment("CUSTOMER_SUPPORT", tx)),
        ...(await staffInDepartment("MANAGEMENT", tx)),
        ...(await staffInDepartment("CHINA_WAREHOUSE", tx)),
      ],
      {
        kind: "exception.raised",
        title: `${cargo.reference} is missing at Dar`,
        body: `Expected ${expected} package(s) off ${line?.container.reference ?? "the container"}. Nothing arrived.`,
        href: "/app/exceptions",
      },
      tx
    );

    return created;
  });

  await recordAudit({
    actor,
    action: "cargo.missing.dar",
    entity: "Cargo",
    entityId: cargo.id,
    summary: `${cargo.reference} reported missing at Dar — case ${result.reference}`,
    metadata: {
      expectedPackages: expected,
      container: line?.container.reference ?? null,
      note: note || null,
    },
  });

  revalidatePath("/app/receive/dar");
  revalidatePath("/app/exceptions");
  revalidatePath(`/app/cargo/${cargo.id}`);
  return { ok: `Reported. Case ${result.reference} is open.` };
}

/**
 * PRESENT AND CORRECT, IN ONE PRESS.
 *
 * The overwhelming majority of consignments come off a container exactly as
 * Guangzhou sent them, and making a clerk open a form to retype four figures
 * they are not disputing is how a container of a hundred takes a day. A tick
 * says "what China recorded is what is in front of me" and writes exactly that.
 *
 * It is not a shortcut past the count — it IS the count, asserted by the person
 * holding the boxes, and it is stored as their figures with their name on it.
 * Anything that does not match gets the scales button and the form behind it.
 *
 * A consignment with no China figures cannot be accepted this way: there is
 * nothing to agree with, so it is skipped and reported rather than saved as a
 * row of zeroes.
 */
export async function acceptAsExpected(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("receiving.dar");

  const ids = formData
    .getAll("cargoIds")
    .map(String)
    .filter(Boolean);
  const single = String(formData.get("cargoId") ?? "");
  const cargoIds = ids.length > 0 ? ids : single ? [single] : [];
  return acceptAsExpectedBy(actor, cargoIds);
}

/** What "damaged" can mean on the Dar bench. Good is not one of them. */
const DAMAGE_CONDITIONS = ["MINOR_DAMAGE", "DAMAGED", "WET"] as const;

const damageSchema = z.object({
  cargoId: z.string().min(1),
  condition: z.enum(DAMAGE_CONDITIONS),
  note: z.string().trim().min(3, "Say what you found."),
});

/**
 * THE DAMAGED TAG, PUT ON BY THE PERSON HOLDING THE CARTON.
 *
 * A consignment comes off the container wet, or crushed, or with a corner
 * open. It is HERE — that is the difference between this and missing — so it
 * stays on the Dar floor, it is still counted and it is still billed. What it
 * gains is a tag that travels with it: onto the check-in row, the container's
 * cargo list, the consignment itself and the price list Finance reads, so
 * nobody quotes a customer a clean bill for a bale that arrived soaked.
 *
 * A PHOTOGRAPH IS NOT OPTIONAL. A damage claim is argued weeks later against a
 * supplier, an insurer or a shipping line, and the only evidence that survives
 * is the picture taken at the bench with the damage in front of the lens. The
 * form refuses without one for the same reason the air side refuses: a claim
 * recorded as a sentence is a claim that gets paid by us.
 *
 * The tag can go on a consignment nobody has counted yet — that is the usual
 * case, the damage being the first thing anyone notices — and China's figures
 * are taken as the count, exactly as the tick does. It can also go on one
 * already checked in clean, because damage is found when the customer opens
 * the bale on the floor, not always on the way off the lorry.
 */
export async function reportDamageAtDar(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("receiving.dar");

  const parsed = damageSchema.safeParse({
    cargoId: formData.get("cargoId"),
    condition: formData.get("condition") || "DAMAGED",
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  const cargo = await prisma.cargo.findFirst({
    where: { id: data.cargoId, deletedAt: null },
    include: {
      chinaReceiving: true,
      darReceiving: true,
      containerLines: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { container: { select: { id: true, reference: true } } },
      },
      exceptions: {
        where: { type: "DAMAGED_CARGO", status: { notIn: ["RESOLVED", "CLOSED"] } },
        select: { id: true, reference: true, evidence: true },
      },
    },
  });
  if (!cargo) return { error: "That cargo no longer exists." };
  if (HANDED_OVER.includes(cargo.status)) {
    return {
      error: `${cargo.reference} has already been handed over. Damage found after collection is a claim — raise a case on it.`,
    };
  }
  if (!cargo.darReceiving && !DAR_RECEIVABLE.includes(cargo.status)) {
    return {
      error: `${cargo.reference} has not arrived at Dar. Record the container's arrival first.`,
    };
  }
  if (!cargo.darReceiving && !cargo.chinaReceiving) {
    return {
      error: `Nobody has counted ${cargo.reference}. Count it on the scales — the condition is on that same form.`,
    };
  }

  /* Written before the transaction, for the reason every other upload here
     is: a slow upload must not hold row locks on a busy floor. */
  const photos = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (photos.length === 0) {
    return {
      error: "Take a photograph of the damage. A claim without one is argued on somebody's memory.",
    };
  }
  const stored: string[] = [];
  try {
    for (const file of photos) stored.push(await store(file, "cargo"));
  } catch (error) {
    return {
      error: error instanceof UploadError ? error.message : "That upload failed.",
    };
  }

  const china = cargo.chinaReceiving;
  const line = cargo.containerLines.at(0);
  const containerId = line?.containerId ?? null;
  const wasCounted = !!cargo.darReceiving;

  const result = await prisma.$transaction(async (tx) => {
    if (cargo.darReceiving) {
      await recordFieldChange(
        {
          actor,
          entity: "DarReceiving",
          entityId: cargo.darReceiving.id,
          field: "condition",
          oldValue: cargo.darReceiving.condition,
          newValue: data.condition,
          reason: data.note,
        },
        tx
      );
      await tx.darReceiving.update({
        where: { id: cargo.darReceiving.id },
        data: {
          condition: data.condition,
          discrepancy: true,
          discrepancyNotes: data.note,
          /* A signature that the cargo was clean cannot stand over a tag that
             says it is not. Signing off again is the resolution of the case. */
          verified: false,
          verifiedAt: null,
        },
      });
    } else {
      const warehouse =
        (actor.warehouseId
          ? await tx.warehouse.findFirst({
              where: { id: actor.warehouseId, active: true, kind: "TANZANIA" },
              select: { id: true },
            })
          : null) ??
        (await tx.warehouse.findFirst({
          where: { active: true, kind: "TANZANIA" },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        }));
      if (!warehouse) {
        throw new Error("No Dar warehouse is set up to receive into. Ask an administrator.");
      }
      /* The damage IS the check-in: the boxes are on the floor, counted at
         China's figures the way the tick counts them, and flagged. */
      await tx.darReceiving.create({
        data: {
          cargoId: cargo.id,
          warehouseId: warehouse.id,
          containerId,
          packagesCount: china!.packagesCount,
          piecesCount: china!.piecesCount,
          weightKg: china!.weightKg,
          cbm: china!.cbm,
          condition: data.condition,
          discrepancy: true,
          discrepancyNotes: data.note,
          receivedById: actor.id,
        },
      });
      await setCargoStatus(
        tx,
        cargo.id,
        "RECEIVED_DAR",
        actor,
        `Received at Dar, ${data.condition.toLowerCase().replace("_", " ")}`
      );
      await announceDarArrival(tx, cargo, { arrivedAt: new Date(), discrepancy: true, actorId: actor.id });
    }

    await tx.cargoPhoto.createMany({
      data: stored.map((url) => ({
        cargoId: cargo.id,
        kind: "DAMAGE" as const,
        url,
        warehouseKind: "TANZANIA" as const,
        uploadedById: actor.id,
      })),
    });

    /* One live case per consignment. A second bale found wet on the same
       delivery is the same argument with the same supplier, and two cases is
       two people each answering half of it. */
    const open = cargo.exceptions[0];
    if (open) {
      await tx.exceptionEvent.create({
        data: {
          caseId: open.id,
          to: "OPEN",
          note: `More damage recorded at Dar: ${data.note}`,
          actorId: actor.id,
        },
      });
      /* Evidence is a JSON column rather than a scalar list, so the new
         pictures are added to what is there instead of replacing it — a second
         photograph must never be the reason the first one disappears. */
      const held = Array.isArray(open.evidence) ? (open.evidence as string[]) : [];
      await tx.exceptionCase.update({
        where: { id: open.id },
        data: { evidence: [...held, ...stored] },
      });
      return { caseRef: open.reference };
    }

    const reference = await nextExceptionReference(tx);
    const created = await tx.exceptionCase.create({
      data: {
        reference,
        type: "DAMAGED_CARGO",
        priority: data.condition === "MINOR_DAMAGE" ? "NORMAL" : "HIGH",
        cargoId: cargo.id,
        customerId: cargo.senderId,
        containerId,
        department: "DAR_WAREHOUSE",
        title: `${cargo.reference} arrived ${data.condition.toLowerCase().replace("_", " ")}`,
        description: data.note,
        raisedById: actor.id,
        evidence: stored,
      },
      select: { id: true, reference: true },
    });
    await tx.exceptionEvent.create({
      data: {
        caseId: created.id,
        to: "OPEN",
        note: "Damage found at Dar receiving.",
        actorId: actor.id,
      },
    });
    await notifyStaff(
      [
        ...(await staffInDepartment("CUSTOMER_SUPPORT", tx)),
        ...(await staffInDepartment("MANAGEMENT", tx)),
        ...(await staffInDepartment("CHINA_WAREHOUSE", tx)),
      ],
      {
        kind: "exception.raised",
        title: `${cargo.reference} arrived damaged`,
        body: data.note.slice(0, 160),
        href: "/app/exceptions",
      },
      tx
    );
    return { caseRef: created.reference };
  });

  /* Newly on the floor, so the rate book prices it as a draft like any other
     check-in. Damage does not change the freight — what the company does about
     it is Finance's decision, on the bill, with a reason. */
  if (!wasCounted) await priceOnCheckIn(actor, [cargo.id]);

  await recordAudit({
    actor,
    action: "cargo.damaged.dar",
    entity: "Cargo",
    entityId: cargo.id,
    summary: `${cargo.reference} tagged ${data.condition.toLowerCase().replace("_", " ")} at Dar — case ${result.caseRef}`,
    metadata: {
      condition: data.condition,
      note: data.note,
      photos: stored.length,
      container: line?.container.reference ?? null,
    },
  });

  revalidatePath("/app/receive/dar");
  if (containerId) revalidatePath(`/app/receive/dar/${containerId}`);
  revalidatePath("/app/exceptions");
  revalidatePath(`/app/cargo/${cargo.id}`);
  return { ok: `Tagged. Case ${result.caseRef} is open on the damage.` };
}

/**
 * THE CARGO TYPE, CHOSEN ON THE CHECK-IN ROW.
 *
 * Guangzhou types a consignment when it takes it in, and most arrive typed. The
 * ones that do not are the ones somebody has to chase later: an untyped
 * consignment cannot be priced from the rate book, so it reaches Finance as a
 * row saying "no cargo type yet" and goes back round the houses.
 *
 * The person who can answer is the one with the goods open in front of them,
 * and that is Dar, at the moment of counting. So the type is on the row, it
 * saves the moment it is picked, every line's old type goes to FieldChange
 * first, and the draft bill is re-priced at the new type's rate — all of which
 * is the price list's own machinery, asked for here by the floor instead.
 *
 * The floor still never sees a price. What it sets is what the goods ARE.
 */
export async function setCheckInCargoType(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("receiving.dar");

  const cargoId = String(formData.get("cargoId") ?? "");
  const cargoType = String(formData.get("cargoType") ?? "");
  const containerId = String(formData.get("containerId") ?? "");

  try {
    const allowedTypes = await cargoTypeOptions();
    const result = await prisma.$transaction(
      (tx) =>
        setWaitingCargoType(tx, actor, {
          cargoId,
          cargoType,
          allowedTypes,
          reason: "Cargo type recorded at Dar check-in",
        }),
      { timeout: 20_000 }
    );
    revalidatePath("/app/receive/dar");
    if (containerId) revalidatePath(`/app/receive/dar/${containerId}`);
    revalidatePath(`/app/cargo/${cargoId}`);
    return { ok: result.changed ? `Now ${cargoType}.` : `Already ${cargoType}.` };
  } catch (error) {
    if (error instanceof PriceListRefused) return { error: error.message };
    throw error;
  }
}
