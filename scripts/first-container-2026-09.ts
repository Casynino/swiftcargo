/**
 * THE OWNER'S FIRST CONTAINER, PUT ON THE RECORD AFTER IT LANDED.
 *
 *   DATABASE_URL=… DIRECT_URL=… npx tsx scripts/first-container-2026-09.ts [--dry-run]
 *
 * The ten consignments entered by arrived-cargo-2026-09 (SC0001–SC0010) came
 * to Dar together, and the owner treats them as the company's first container.
 * They were entered with no container because the list did not name one; this
 * gives them one, written the way the app writes a container that went through
 * open, load, seal, departure and arrival — so the container page, its prices,
 * its cargo tab, its packing list and its timeline all read it like any other.
 *
 * What is written, and what is deliberately not:
 *
 *   the container reference, the shipment reference and the packing list
 *   number come from Counter inside this transaction, as the actions mint them;
 *   the type is left to the schema's default, the ports to theirs;
 *   no box number, seal number, vessel, voyage, bill of lading, ETA, departure
 *   or arrival date, and no loading or sealing time — nobody has them, and a
 *   date written here would be read as the day the box moved;
 *   one ContainerCargo per consignment, counted from its package lines exactly
 *   as loading counts them, and the packages moved into the container;
 *   Dar's receiving rows are pointed at the container, as check-in points them,
 *   and keep every figure Dar recorded;
 *   the container's events, OPEN through ARRIVED, stamped now and each saying it
 *   was recorded at import;
 *   the packing list, frozen from the lines as sealing freezes it;
 *   a draft bill already raised is tied to its consignment's line, as pricing
 *   ties it, so the same sailing cannot be billed a second time. It stays a
 *   draft, and no price is confirmed;
 *   no cargo status moves — they are already received at Dar — so no status
 *   history row is written, only audit entries; and no customer is notified,
 *   because nothing new happened to the goods.
 *
 * One transaction under an advisory lock. It stops, writing nothing, if any of
 * the ten is missing, deleted, not RECEIVED_DAR, without a Dar receiving row, or
 * already on a container other than the one this script made. A second run
 * finds its own container and does nothing. --dry-run does all of it and rolls
 * back.
 */
import Module from "node:module";
import path from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";

/* `server-only` refuses to load outside the Next server; the packing list
   module is server code for that reason alone. Answered with its empty module
   before anything imports it. */
const resolver = Module as unknown as { _resolveFilename: (...args: unknown[]) => string };
const resolve = resolver._resolveFilename;
resolver._resolveFilename = function (this: unknown, request: unknown, ...rest: unknown[]) {
  if (request === "server-only") {
    return path.join(__dirname, "..", "node_modules", "server-only", "empty.js");
  }
  return resolve.call(this, request, ...rest);
};

const RUN = "first-container-2026-09";
const SOURCE_IMPORT = "arrived-cargo-2026-09";
const ACTOR_EMAIL = "import@historical";
const REFERENCES = Array.from({ length: 10 }, (_, i) => `SC${String(i + 1).padStart(4, "0")}`);

