"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, type ContainerStatus } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import { DateOutOfRange, formDate } from "@/lib/dates";
import { issueFor as issuePackingListFor } from "@/lib/packing-list";
import { setCargoStatusBulk } from "@/lib/cargo";
import { LOADABLE_CONTAINER_STATUSES } from "@/lib/constants";
import {
  nextContainerReference,
  nextPackingListNumber,
  nextShipmentReference,
} from "@/lib/ids";
import { notifyCustomer } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { formMessage } from "@/lib/safe-error";
import { authorize } from "@/lib/session";

export type ActionState = { error?: string; ok?: string; id?: string };

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

  let deadline: Date | null;
  try {
    deadline = formDate(data.cargoDeadline, "cargo deadline");
  } catch (error) {
    if (error instanceof DateOutOfRange) return { error: error.message };
    throw error;
  }

  const container = await prisma.$transaction(async (tx) => {
    const reference = await nextContainerReference(tx);
    const created = await tx.container.create({
      data: {
        reference,
        containerNumber: data.containerNumber || null,
        type: data.type,
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
      select: { cargoId: true },
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
       to leave the container with no manifest at all. */
    await issuePackingListFor(tx, container.id, actor.id, { atSeal: true });
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
    select: { id: true, reference: true },
  });
  if (!shipment) return { error: "That container has no voyage." };

  await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      shippingLine: data.shippingLine || null,
      vessel: data.vessel || null,
      voyage: data.voyage || null,
      billOfLading: data.billOfLading || null,
      departureDate: departure,
      eta: arrival,
      notes: data.notes || null,
    },
  });

  await recordAudit({
    actor,
    action: "shipment.update",
    entity: "Shipment",
    entityId: shipment.id,
    summary: `Updated voyage details on ${shipment.reference}`,
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
  DEPARTED: {
    from: ["SEALED"] as ContainerStatus[],
    shipment: "DEPARTED_CHINA" as const,
    cargo: "DEPARTED_CHINA" as const,
    title: "Your cargo has left China",
    body: (ref: string) => `Container ${ref} has departed.`,
  },
  IN_TRANSIT: {
    from: ["DEPARTED"] as ContainerStatus[],
    shipment: "IN_TRANSIT" as const,
    cargo: "IN_TRANSIT" as const,
    title: "Your cargo is at sea",
    body: (ref: string) => `Container ${ref} is in transit.`,
  },
  ARRIVED: {
    from: ["DEPARTED", "IN_TRANSIT"] as ContainerStatus[],
    shipment: "ARRIVED_TANZANIA" as const,
    cargo: "ARRIVED_TANZANIA" as const,
    title: "Your cargo has arrived in Tanzania",
    body: (ref: string) => `Container ${ref} has arrived at Dar es Salaam.`,
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
    shipment: "DEPARTED_CHINA" | "IN_TRANSIT" | "ARRIVED_TANZANIA" | "COMPLETED";
    cargo: "DEPARTED_CHINA" | "IN_TRANSIT" | "ARRIVED_TANZANIA" | null;
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
            : "Recording an arrival is Dar's to do.",
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
      const claim = await tx.container.updateMany({
        where: { id: container.id, status: { in: step.from } },
        data: { status: to as ContainerStatus },
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

      await tx.shipment.updateMany({
        where: { containerId: container.id },
        data: {
          status: step.shipment,
          ...(to === "DEPARTED" ? { departureDate: at } : {}),
          ...(to === "ARRIVED" ? { actualArrival: at } : {}),
        },
      });

      if (step.cargo) {
        await setCargoStatusBulk(
          tx,
          container.cargoLines.map((l) => l.cargoId),
          step.cargo,
          actor,
          `Container ${container.reference}`
        );

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
