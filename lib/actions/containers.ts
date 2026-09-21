"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, type CargoStatus, type ContainerStatus } from "@prisma/client";

import { recordAudit, recordFieldChange } from "@/lib/audit";
import { DateOutOfRange, formDate } from "@/lib/dates";
import { issueFor as issuePackingListFor } from "@/lib/packing-list";
import { setCargoStatus, setCargoStatusBulk } from "@/lib/cargo";
import { announcePortArrival } from "@/lib/clearance";
import { priceOnCheckIn } from "@/lib/price-confirmation";
import { LOADABLE_CONTAINER_STATUSES } from "@/lib/constants";
import {
  nextContainerReference,
  nextExceptionReference,
  nextPackingListNumber,
  nextShipmentReference,
} from "@/lib/ids";
import { notifyCustomer, notifyStaff, staffInDepartment } from "@/lib/notify";
import { prisma, type TxClient } from "@/lib/prisma";
import { nextOpenSailing, publicSailings } from "@/lib/sailing-schedule";
import { formMessage } from "@/lib/safe-error";
import { authorize } from "@/lib/session";

export type ActionState = { error?: string; ok?: string; id?: string };

/** A day, as a string that can sit beside another one in a FieldChange row. */
const dayOf = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;

const CONTAINER_TYPES = ["GP_20", "GP_40", "HQ_40", "HQ_45", "LCL_CONSOLIDATED"] as const;