class DryRun extends Error {}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const { nextContainerReference, nextShipmentReference } = await import("../lib/ids");
  const { issueFor } = await import("../lib/packing-list");

  /* Both variables must name the same database — see the arrived-cargo import. */
  const pooled = process.env.DATABASE_URL;
  const direct = process.env.DIRECT_URL;
  if (!pooled) throw new Error("DATABASE_URL is not set.");
  const where = (u: string) => {
    const parsed = new URL(u);
    return `${parsed.hostname.replace("-pooler.", ".")}${parsed.pathname}`;
  };
  if (direct && where(direct) !== where(pooled)) {
    throw new Error("DATABASE_URL and DIRECT_URL name different databases. Set both for the same one.");
  }
  const url = direct || pooled;
  console.log(`Database host: ${new URL(url).hostname}${new URL(url).pathname}${dryRun ? " (dry run: rolled back)" : ""}`);

  const prisma = new PrismaClient({ datasourceUrl: url });
  const out: string[] = [];

  try {
    const run = async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${RUN}))`;

      const cargo = await tx.cargo.findMany({
        where: { reference: { in: REFERENCES } },
        orderBy: { reference: "asc" },
        select: {
          id: true,
          reference: true,
          status: true,
          deletedAt: true,
          senderId: true,
          receiverId: true,
          darReceiving: { select: { id: true, containerId: true, packagesCount: true, piecesCount: true, cbm: true } },
          packages: {
            where: { deletedAt: null },
            select: { id: true, quantity: true, pieces: true, cbm: true, weightKg: true, cargoType: true, containerId: true },
          },
          containerLines: { select: { containerId: true, container: { select: { reference: true } } } },
          invoices: {
            select: { id: true, number: true, status: true, containerCargoId: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      const problems: string[] = [];
      const found = new Set(cargo.map((c) => c.reference));
      for (const ref of REFERENCES) if (!found.has(ref)) problems.push(`${ref} does not exist`);

      /* Only the consignments that import entered — not a later SC0001 somebody
         typed at a counter on a database the import never ran against. */
      const imported = await tx.auditLog.findMany({
        where: { action: "cargo.import", entityId: { in: cargo.map((c) => c.id) } },
        select: { entityId: true, metadata: true },
      });
      const importedIds = new Set(
        imported
          .filter((a) => String((a.metadata as { importKey?: string } | null)?.importKey ?? "").startsWith(`${SOURCE_IMPORT}/`))
          .map((a) => a.entityId)
      );

      /* Already done by this script: every one on the same container, which
         this script's own audit entry names. Nothing to do. */
      const mine = await tx.auditLog.findFirst({
        where: { action: "container.import", metadata: { path: ["run"], equals: RUN } },
        select: { entityId: true, summary: true },
      });
      if (mine && cargo.length === REFERENCES.length && cargo.every((c) => c.containerLines.length === 1 && c.containerLines[0].containerId === mine.entityId)) {
        out.push(`Nothing to do: ${mine.summary}`);
        return;
      }
      if (mine) problems.push(`this script already ran (${mine.summary}) but the ten are no longer all on that container`);

      for (const c of cargo) {
        if (!importedIds.has(c.id)) problems.push(`${c.reference} was not entered by ${SOURCE_IMPORT}`);
        if (c.deletedAt) problems.push(`${c.reference} is deleted`);
        if (c.status !== "RECEIVED_DAR") problems.push(`${c.reference} is ${c.status}, not RECEIVED_DAR`);
        if (!c.darReceiving) problems.push(`${c.reference} has no Dar receiving row`);
        else if (c.darReceiving.containerId) problems.push(`${c.reference}'s Dar receiving row already names a container`);
        if (c.containerLines.length > 0) {
          problems.push(`${c.reference} is already on ${c.containerLines.map((l) => l.container.reference).join(", ")}`);
        }
        if (c.packages.length === 0) problems.push(`${c.reference} has no package lines`);
        if (c.packages.some((p) => p.containerId)) problems.push(`${c.reference} has packages already in a container`);
        const live = c.invoices.filter((i) => i.status !== "DRAFT" && i.status !== "CANCELLED");
        if (live.length) problems.push(`${c.reference} is already billed (${live.map((i) => `${i.number} ${i.status}`).join(", ")})`);
        const drafts = c.invoices.filter((i) => i.status === "DRAFT");
        if (drafts.length > 1) problems.push(`${c.reference} has ${drafts.length} drafts; one line can carry one`);
        if (drafts.some((i) => i.containerCargoId)) problems.push(`${c.reference}'s draft already names a container line`);
      }
      if (problems.length) {
        throw new Error(`Stopped; nothing was written.\n  ${problems.join("\n  ")}`);
      }

      /* Stamped in order, a millisecond apart, so the timeline reads in the
         order the steps happen rather than in whatever order equal times sort. */
      const base = Date.now();
      let tick = 0;
      const now = () => new Date(base + tick++);
      const NOTE = "recorded at import — first container, historical";

      /* createContainer */
      const reference = await nextContainerReference(tx, new Date(base));
      const container = await tx.container.create({
        data: {
          reference,
          notes:
            "The company's first container. These consignments were already checked in at Dar before this system; placed on this container by the owner's decision. No box number, seal, vessel or sailing dates are on record.",
        },
      });
      const shipment = await tx.shipment.create({
        data: {
          reference: await nextShipmentReference(tx),
          containerId: container.id,
          originPort: container.originPort,
          destinationPort: container.destinationPort,
          /* Where advanceContainer leaves a shipment on arrival. The arrival
             date it would also write is not known, so it is not written. */
          status: "ARRIVED_TANZANIA",
          notes: "Recorded at import. Vessel, voyage, bill of lading, departure and arrival dates not on record.",
        },
      });

      /* loadCargo, per consignment: the packages move, and one line counted
         from them. */
      const lines: { cargoRef: string; lineId: string; packages: number; pieces: number; cbm: Prisma.Decimal; weight: Prisma.Decimal | null }[] = [];
      for (const c of cargo) {
        await tx.cargoPackage.updateMany({
          where: { cargoId: c.id, deletedAt: null },
          data: { containerId: container.id },
        });
        const cbm = c.packages.reduce((sum, p) => sum.add(p.cbm), new Prisma.Decimal(0));
        const weight = c.packages.reduce((sum, p) => sum.add(p.weightKg ?? 0), new Prisma.Decimal(0));
        const packagesCount = c.packages.reduce((sum, p) => sum + p.quantity, 0);
        const line = await tx.containerCargo.create({
          data: {
            containerId: container.id,
            cargoId: c.id,
            packagesCount,
            cbm,
            weightKg: weight.greaterThan(0) ? weight : null,
            notes: "Placed on this container at import; loading time not on record.",
          },
        });
        lines.push({
          cargoRef: c.reference,
          lineId: line.id,
          packages: packagesCount,
          pieces: c.packages.reduce((sum, p) => sum + (p.pieces ?? 0), 0),
          cbm,
          weight: weight.greaterThan(0) ? weight : null,
        });
      }

      /* Dar check-in names the container its consignment came off. */
      for (const c of cargo) {
        await tx.darReceiving.update({ where: { id: c.darReceiving!.id }, data: { containerId: container.id } });
        await tx.fieldChange.create({
          data: {
            entity: "DarReceiving",
            entityId: c.darReceiving!.id,
            field: "containerId",
            oldValue: null,
            newValue: container.id,
            reason: `Placed on container ${reference} — first container, historical import`,
          },
        });
      }

      /* The draft keeps its figures; it is tied to the line so the sailing
         cannot be billed twice. */
      const linked: string[] = [];
      for (const c of cargo) {
        const draft = c.invoices.find((i) => i.status === "DRAFT");
        if (!draft) continue;
        const line = lines.find((l) => l.cargoRef === c.reference)!;
        await tx.invoice.update({ where: { id: draft.id }, data: { containerCargoId: line.lineId } });
        await tx.fieldChange.create({
          data: {
            entity: "Invoice",
            entityId: draft.id,
            field: "containerCargoId",
            oldValue: null,
            newValue: line.lineId,
            reason: `${c.reference} placed on container ${reference} — first container, historical import`,
          },
        });
        linked.push(`${draft.number} (${c.reference}, still DRAFT)`);
      }

      /* The path advanceContainer and sealContainer walk, one event per step. */
      const steps: [Prisma.ContainerEventCreateManyInput["from"], Prisma.ContainerEventCreateManyInput["to"], string][] = [
        [null, "OPEN", `Opened — ${NOTE}`],
        ["OPEN", "LOADING", `Loaded ${cargo.length} consignments already checked in at Dar — ${NOTE}`],
        ["LOADING", "SEALED", `Sealed — no seal number on record; ${NOTE}`],
        ["SEALED", "DEPARTED", `Departed — date not on record; ${NOTE}`],
        ["DEPARTED", "ARRIVED", `Arrived at Dar es Salaam — date not on record; ${NOTE}`],
      ];
      for (const [from, to, note] of steps) {
        await tx.containerEvent.create({ data: { containerId: container.id, from, to, note, createdAt: now() } });
      }
      await tx.container.update({ where: { id: container.id }, data: { status: "ARRIVED" } });

      /* sealContainer freezes the list from the lines. No person issued it. */
      const list = await issueFor(tx, container.id, null as unknown as string, { atSeal: true });
      if (!list) throw new Error("The packing list came out empty. Nothing was written.");

      const totals = {
        consignments: lines.length,
        packages: lines.reduce((n, l) => n + l.packages, 0),
        pieces: lines.reduce((n, l) => n + l.pieces, 0),
        cbm: lines.reduce((sum, l) => sum.add(l.cbm), new Prisma.Decimal(0)),
        weightKg: lines.some((l) => l.weight) ? lines.reduce((sum, l) => sum.add(l.weight ?? 0), new Prisma.Decimal(0)).toString() : null,
      };

      const audit = (action: string, entity: string, entityId: string, summary: string, metadata: Prisma.InputJsonValue) =>
        tx.auditLog.create({ data: { actorEmail: ACTOR_EMAIL, action, entity, entityId, summary, metadata, createdAt: now() } });

      await audit("container.create", "Container", container.id, `Opened container ${reference} — ${NOTE}`, { run: RUN });
      await tx.auditLog.createMany({
        data: cargo.map((c) => ({
          actorEmail: ACTOR_EMAIL,
          action: "container.load",
          entity: "Cargo",
          entityId: c.id,
          summary: `Placed on container ${reference} — first container, historical import`,
          metadata: { run: RUN, containerId: container.id, containerReference: reference, status: c.status },
          createdAt: now(),
        })),
      });
      await audit("container.load", "Container", container.id, `Loaded ${cargo.length} consignment(s) into ${reference} — ${NOTE}`, {
        run: RUN,
        cargo: cargo.map((c) => c.reference),
      });
      await audit("container.seal", "Container", container.id, `Sealed ${reference} with no seal number on record — ${cargo.length} consignment(s); packing list ${list.number} frozen — ${NOTE}`, {
        run: RUN,
        packingList: list.number,
        consignments: cargo.length,
      });
      await audit("container.departed", "Container", container.id, `${reference} → departed (${cargo.length} consignment(s)) — date not on record; ${NOTE}`, { run: RUN });
      await audit("container.arrived", "Container", container.id, `${reference} → arrived (${cargo.length} consignment(s)) — date not on record; ${NOTE}`, { run: RUN });
      if (linked.length) {
        await audit("invoice.link", "Container", container.id, `Tied draft ${linked.join(", ")} to its line on ${reference} — not issued, no price confirmed`, { run: RUN, linked });
      }
      await audit("container.import", "Container", container.id, `${reference} put on the record as the first container: ${totals.consignments} consignments, ${totals.packages} packages, ${totals.pieces} pieces, ${totals.cbm.toFixed(2)} m³`, {
        run: RUN,
        reference,
        shipment: shipment.reference,
        packingList: list.number,
        consignments: totals.consignments,
        packages: totals.packages,
        pieces: totals.pieces,
        cbm: totals.cbm.toString(),
        weightKg: totals.weightKg,
      });

      out.push(`${dryRun ? "Would create" : "Created"} container ${reference} (${container.type}, ${container.originPort} → ${container.destinationPort}), status ARRIVED`);
      out.push(`  shipment ${shipment.reference} (ARRIVED_TANZANIA), packing list ${list.number} (frozen)`);
      for (const l of lines) {
        out.push(`  ${l.cargoRef}: ${l.packages} pkg, ${l.pieces} pcs, ${l.cbm.toFixed(4)} m³${l.weight ? `, ${l.weight} kg` : ""}`);
      }
      out.push(`  totals: ${totals.consignments} consignments, ${totals.packages} packages, ${totals.pieces} pieces, ${totals.cbm.toFixed(2)} m³, weight ${totals.weightKg ?? "not on record"}`);
      out.push(`  events: ${steps.map((s) => s[1]).join(" → ")}`);
      out.push(`  drafts tied to their line: ${linked.length ? linked.join(", ") : "none"}`);

      if (dryRun) throw new DryRun();
    };

    try {
      await prisma.$transaction(run, { maxWait: 30_000, timeout: 120_000 });
    } catch (error) {
      if (!(error instanceof DryRun)) throw error;
    }
    console.log(out.join("\n"));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