const createSchema = z.object({
  type: z.enum(CONTAINER_TYPES),
  containerNumber: z.string().trim().optional(),
  originPort: z.string().trim().optional(),
  destinationPort: z.string().trim().optional(),
  capacityCbm: z.coerce.number().min(0).optional(),
  cargoDeadline: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

/**
 * Open a container for loading.
 *
 * The shipment row is created alongside it, empty. A box and a sailing are
 * different things — one has a seal and a fill level, the other has a vessel and
 * dates that slip — but there is never a container without a voyage to put it
 * on, and creating the pair together means no screen has to handle a container
 * whose shipment is null.
 */
export async function createContainer(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("container.create");

  const parsed = createSchema.safeParse({
    type: formData.get("type") || "HQ_40",
    containerNumber: formData.get("containerNumber") || undefined,
    originPort: formData.get("originPort") || undefined,
    destinationPort: formData.get("destinationPort") || undefined,
    capacityCbm: formData.get("capacityCbm") || undefined,
    cargoDeadline: formData.get("cargoDeadline") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  /*
    THE LAST DAY FOR CARGO, OFF THE SCHEDULE.

    Not asked for: the week's rule already says it — Guangzhou takes cargo
    until the Friday before the Monday the ship leaves — and the public page,
    the portal and the booking form all print that date. A box opened today
    closes with the next sailing still open. Typing it again only made room
    for a second date that disagreed with the one customers were told. A week
    that slips is corrected on the container page, where it always could be.
  */
  const deadline =
    nextOpenSailing(await publicSailings({ count: 3 }))?.cargoDeadline ?? null;

  /*
    THE BOX'S OWN HOME, OFF THE PERSON OPENING IT.

    Not asked for — a clerk standing in Guangzhou opening a container is opening
    it in Guangzhou, and a dropdown only creates the possibility of the wrong
    answer. Falls back to the single live China warehouse, the way receiving
    does, and stays null rather than guessing when there are several and this
    user belongs to none.

    The packing list does NOT read this. It derives its origin from the
    receiving rows of the cargo actually inside, which is first-hand: the goods
    say which floor they came off, and this column only says where the box was
    opened. When they disagree the goods are right.
  */
  const origin =
    (actor.warehouseId
      ? await prisma.warehouse.findFirst({
          where: { id: actor.warehouseId, active: true, kind: "CHINA" },
          select: { id: true },
        })
      : null) ??
    (await prisma.warehouse.findFirst({
      where: { active: true, kind: "CHINA" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }));

  const container = await prisma.$transaction(async (tx) => {
    const reference = await nextContainerReference(tx);
    const created = await tx.container.create({
      data: {
        reference,
        containerNumber: data.containerNumber || null,
        type: data.type,
        originWarehouseId: origin?.id ?? null,
        originPort: data.originPort || "Guangzhou",
        destinationPort: data.destinationPort || "Dar es Salaam",
        capacityCbm: data.capacityCbm ?? null,
        cargoDeadline: deadline,
        notes: data.notes || null,
      },
    });

    await tx.containerEvent.create({
      data: { containerId: created.id, to: "OPEN", actorId: actor.id },
    });

    await tx.shipment.create({
      data: {
        reference: await nextShipmentReference(tx),
        containerId: created.id,
        originPort: created.originPort,
        destinationPort: created.destinationPort,
      },
    });

    return created;
  });

  await recordAudit({
    actor,
    action: "container.create",
    entity: "Container",
    entityId: container.id,
    summary: `Opened container ${container.reference}`,
  });

  revalidatePath("/app/containers");
  return { ok: `${container.reference} is open for loading.`, id: container.id };
}

const boxSchema = z.object({
  containerId: z.string().min(1),
  capacityCbm: z.coerce.number().min(0).optional(),
  cargoDeadline: z.string().trim().optional(),
  notes: z.string().trim().max(2000, "Keep the note short.").optional(),
});

/**
 * Correct the box's own particulars while it is still open.
 *
 * Capacity, the date Guangzhou stops accepting for this sailing, and the note.
 * They were typed once when the container was opened and could not be touched
 * again, so a deadline the shipping line moved was corrected by opening a
 * second container and moving everything into it.
 *
 * ONLY WHILE IT IS OPEN. A capacity is a loading guide and a deadline is a
 * promise made to customers who are still deciding; both stop meaning anything
 * the moment the doors are shut, and a sealed box's particulars are part of
 * what the packing list froze.
 *
 * The shipping line's container number and the seal are not here. They are set
 * at the seal, with the seal, because that is when the line allocates them.
 */
export async function updateContainerBox(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("container.edit");

  const parsed = boxSchema.safeParse({
    containerId: formData.get("containerId"),
    capacityCbm: formData.get("capacityCbm") || undefined,
    cargoDeadline: formData.get("cargoDeadline") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  const data = parsed.data;

  let deadline: Date | null;
  try {
    deadline = formDate(data.cargoDeadline, "cargo deadline");
  } catch (error) {
    if (error instanceof DateOutOfRange) return { error: error.message };
    throw error;
  }

  const container = await prisma.container.findFirst({
    where: { id: data.containerId, deletedAt: null },
    select: {
      id: true,
      reference: true,
      status: true,
      capacityCbm: true,
      cargoDeadline: true,
      notes: true,
    },
  });
  if (!container) return { error: "That container no longer exists." };
  if (!LOADABLE_CONTAINER_STATUSES.includes(container.status)) {
    return {
      error: `${container.reference} is ${container.status.toLowerCase()} — its capacity and deadline stopped meaning anything when the doors shut.`,
    };
  }

  const next = {
    capacityCbm:
      data.capacityCbm === undefined ? null : new Prisma.Decimal(data.capacityCbm),
    cargoDeadline: deadline,
    notes: data.notes || null,
  };

  /* Decimals and dates compare by value, not by identity — `Decimal(67)` is
     never `===` another `Decimal(67)`, and every save would have written a
     FieldChange saying the capacity changed from 67 to 67. */
  const moved = (
    [
      [
        "capacityCbm",
        container.capacityCbm?.toString() ?? null,
        next.capacityCbm?.toString() ?? null,
      ],
      ["cargoDeadline", dayOf(container.cargoDeadline), dayOf(next.cargoDeadline)],
      ["notes", container.notes, next.notes],
    ] as const
  ).filter(([, was, now]) => (was ?? null) !== (now ?? null));

  if (moved.length === 0) return { ok: "Nothing changed." };

  await prisma.$transaction(async (tx) => {
    for (const [field, was, now] of moved) {
      await recordFieldChange(
        {
          actor,
          entity: "Container",
          entityId: container.id,
          field,
          oldValue: was,
          newValue: now,
        },
        tx
      );
    }

    await tx.container.update({
      where: { id: container.id },
      data: Object.fromEntries(
        moved.map(([field]) => [field, next[field]])
      ) as Prisma.ContainerUpdateInput,
    });

    /* The deadline is published on the website, so moving it is an operational
       event and not a private edit. The other two are notes to ourselves. */
    if (moved.some(([field]) => field === "cargoDeadline")) {
      await tx.containerEvent.create({
        data: {
          containerId: container.id,
          from: container.status,
          to: container.status,
          note: `Cargo deadline ${
            next.cargoDeadline
              ? `set to ${dayOf(next.cargoDeadline)}`
              : "removed"
          }`,
          actorId: actor.id,
        },
      });
    }
  });

  await recordAudit({
    actor,
    action: "container.edit",
    entity: "Container",
    entityId: container.id,
    summary: `Changed ${moved.map(([field]) => field).join(", ")} on ${container.reference}`,
    metadata: {
      changes: moved.map(([field, was, now]) => ({
        field,
        from: was ?? null,
        to: now ?? null,
      })),
    },
  });

  revalidatePath(`/app/containers/${container.id}`);
  revalidatePath("/app/containers/loading");
  return { ok: "Saved." };
}

/**
 * Put a consignment's packages into a container.
 *
 * Two things happen, and they are different: every package moves physically
 * (`CargoPackage.containerId`), and one commercial line is written or updated
 * for the customer on this sailing (`ContainerCargo`). The second is the packing
 * list line, and its CBM is summed from the first — so the manifest can never
 * claim a volume the boxes do not add up to.
 */
export async function loadCargo(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("container.load");

  const containerId = String(formData.get("containerId") ?? "");
  const cargoIds = formData
    .getAll("cargoIds")
    .map(String)
    .filter(Boolean);

  if (cargoIds.length === 0) return { error: "Choose at least one consignment." };

  const container = await prisma.container.findFirst({
    where: { id: containerId, deletedAt: null },
    select: { id: true, reference: true, status: true },
  });
  if (!container) return { error: "That container no longer exists." };

  if (!LOADABLE_CONTAINER_STATUSES.includes(container.status)) {
    return {
      error: `${container.reference} is ${container.status.toLowerCase()} — nothing more can go in.`,
    };
  }

  let loaded: number;
  try {
  loaded = await prisma.$transaction(async (tx) => {
    /*
      THE SEAL IS RE-CHECKED INSIDE THE TRANSACTION.

      Two clerks can be looking at the same open container when one of them
      seals it. Re-stating the condition as a conditional update and checking
      the count is the only thing that makes "still open" true at the moment of
      writing rather than at the moment of reading.

      The first load moves the box from OPEN to LOADING, and that move is a
      container event like every other. Later loads leave the status and the
      time loading started exactly as the first one wrote them.
    */
    const opened = await tx.container.updateMany({
      where: { id: container.id, status: "OPEN" },
      data: { status: "LOADING", loadingStartedAt: new Date() },
    });
    if (opened.count === 1) {
      await tx.containerEvent.create({
        data: {
          containerId: container.id,
          from: "OPEN",
          to: "LOADING",
          actorId: actor.id,
        },
      });
    } else {
      const stillLoading = await tx.container.updateMany({
        where: { id: container.id, status: "LOADING" },
        data: { status: "LOADING" },
      });
      if (stillLoading.count === 0) {
        throw new Error("That container was sealed while you were loading.");
      }
    }

    const cargo = await tx.cargo.findMany({
      where: {
        id: { in: cargoIds },
        deletedAt: null,
        status: { in: ["RECEIVED_CHINA", "ASSIGNED_TO_CONTAINER"] },
      },
      select: {
        id: true,
        reference: true,
        senderId: true,
        receiverId: true,
        packages: {
          where: { deletedAt: null },
          select: { id: true, quantity: true, cbm: true, weightKg: true },
        },
      },
    });

    /*
      NOTHING LOADED IS NOT A LOAD.

      Every id here came off a list a clerk was looking at, and a consignment
      that has since been sealed into another box, cancelled or deleted simply
      drops out of the query above. Saying "0 consignment(s) loaded" in the
      green style of a success told the loading bay the job was done, and the
      cargo they thought they had put in the container was still on the floor.
    */
    if (cargo.length === 0) {
      throw new Error(
        "None of those can be loaded any more — they have been sealed into another container, or taken off the floor. Reload the list."
      );
    }

    for (const item of cargo) {
      /*
        ONE BOX AT A TIME.

        A consignment picked off the floor into this container may already be
        sitting in another one that is still open — the clerk changed their mind
        about which sailing it catches. Its packages move here, so the other
        container's line for it has to go too; left behind, that container would
        list and total boxes that are no longer in it, and seal them into a
        packing list for a sailing they are not on.
      */
      await tx.containerCargo.deleteMany({
        where: {
          cargoId: item.id,
          containerId: { not: container.id },
          container: { status: { in: LOADABLE_CONTAINER_STATUSES } },
        },
      });

      await tx.cargoPackage.updateMany({
        where: { cargoId: item.id, deletedAt: null },
        data: { containerId: container.id },
      });

      const cbm = item.packages.reduce(
        (sum, p) => sum.add(p.cbm),
        new Prisma.Decimal(0)
      );
      const weight = item.packages.reduce(
        (sum, p) => sum.add(p.weightKg ?? 0),
        new Prisma.Decimal(0)
      );
      /* BOXES, NOT LINES. A line reading "cartons × 18" is eighteen things to
         carry, and the manifest, the container summary and the Dar count all
         have to mean the same thing by "packages" or the check-in never
         reconciles. */
      const packagesCount = item.packages.reduce(
        (sum, p) => sum + p.quantity,
        0
      );

      await tx.containerCargo.upsert({
        where: {
          containerId_cargoId: { containerId: container.id, cargoId: item.id },
        },
        create: {
          containerId: container.id,
          cargoId: item.id,
          packagesCount,
          cbm,
          /* Nothing weighed is not nothing weighing zero. */
          weightKg: weight.greaterThan(0) ? weight : null,
          loadedAt: new Date(),
        },
        update: {
          packagesCount,
          cbm,
          weightKg: weight.greaterThan(0) ? weight : null,
        },
      });
    }

    await setCargoStatusBulk(
      tx,
      cargo.map((c) => c.id),
      "ASSIGNED_TO_CONTAINER",
      actor,
      `Assigned to container ${container.reference}`
    );

    /*
      WHAT WENT IN, ON THE BOX'S OWN TIMELINE.

      The consignment's history says which container it joined; the container's
      said only that it opened and that it was sealed. Everything in between —
      the thing the loading bay actually did, in what order, by whom — lived
      nowhere but the audit log, which is a security record and not the list the
      container page renders. The arrival amendments already write these; a
      load is the same kind of event and was the one missing it.
    */
    await tx.containerEvent.create({
      data: {
        containerId: container.id,
        from: "LOADING",
        to: "LOADING",
        note: `Loaded ${cargo.length} consignment(s): ${cargo
          .map((c) => c.reference)
          .join(", ")}`,
        actorId: actor.id,
      },
    });

    await notifyCustomer(
      /* The receiver collects and pays; the sender shipped it. Both follow the box. */
      cargo.flatMap((c) => [c.senderId, c.receiverId]),
      {
        kind: "cargo.assigned",
        title: "Your cargo has a container",
        body: `Loading has started on ${container.reference}.`,
        href: "/portal",
      },
      tx
    );

    return cargo.length;
  });
  } catch (error) {
    return { error: formMessage(error, "That did not load.") };
  }

  await recordAudit({
    actor,
    action: "container.load",
    entity: "Container",
    entityId: container.id,
    summary: `Loaded ${loaded} consignment(s) into ${container.reference}`,
  });

  revalidatePath(`/app/containers/${container.id}`);
  return { ok: `${loaded} consignment(s) loaded.` };
}

/** Take a consignment back off, while the box is still open. */
export async function unloadCargo(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("container.load");

  const containerId = String(formData.get("containerId") ?? "");
  /* One row's button posts `cargoId`; the table's tick-boxes post `cargoIds`.
     Both mean the same thing to everything below. */
  const cargoIds = [
    ...formData.getAll("cargoIds").map(String),
    ...(formData.get("cargoId") ? [String(formData.get("cargoId"))] : []),
  ].filter(Boolean);

  if (cargoIds.length === 0) {
    return { error: "Tick what you want taken off." };
  }

  const container = await prisma.container.findFirst({
    where: { id: containerId, deletedAt: null },
    select: { id: true, reference: true, status: true },
  });
  if (!container) return { error: "That container no longer exists." };
  if (!LOADABLE_CONTAINER_STATUSES.includes(container.status)) {
    return { error: "That container is sealed. Nothing can come out." };
  }

  let removed: string[];
  try {
  removed = await prisma.$transaction(async (tx) => {
    /*
      ONLY WHAT IS ACTUALLY IN THIS BOX.

      The ids arrive in a request body. A consignment that is not on this
      container — sitting in another one, or already at sea — must not be put
      back "on the Guangzhou floor" by a form that names it, so the list is cut
      down to this container's own lines before anything moves.
    */
    const lines = await tx.containerCargo.findMany({
      where: { containerId: container.id, cargoId: { in: cargoIds } },
      select: { cargoId: true, cargo: { select: { reference: true } } },
    });
    const inside = lines.map((l) => l.cargoId);
    if (inside.length === 0) return inside;

    const stillOpen = await tx.container.updateMany({
      where: { id: container.id, status: { in: LOADABLE_CONTAINER_STATUSES } },
      data: { status: container.status },
    });
    if (stillOpen.count === 0) {
      throw new Error("That container was sealed a moment ago. Nothing can come out.");
    }

    await tx.cargoPackage.updateMany({
      where: { cargoId: { in: inside }, containerId: container.id },
      data: { containerId: null },
    });
    await tx.containerCargo.deleteMany({
      where: { containerId: container.id, cargoId: { in: inside } },
    });
    await setCargoStatusBulk(
      tx,
      inside,
      "RECEIVED_CHINA",
      actor,
      `Taken back off ${container.reference}`
    );

    /* The mirror of the load event. A box whose timeline shows four
       consignments going in and nothing coming out cannot explain why its
       packing list is shorter than the paper somebody printed at lunchtime. */
    await tx.containerEvent.create({
      data: {
        containerId: container.id,
        from: container.status,
        to: container.status,
        note: `Taken off: ${lines.map((l) => l.cargo.reference).join(", ")}`,
        actorId: actor.id,
      },
    });
    return inside;
  });
  } catch (error) {
    return { error: formMessage(error, "That did not work.") };
  }

  if (removed.length === 0) {
    return { error: "None of those is in this container." };
  }

  await recordAudit({
    actor,
    action: "container.unload",
    entity: "Container",
    entityId: container.id,
    summary: `Took ${removed.length} consignment(s) off ${container.reference}`,
    metadata: { cargoIds: removed },
  });

  revalidatePath(`/app/containers/${container.id}`);
  revalidatePath("/app/inventory");
  return {
    ok:
      removed.length === 1
        ? "Taken off. It is back on the Guangzhou floor."
        : `${removed.length} consignments taken off and back on the floor.`,
  };
}

/**
 * Seal the box.
 *
 * The one-way door. After this nothing may be added or removed, the seal number
 * is on the record, and every consignment inside moves to CONTAINER_LOADED
 * together — they are physically one load from here to Dar.
 */
export async function sealContainer(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("container.seal");

  const containerId = String(formData.get("containerId") ?? "");
  const sealNumber = String(formData.get("sealNumber") ?? "").trim();
  const containerNumber = String(formData.get("containerNumber") ?? "").trim();

  if (!sealNumber) return { error: "The seal number goes on the record." };

  const container = await prisma.container.findFirst({
    where: { id: containerId, deletedAt: null },
    include: { cargoLines: { select: { cargoId: true } } },
  });
  if (!container) return { error: "That container no longer exists." };
  if (container.cargoLines.length === 0) {
    return { error: "There is nothing in it." };
  }

  let sealedLines: number;
  try {
  sealedLines = await prisma.$transaction(async (tx) => {
    const claim = await tx.container.updateMany({
      where: { id: container.id, status: { in: LOADABLE_CONTAINER_STATUSES } },
      data: {
        status: "SEALED",
        sealNumber,
        containerNumber: containerNumber || container.containerNumber,
        sealedAt: new Date(),
        loadedAt: new Date(),
      },
    });
    if (claim.count === 0) throw new Error("That container is already sealed.");

    await tx.containerEvent.create({
      data: {
        containerId: container.id,
        from: container.status,
        to: "SEALED",
        note: `Seal ${sealNumber}`,
        actorId: actor.id,
      },
    });

    await tx.shipment.updateMany({
      where: { containerId: container.id },
      data: { status: "READY" },
    });

    /* The lines are read again under the seal's own claim. A consignment
       loaded between this page being read and the seal landing is in the box,
       and must move with the rest of the load. */
    const inside = await tx.containerCargo.findMany({
      where: { containerId: container.id },
      select: { cargoId: true },
    });

    /*
      AN EMPTY BOX IS NOT SEALED.

      The count was checked before the transaction opened, and between that
      read and this claim another clerk can have taken the last consignment
      back off. Sealing anyway produced a container at sea with no contents, no
      packing list and a seal number on the record — a sailing nobody could
      account for and nothing Dar could check against.
    */
    if (inside.length === 0) {
      throw new Error(
        "Everything was taken back off while you were sealing. There is nothing in it."
      );
    }

    /*
      NOTHING IN THIS BOX IS ALSO IN ANOTHER ONE.

      Loading takes a consignment off whatever open container it was on, so this
      should never be true — which is exactly why it is worth asking at the one
      moment it stops being correctable. After the seal the box is unreachable
      for twenty-eight days, and a consignment counted on two live sailings is
      loaded twice, billed twice and checked in twice, with nobody able to say
      which manifest was wrong.
    */
    const elsewhere = await tx.containerCargo.findMany({
      where: {
        cargoId: { in: inside.map((l) => l.cargoId) },
        containerId: { not: container.id },
        container: { deletedAt: null, status: { not: "CLOSED" } },
      },
      select: {
        cargo: { select: { reference: true } },
        container: { select: { reference: true } },
      },
      take: 5,
    });
    if (elsewhere.length > 0) {
      throw new Error(
        `${elsewhere
          .map((l) => `${l.cargo.reference} is also on ${l.container.reference}`)
          .join(", ")}. Take it off one of them before sealing.`
      );
    }

    await setCargoStatusBulk(
      tx,
      inside.map((l) => l.cargoId),
      "CONTAINER_LOADED",
      actor,
      `Container ${container.reference} sealed`
    );

    /* THE LIST FREEZES WITH THE SEAL, WITHOUT ANYBODY REMEMBERING TO PRESS
       ANYTHING. The document says what was in the box when the box was shut,
       which is the only moment the claim is true, and it is the sheet the
       shipping line and Dar both work from. A clerk who forgot this step used
       to leave the container with no manifest at all.

       Sealing FAILS if it cannot be written. The whole promise of this system
       to the Dar floor is that a sealed box arrives with a frozen list of what
       is in it; a seal that quietly succeeded without one sent a container
       across the ocean with nothing to check it against, and nobody found out
       for twenty-eight days. */
    const list = await issuePackingListFor(tx, container.id, actor.id, {
      atSeal: true,
    });
    if (!list) {
      throw new Error(
        "The packing list could not be drawn for this container, so it has not been sealed. Nothing has changed."
      );
    }
    return inside.length;
  });
  } catch (error) {
    return { error: formMessage(error, "That did not seal.") };
  }

  await recordAudit({
    actor,
    action: "container.seal",
    entity: "Container",
    entityId: container.id,
    summary: `Sealed ${container.reference} with seal ${sealNumber} — ${sealedLines} consignment(s)`,
    metadata: { sealNumber, consignments: sealedLines },
  });

  revalidatePath(`/app/containers/${container.id}`);
  return { ok: "Sealed." };
}

const voyageSchema = z.object({
  containerId: z.string().min(1),
  shippingLine: z.string().trim().optional(),
  vessel: z.string().trim().optional(),
  voyage: z.string().trim().optional(),
  billOfLading: z.string().trim().optional(),
  departureDate: z.string().trim().optional(),
  eta: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

/**
 * The vessel, the voyage, the bill of lading and the dates.
 *
 * EVERY FIELD THAT MOVES IS WRITTEN DOWN, OLD VALUE FIRST. These are the facts
 * a customer is quoted, a shipping line is chased on and an arrival is
 * predicted from, and they change for two very different reasons: the line
 * gave us a bill of lading we did not have yet, or somebody typed over a
 * departure date that was already right. The first is routine; the second is
 * the one an argument turns on four weeks later, and the only way to tell them
 * apart afterwards is to have kept both figures.
 *
 * A box that has already sailed also gets an event on its own timeline, so a
 * correction made to a container at sea is visible on the page anybody opens to
 * ask about it, not only in the audit log.
 */
export async function updateVoyage(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("shipment.edit");

  const parsed = voyageSchema.safeParse({
    containerId: formData.get("containerId"),
    shippingLine: formData.get("shippingLine") || undefined,
    vessel: formData.get("vessel") || undefined,
    voyage: formData.get("voyage") || undefined,
    billOfLading: formData.get("billOfLading") || undefined,
    departureDate: formData.get("departureDate") || undefined,
    eta: formData.get("eta") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: "Check the voyage details." };

  let departure: Date | null;
  let arrival: Date | null;
  try {
    departure = formDate(parsed.data.departureDate, "departure date");
    arrival = formDate(parsed.data.eta, "ETA");
  } catch (error) {
    if (error instanceof DateOutOfRange) return { error: error.message };
    throw error;
  }
  const data = parsed.data;

  const shipment = await prisma.shipment.findUnique({
    where: { containerId: data.containerId },
    select: {
      id: true,
      reference: true,
      shippingLine: true,
      vessel: true,
      voyage: true,
      billOfLading: true,
      departureDate: true,
      eta: true,
      notes: true,
      container: { select: { id: true, reference: true, status: true } },
    },
  });
  if (!shipment) return { error: "That container has no voyage." };

  const reason = String(formData.get("reason") ?? "").trim() || "No reason given";

  const next = {
    shippingLine: data.shippingLine || null,
    vessel: data.vessel || null,
    voyage: data.voyage || null,
    billOfLading: data.billOfLading || null,
    departureDate: departure,
    eta: arrival,
    notes: data.notes || null,
  };

  const moved = (
    [
      ["shippingLine", shipment.shippingLine, next.shippingLine],
      ["vessel", shipment.vessel, next.vessel],
      ["voyage", shipment.voyage, next.voyage],
      ["billOfLading", shipment.billOfLading, next.billOfLading],
      ["departureDate", dayOf(shipment.departureDate), dayOf(next.departureDate)],
      ["eta", dayOf(shipment.eta), dayOf(next.eta)],
      ["notes", shipment.notes, next.notes],
    ] as const
  ).filter(([, was, now]) => (was ?? null) !== (now ?? null));

  if (moved.length === 0) return { ok: "Nothing changed." };

  /*
    A SEALED BOX IS NOT AN OPEN ONE.

    Filling in a bill of lading the line only issued after departure is the
    normal case and must not be blocked. Rewriting the vessel or the departure
    date of a container that has already left is a correction to a fact other
    people are working from, so it is asked to say why — the same trade the
    arrived-container amendments make.
  */
  const sailed = ["DEPARTED", "IN_TRANSIT", "ARRIVED", "CLOSED"].includes(
    shipment.container.status
  );
  const rewriting = moved.some(
    ([field, was]) =>
      was !== null && ["vessel", "voyage", "departureDate"].includes(field)
  );

  await prisma.$transaction(async (tx) => {
    for (const [field, was, now] of moved) {
      await recordFieldChange(
        {
          actor,
          entity: "Shipment",
          entityId: shipment.id,
          field,
          oldValue: was,
          newValue: now,
          reason: reason || null,
        },
        tx
      );
    }

    /*
      ONLY THE FIELDS THAT MOVED ARE WRITTEN.

      The dates are compared by day, because that is the granularity the form
      offers and the granularity anybody reads. Writing the whole object back
      would take a departure recorded at 14:32 by the milestone button and
      quietly reset it to midnight whenever somebody corrected the vessel —
      a change to a stored fact with no FieldChange behind it, which is the one
      thing this function exists to prevent.
    */
    await tx.shipment.update({
      where: { id: shipment.id },
      data: Object.fromEntries(
        moved.map(([field]) => [field, next[field]])
      ) as Prisma.ShipmentUpdateInput,
    });

    if (sailed) {
      await tx.containerEvent.create({
        data: {
          containerId: shipment.container.id,
          from: shipment.container.status,
          to: shipment.container.status,
          note: `Voyage details changed after sailing: ${moved
            .map(([field]) => field)
            .join(", ")}${reason ? ` — ${reason}` : ""}`,
          actorId: actor.id,
        },
      });
    }
  });

  await recordAudit({
    actor,
    action: "shipment.update",
    entity: "Shipment",
    entityId: shipment.id,
    summary: `Updated ${moved
      .map(([field]) => field)
      .join(", ")} on ${shipment.reference}${reason ? ` — ${reason}` : ""}`,
    metadata: {
      changes: moved.map(([field, was, now]) => ({
        field,
        from: was ?? null,
        to: now ?? null,
      })),
    },
  });

  revalidatePath(`/app/containers/${data.containerId}`);
  return { ok: "Voyage saved." };
}

/**
 * Move the box along its journey.
 *
 * One function for every milestone, because they are all the same shape: claim
 * the transition conditionally, append the event, drag the shipment and every
 * consignment inside along with it, and tell the customers once.
 *
 * MILESTONES ARE ENTERED BY STAFF, NOT INVENTED. There is no vessel GPS feed
 * behind this, and a tracking page that animates a ship across an ocean it is
 * guessing about is a lie told very smoothly.
 */
const MILESTONES = {
  /*
    DEPARTING IS GOING TO SEA — ONE PRESS, NOT TWO.

    A box that has left Guangzhou is at sea; there is nothing a person learns
    between the two that needs a second button. Departure is still written as
    its own event, first, so the history and the tracking page keep the day it
    left, and the box, the shipment and every consignment then stand at
    IN_TRANSIT in the same transaction. There is no in-transit milestone to
    press any more; a box already standing at DEPARTED from before goes
    straight on to arrival.
  */
  DEPARTED: {
    from: ["SEALED"] as ContainerStatus[],
    shipment: "IN_TRANSIT" as const,
    cargo: "IN_TRANSIT" as const,
    title: "Your cargo has left China and is at sea",
    body: (ref: string) => `Container ${ref} has departed Guangzhou and is on its way to Dar es Salaam.`,
  },
  ARRIVED: {
    from: ["DEPARTED", "IN_TRANSIT"] as ContainerStatus[],
    shipment: "ARRIVED_TANZANIA" as const,
    cargo: "ARRIVED_TANZANIA" as const,
    /* Arrived at the port is not ready: customs has the goods now, and the
       customer is told so — and that another message follows. */
    title: "Your cargo has arrived at Dar es Salaam port — clearance in progress",
    body: (ref: string) =>
      `Container ${ref} is at Dar es Salaam port and your goods are going through customs clearance. They are not ready to collect yet — we will tell you when clearance is complete and they are at our warehouse.`,
  },
  CLOSED: {
    from: ["ARRIVED"] as ContainerStatus[],
    shipment: "COMPLETED" as const,
    cargo: null,
    title: "",
    body: () => "",
  },
} satisfies Record<
  string,
  {
    from: ContainerStatus[];
    shipment: "IN_TRANSIT" | "ARRIVED_TANZANIA" | "COMPLETED";
    cargo: "IN_TRANSIT" | "ARRIVED_TANZANIA" | null;
    title: string;
    body: (ref: string) => string;
  }
>;

export async function advanceContainer(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const to = String(formData.get("to") ?? "") as keyof typeof MILESTONES;
  const step = MILESTONES[to];
  if (!step) return { error: "That is not a milestone." };

  const permission =
    to === "DEPARTED"
      ? "container.depart"
      : to === "CLOSED"
        ? "container.close"
        : "container.arrive";

  /*
    Answered rather than thrown.

    Each milestone belongs to one end of the route, and a permission read live
    from the database can say no to a page that was rendered when it said yes —
    a role changed this morning, a tab left open since yesterday. That is a
    sentence to read, not a crash: the alternative put a full error page in
    front of a warehouse clerk who had done nothing wrong.
  */
  let actor;
  try {
    actor = await authorize(permission);
  } catch {
    return {
      error:
        to === "DEPARTED"
          ? "Recording a departure is Guangzhou's to do."
          : to === "CLOSED"
            ? "Closing a container is Dar's to do."
            : "Your desk cannot record an arrival.",
    };
  }

  const containerId = String(formData.get("containerId") ?? "");
  const when = String(formData.get("when") ?? "").trim();

  const container = await prisma.container.findFirst({
    where: { id: containerId, deletedAt: null },
    include: { cargoLines: { select: { cargoId: true, cargo: { select: { senderId: true, receiverId: true } } } } },
  });
  if (!container) return { error: "That container no longer exists." };

  /* A closed container leaves the receiving dock, and the dock is the only
     screen that lists what came off it. Closing one with consignments nobody
     has checked in or reported missing strands them in "arrived" with no list
     left to find them on. */
  if (to === "CLOSED") {
    const unchecked = await prisma.cargo.findMany({
      where: {
        id: { in: container.cargoLines.map((l) => l.cargoId) },
        deletedAt: null,
        darReceiving: null,
        status: { not: "MISSING_AT_DAR" },
      },
      select: { reference: true },
      take: 5,
    });
    if (unchecked.length > 0) {
      return {
        error: `Check in or report missing ${unchecked
          .map((c) => c.reference)
          .join(", ")} before closing ${container.reference}.`,
      };
    }
  }

  let at: Date;
  try {
    at = formDate(when, "date") ?? new Date();
  } catch (error) {
    if (error instanceof DateOutOfRange) return { error: error.message };
    throw error;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const lands: ContainerStatus = to === "DEPARTED" ? "IN_TRANSIT" : (to as ContainerStatus);
      const claim = await tx.container.updateMany({
        where: { id: container.id, status: { in: step.from } },
        data: { status: lands },
      });
      if (claim.count === 0) {
        throw new Error(
          `${container.reference} is ${container.status.toLowerCase()} — that step does not follow.`
        );
      }

      await tx.containerEvent.create({
        data: {
          containerId: container.id,
          from: container.status,
          to: to as ContainerStatus,
          actorId: actor.id,
        },
      });
      if (lands !== to) {
        await tx.containerEvent.create({
          data: {
            containerId: container.id,
            from: to as ContainerStatus,
            to: lands,
            actorId: actor.id,
          },
        });
      }

      await tx.shipment.updateMany({
        where: { containerId: container.id },
        data: {
          status: step.shipment,
          ...(to === "DEPARTED" ? { departureDate: at } : {}),
          ...(to === "ARRIVED" ? { actualArrival: at } : {}),
        },
      });

      if (step.cargo) {
        /* The consignments keep the day they left China in their own history,
           then stand at sea with the box. */
        if (to === "DEPARTED") {
          await setCargoStatusBulk(
            tx,
            container.cargoLines.map((l) => l.cargoId),
            "DEPARTED_CHINA",
            actor,
            `Container ${container.reference}`
          );
        }
        await setCargoStatusBulk(
          tx,
          container.cargoLines.map((l) => l.cargoId),
          step.cargo,
          actor,
          `Container ${container.reference}`
        );

        if (to === "ARRIVED") {
          /* Each customer's own message, with their own bill in it. */
          await announcePortArrival(tx, container.cargoLines.map((l) => l.cargoId));
        } else {
          await notifyCustomer(
            container.cargoLines.flatMap((l) => [l.cargo.senderId, l.cargo.receiverId]),
            {
              kind: `container.${to.toLowerCase()}`,
              title: step.title,
              body: step.body(container.containerNumber ?? container.reference),
              href: "/portal",
            },
            tx
          );
        }
      }
    });
  } catch (error) {
    return {
      error: formMessage(error, "That did not work."),
    };
  }

  await recordAudit({
    actor,
    action: `container.${to.toLowerCase()}`,
    entity: "Container",
    entityId: container.id,
    summary: `${container.reference} → ${to.toLowerCase()} (${container.cargoLines.length} consignment(s))`,
  });

  if (to === "ARRIVED") {
    /* Landed goods are collectable money: anything Finance has not priced yet
       gets its draft from the rate book now, waiting on the price list. */
    await priceOnCheckIn(actor, container.cargoLines.map((l) => l.cargoId));
    revalidatePath("/app/finance/collections");
    revalidatePath("/app/receive/dar");
  }

  revalidatePath(`/app/containers/${container.id}`);
  revalidatePath("/app/containers");
  return { ok: `Recorded.` };
}

/**
 * Freeze the packing list by hand.
 *
 * Sealing does this on its own — see `sealContainer` — so this button exists
 * only for the case where somebody needs the paper before the box is shut: a
 * shipping line asking for the manifest in advance, or a clerk who wants to
 * check the printed sheet against the floor. Until it is issued, the packing
 * list screen renders the container's live contents, so there is never a moment
 * when there is nothing to look at.
 */
export async function issuePackingList(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("packingList.issue");

  const containerId = String(formData.get("containerId") ?? "");
  const container = await prisma.container.findFirst({
    where: { id: containerId, deletedAt: null },
    select: {
      id: true,
      reference: true,
      packingList: { select: { number: true } },
      _count: { select: { cargoLines: true } },
    },
  });
  if (!container) return { error: "That container no longer exists." };
  if (container.packingList) {
    return { ok: `Packing list ${container.packingList.number} already issued.` };
  }
  if (container._count.cargoLines === 0) {
    return { error: "There is nothing in this container to list." };
  }

  const list = await prisma.$transaction((tx) =>
    issuePackingListFor(tx, container.id, actor.id)
  );
  if (!list) return { error: "There is nothing in this container to list." };

  await recordAudit({
    actor,
    action: "packingList.issue",
    entity: "PackingList",
    entityId: list.id,
    summary: `Issued ${list.number} for ${container.reference}`,
  });

  revalidatePath(`/app/containers/${container.id}`);
  return { ok: `Packing list ${list.number} issued.` };
}

/** Containers whose cargo is on the Dar floor rather than in Guangzhou or at sea. */
const LANDED_CONTAINER_STATUSES: ContainerStatus[] = ["ARRIVED", "CLOSED"];

/** Where a consignment goes back to when it turns out it was never in the box. */
const STILL_AT_SEA: CargoStatus[] = [
  "ASSIGNED_TO_CONTAINER",
  "CONTAINER_LOADED",
  "DEPARTED_CHINA",
  "IN_TRANSIT",
  "ARRIVED_TANZANIA",
  "MISSING_AT_DAR",
];

/**
 * A MANIFEST CORRECTION IS A DISCOVERY, AND SOMEBODY HAS TO ANSWER FOR IT.
 *
 * The two amendments below put the paper right, which is necessary and is not
 * the whole job. A consignment that was listed and never came off is a customer
 * whose goods are somewhere nobody has looked; a bale that came off and was on
 * nobody's list is cargo about to be billed against a sailing the office has no
 * record of it taking. Correcting the manifest and saying nothing left both of
 * those as a line in an audit log that no queue reads, and the consignment went
 * back to being Guangzhou's with nobody chasing it.
 *
 * So the correction opens a case, exactly as a short count or a wet carton
 * does: cargo, customer and container named on it, the floor's own reason as
 * its description, and Support, management and Guangzhou told. It does not stop
 * the container — the rest of the box carries on being checked in — and it does
 * not stop the pricing; it is the reason a person looks before the bill goes.
 *
 * One live case per consignment per kind. A bale moved twice in an afternoon is
 * one argument, and two cases is two people each answering half of it.
 */
async function openManifestCase(
  tx: TxClient,
  actor: { id: string },
  input: {
    type: "WRONG_CONTAINER" | "UNIDENTIFIED_CARGO";
    cargo: { id: string; reference: string; senderId: string };
    containerId: string | null;
    title: string;
    description: string;
    note: string;
    body: string;
  }
) {
  const open = await tx.exceptionCase.findFirst({
    where: {
      cargoId: input.cargo.id,
      type: input.type,
      status: { notIn: ["RESOLVED", "CLOSED"] },
    },
    select: { id: true, reference: true },
  });
  if (open) {
    await tx.exceptionEvent.create({
      data: { caseId: open.id, to: "OPEN", note: input.note, actorId: actor.id },
    });
    return open.reference;
  }

  const reference = await nextExceptionReference(tx);
  const created = await tx.exceptionCase.create({
    data: {
      reference,
      type: input.type,
      priority: "NORMAL",
      cargoId: input.cargo.id,
      customerId: input.cargo.senderId,
      containerId: input.containerId,
      department: "DAR_WAREHOUSE",
      title: input.title,
      description: input.description,
      raisedById: actor.id,
    },
    select: { id: true },
  });
  await tx.exceptionEvent.create({
    data: { caseId: created.id, to: "OPEN", note: input.note, actorId: actor.id },
  });
  await notifyStaff(
    [
      ...(await staffInDepartment("CUSTOMER_SUPPORT", tx)),
      ...(await staffInDepartment("MANAGEMENT", tx)),
      ...(await staffInDepartment("CHINA_WAREHOUSE", tx)),
    ],
    {
      kind: "exception.raised",
      title: input.title,
      body: input.body,
      href: "/app/exceptions",
    },
    tx
  );
  return reference;
}

/**
 * A CONSIGNMENT THAT WAS ON THE MANIFEST AND NOT IN THE BOX.
 *
 * The packing list is written in Guangzhou and read in Dar, and the first
 * person to check one against actual cargo is standing on the Dar floor with
 * the container open. What they find is sometimes that a consignment is on the
 * paper and was never loaded — the wrong box, the next sailing, a line typed
 * twice. `unloadCargo` will not help them: it stops at the seal, correctly,
 * because it is the loading tool.
 *
 * So this is the landed twin, and it is deliberately narrower. It refuses a
 * consignment Dar has already counted off this container — that one WAS in the
 * box, and its short count is a case, not a manifest edit — and it refuses one
 * carrying a bill somebody has been given. The old container and the new
 * absence of one go to FieldChange with the reason before anything moves, and
 * the container keeps an event saying what left it.
 *
 * A consignment taken off goes back to being Guangzhou's, which is where it is
 * if it did not sail: that is the claim being made, and the status has to say
 * it out loud rather than leave the boxes counted in two places.
 */
export async function takeOffArrivedContainer(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("container.amendArrived");

  const containerId = String(formData.get("containerId") ?? "");
  const cargoId = String(formData.get("cargoId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "No reason given";

  const container = await prisma.container.findFirst({
    where: { id: containerId, deletedAt: null },
    select: { id: true, reference: true, status: true },
  });
  if (!container) return { error: "That container no longer exists." };
  if (!LANDED_CONTAINER_STATUSES.includes(container.status)) {
    return {
      error: `${container.reference} has not landed yet. While a box is open, take cargo off it with the loading list.`,
    };
  }

  const cargo = await prisma.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    select: {
      id: true,
      reference: true,
      status: true,
      senderId: true,
      darReceiving: { select: { id: true, containerId: true } },
      invoices: {
        where: { status: { notIn: ["CANCELLED"] } },
        select: { id: true, number: true, status: true },
      },
    },
  });
  if (!cargo) return { error: "That cargo no longer exists." };

  const line = await prisma.containerCargo.findUnique({
    where: { containerId_cargoId: { containerId: container.id, cargoId: cargo.id } },
    select: { id: true },
  });
  if (!line) return { error: `${cargo.reference} is not on ${container.reference}.` };

  /* Counted off this box by the Dar floor. Saying afterwards that it was never
     in it contradicts the only first-hand record there is. */
  if (cargo.darReceiving && cargo.darReceiving.containerId === container.id) {
    return {
      error: `Dar has already checked ${cargo.reference} in off ${container.reference}. Correct the count, or raise a case — a consignment that came off the box was on it.`,
    };
  }
  const billed = cargo.invoices.find((i) => i.status !== "DRAFT");
  if (billed) {
    return {
      error: `${cargo.reference} is billed on ${billed.number}, and that bill names this sailing. Cancel it first.`,
    };
  }

  const caseRef = await prisma.$transaction(async (tx) => {
    await recordFieldChange(
      {
        actor,
        entity: "Cargo",
        entityId: cargo.id,
        field: "container",
        oldValue: container.reference,
        newValue: null,
        reason,
      },
      tx
    );

    /* A draft names the sailing it was priced for. The consignment is leaving
       that sailing, so the draft stops claiming it rather than being deleted —
       the figures are still the figures, and the line is a real foreign key. */
    await tx.invoice.updateMany({
      where: { cargoId: cargo.id, containerCargoId: line.id },
      data: { containerCargoId: null },
    });

    await tx.cargoPackage.updateMany({
      where: { cargoId: cargo.id, containerId: container.id },
      data: { containerId: null },
    });
    await tx.containerCargo.delete({ where: { id: line.id } });

    if (STILL_AT_SEA.includes(cargo.status)) {
      await setCargoStatus(
        tx,
        cargo.id,
        "RECEIVED_CHINA",
        actor,
        `Taken off ${container.reference} after it landed: ${reason}`
      );
    }

    await tx.containerEvent.create({
      data: {
        containerId: container.id,
        from: container.status,
        to: container.status,
        note: `${cargo.reference} taken off the manifest: ${reason}`,
        actorId: actor.id,
      },
    });

    /* The boxes are now nowhere: off this sailing, and not on the Guangzhou
       shelf in any sense anybody has checked. Somebody has to go and look, and
       an audit line is not somebody. */
    return openManifestCase(tx, actor, {
      type: "WRONG_CONTAINER",
      cargo,
      containerId: container.id,
      title: `${cargo.reference} was listed on ${container.reference} and did not come off it`,
      description: reason,
      note: `Taken off ${container.reference} at Dar: ${reason}`,
      body: `${cargo.reference} was on the packing list for ${container.reference} and was not in the box.`,
    });
  });

  await recordAudit({
    actor,
    action: "container.amendArrived",
    entity: "Container",
    entityId: container.id,
    summary: `Took ${cargo.reference} off ${container.reference} after arrival — ${reason}`,
    metadata: { cargoId: cargo.id, reference: cargo.reference, reason, caseRef },
  });

  revalidatePath(`/app/containers/${container.id}`);
  revalidatePath(`/app/receive/dar/${container.id}`);
  revalidatePath("/app/containers/arrived");
  revalidatePath("/app/exceptions");
  revalidatePath(`/app/cargo/${cargo.id}`);
  return {
    ok: `${cargo.reference} is off ${container.reference} and back on the Guangzhou floor. Case ${caseRef} is open on where it is.`,
  };
}

/**
 * A CONSIGNMENT THAT WAS IN THE BOX AND NOT ON THE MANIFEST.
 *
 * The other half of the same discovery. A bale comes off the container with a
 * mark that is not on the packing list, or a consignment nobody could find
 * turns up in the next box down. Dar puts it on the container it actually came
 * off, and from there it is checked in, priced and billed with the rest of that
 * sailing.
 *
 * It is never a new record: what goes on the manifest is a consignment that
 * already exists, with its own reference, its own mark and its own Guangzhou
 * measurements. Nothing about the cargo is retyped here.
 */
export async function putOnArrivedContainer(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("container.amendArrived");

  const containerId = String(formData.get("containerId") ?? "");
  const cargoId = String(formData.get("cargoId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "No reason given";

  const container = await prisma.container.findFirst({
    where: { id: containerId, deletedAt: null },
    select: { id: true, reference: true, status: true },
  });
  if (!container) return { error: "That container no longer exists." };
  if (!LANDED_CONTAINER_STATUSES.includes(container.status)) {
    return {
      error: `${container.reference} has not landed yet. While a box is open, load cargo into it from the floor list.`,
    };
  }

  const cargo = await prisma.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    select: {
      id: true,
      reference: true,
      status: true,
      senderId: true,
      chinaReceiving: { select: { packagesCount: true, cbm: true, weightKg: true } },
      darReceiving: {
        select: { id: true, containerId: true, packagesCount: true, cbm: true, weightKg: true },
      },
      invoices: {
        where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
        select: { number: true },
      },
      packages: {
        where: { deletedAt: null },
        select: { quantity: true, cbm: true, weightKg: true },
      },
      containerLines: {
        select: {
          id: true,
          containerId: true,
          container: { select: { reference: true, status: true } },
        },
      },
    },
  });
  if (!cargo) return { error: "That cargo no longer exists." };
  if (cargo.invoices.length > 0) {
    return {
      error: `${cargo.reference} is billed on ${cargo.invoices[0].number}, and that bill names the sailing it was on. Cancel it first.`,
    };
  }

  const already = cargo.containerLines.find((l) => l.containerId === container.id);
  if (already) return { ok: `${cargo.reference} is already on ${container.reference}.` };

  /*
    ONE BOX AT A TIME, AND THE OLD MANIFEST IS CORRECTED WITH IT.

    A consignment scanned onto the wrong container is MOVED here rather than
    taken off one screen and added on another: one press, one reason, and the
    old container and the new one as the two halves of a single FieldChange.
    The exception is a consignment the Dar floor already counted off another
    box. That is a first-hand record of which container it came out of, and it
    is not overruled by a second opinion typed afterwards.
  */
  const counted = cargo.containerLines.find(
    (l) =>
      cargo.darReceiving !== null &&
      cargo.darReceiving.containerId === l.containerId &&
      l.containerId !== container.id
  );
  if (counted) {
    return {
      error: `Dar checked ${cargo.reference} in off ${counted.container.reference}. A consignment that came off one box was in that box — correct the check-in, or raise a case.`,
    };
  }

  const measured = cargo.darReceiving ?? cargo.chinaReceiving;
  const fromLines = cargo.packages.length > 0;
  const cbm = fromLines
    ? cargo.packages.reduce((sum, p) => sum.add(p.cbm), new Prisma.Decimal(0))
    : new Prisma.Decimal(measured?.cbm ?? 0);
  const weight = fromLines
    ? cargo.packages.reduce((sum, p) => sum.add(p.weightKg ?? 0), new Prisma.Decimal(0))
    : new Prisma.Decimal(measured?.weightKg ?? 0);
  const packagesCount = fromLines
    ? cargo.packages.reduce((sum, p) => sum + p.quantity, 0)
    : (measured?.packagesCount ?? 0);
  const was = cargo.containerLines[0]?.container.reference ?? null;

  const caseRef = await prisma.$transaction(async (tx) => {
    await recordFieldChange(
      {
        actor,
        entity: "Cargo",
        entityId: cargo.id,
        field: "container",
        oldValue: was,
        newValue: container.reference,
        reason,
      },
      tx
    );

    await tx.containerCargo.deleteMany({
      where: { cargoId: cargo.id, containerId: { not: container.id } },
    });
    await tx.cargoPackage.updateMany({
      where: { cargoId: cargo.id, deletedAt: null },
      data: { containerId: container.id },
    });
    await tx.containerCargo.create({
      data: {
        containerId: container.id,
        cargoId: cargo.id,
        packagesCount,
        cbm,
        weightKg: weight.greaterThan(0) ? weight : null,
        loadedAt: new Date(),
        notes: reason,
      },
    });

    /* Landed, not received: putting it on the manifest says the box it came
       off, not that anybody has counted it. Dar checks it in from the same
       screen as the rest, and a consignment already booked in keeps the state
       its own floor gave it. */
    if (cargo.status !== "RECEIVED_DAR" && STILL_AT_SEA.concat("RECEIVED_CHINA").includes(cargo.status)) {
      await setCargoStatus(
        tx,
        cargo.id,
        "ARRIVED_TANZANIA",
        actor,
        `Came off ${container.reference}: ${reason}`
      );
    }
    if (cargo.darReceiving) {
      await tx.darReceiving.update({
        where: { id: cargo.darReceiving.id },
        data: { containerId: container.id },
      });
    }

    await tx.containerEvent.create({
      data: {
        containerId: container.id,
        from: container.status,
        to: container.status,
        note: `${cargo.reference} added to the manifest: ${reason}`,
        actorId: actor.id,
      },
    });

    /* Cargo the frozen packing list does not carry, about to be counted, priced
       and billed against this sailing. The list itself is never rewritten — it
       is what Guangzhou sealed — so the discovery lives beside it as a case,
       and whoever confirms the price sees that somebody found this bale rather
       than shipped it. */
    return openManifestCase(tx, actor, {
      type: was ? "WRONG_CONTAINER" : "UNIDENTIFIED_CARGO",
      cargo,
      containerId: container.id,
      title: was
        ? `${cargo.reference} came off ${container.reference}, not ${was}`
        : `${cargo.reference} came off ${container.reference} and is on no packing list`,
      description: reason,
      note: `Added to ${container.reference} at Dar: ${reason}`,
      body: was
        ? `${cargo.reference} was listed on ${was} and came off ${container.reference}.`
        : `${cargo.reference} came off ${container.reference} and the packing list does not carry it.`,
    });
  });

  await recordAudit({
    actor,
    action: "container.amendArrived",
    entity: "Container",
    entityId: container.id,
    summary: `Added ${cargo.reference} to ${container.reference} after arrival — ${reason}`,
    metadata: { cargoId: cargo.id, reference: cargo.reference, was, reason, caseRef },
  });

  revalidatePath(`/app/containers/${container.id}`);
  revalidatePath(`/app/receive/dar/${container.id}`);
  revalidatePath("/app/containers/arrived");
  revalidatePath("/app/exceptions");
  revalidatePath(`/app/cargo/${cargo.id}`);
  return {
    ok: `${cargo.reference} is on ${container.reference}. Check it in with the rest — case ${caseRef} names how it got there.`,
  };
}

/**
 * THE SHIP HAD NOT ARRIVED.
 *
 * "Mark as arrived" pressed on the wrong container, or a day early. It is put
 * back to in transit — the container, the sailing and every consignment on it,
 * each with its own history line — and the customers who were told their goods
 * were at the port are told that was premature.
 *
 * Only while nothing has happened since: once a consignment has been checked
 * in, reported missing or cleared, the arrival is a fact other records stand
 * on, and undoing it here would leave them describing goods at sea.
 */
export async function undoContainerArrival(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let actor;
  try {
    actor = await authorize("container.arrive");
  } catch {
    return { error: "Recording an arrival is Dar's to do." };
  }
  const containerId = String(formData.get("containerId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);

  const container = await prisma.container.findFirst({
    where: { id: containerId, deletedAt: null },
    include: {
      cargoLines: {
        select: {
          cargoId: true,
          cargo: {
            select: {
              reference: true,
              status: true,
              clearedAt: true,
              senderId: true,
              receiverId: true,
              darReceiving: { select: { id: true } },
            },
          },
        },
      },
    },
  });
  if (!container) return { error: "That container no longer exists." };
  if (container.status !== "ARRIVED") {
    return { error: `${container.reference} is not marked as arrived.` };
  }
  const touched = container.cargoLines.find(
    (l) =>
      l.cargo.darReceiving ||
      l.cargo.clearedAt ||
      !["ARRIVED_TANZANIA", "CANCELLED"].includes(l.cargo.status)
  );
  if (touched) {
    return {
      error: `${touched.cargo.reference} has already been checked in, cleared or reported missing, so the arrival stands. Correct that consignment instead.`,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const claim = await tx.container.updateMany({
        where: { id: container.id, status: "ARRIVED" },
        data: { status: "IN_TRANSIT" },
      });
      if (claim.count === 0) throw new Error("Somebody else changed this container first.");

      await tx.containerEvent.create({
        data: {
          containerId: container.id,
          from: "ARRIVED",
          to: "IN_TRANSIT",
          note: `Arrival undone${reason ? ` — ${reason}` : ""}`,
          actorId: actor.id,
        },
      });
      await tx.shipment.updateMany({
        where: { containerId: container.id },
        data: { status: "IN_TRANSIT", actualArrival: null },
      });
      await setCargoStatusBulk(
        tx,
        container.cargoLines
          .filter((l) => l.cargo.status === "ARRIVED_TANZANIA")
          .map((l) => l.cargoId),
        "IN_TRANSIT",
        actor,
        `Arrival of ${container.reference} undone${reason ? ` — ${reason}` : ""}`
      );
      await notifyCustomer(
        container.cargoLines.flatMap((l) => [l.cargo.senderId, l.cargo.receiverId]),
        {
          kind: "container.arrival_undone",
          title: "Correction: your cargo is still on the way",
          body: `Container ${container.containerNumber ?? container.reference} has not reached Dar es Salaam port yet — our earlier message was sent too soon. We will tell you when it arrives.`,
          href: "/portal",
        },
        tx
      );
    });
  } catch (error) {
    return { error: formMessage(error, "That did not work.") };
  }

  await recordAudit({
    actor,
    action: "container.arrivalUndone",
    entity: "Container",
    entityId: container.id,
    summary: `Undid the arrival of ${container.reference}${reason ? ` — ${reason}` : ""}`,
  });

  revalidatePath("/app/receive/dar");
  revalidatePath(`/app/containers/${container.id}`);
  return { ok: `${container.reference} is back in transit.` };
}
