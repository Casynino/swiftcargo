"use server";

import { Prisma } from "@prisma/client";

import { outstandingOf } from "@/lib/invoice-balance";
import { formatDate, formatMoney, normaliseCode } from "@/lib/format";
import { parseScan } from "@/lib/qr";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { checkRelease, RELEASE_INCLUDE } from "@/lib/release";
import { recordScan, resolveScanToken } from "@/lib/scan";
import { authorize } from "@/lib/session";

/**
 * WHAT THE SCAN SCREEN NEEDS TO SHOW, FOR ONE CONSIGNMENT.
 *
 * Everything a clerk reads back to the customer before anything moves, plus
 * the computed answer to "may this go" — never a second opinion of it. Money
 * is present only when the viewer holds `finance.view`: the warehouse never
 * sees a price, on this screen exactly as on every other.
 */
export type ScanTarget = {
  cargoId: string;
  reference: string;
  customerName: string;
  customerPhone: string | null;
  description: string;
  shippingMark: string | null;
  status: string;
  /* Only the fields a client component may hold. checkRelease's own
     `outstanding` is a Prisma.Decimal — server-only, and never sent across
     the wire. The figure a customer may see, once it exists, is `finance`
     below, formatted before it ever leaves the server. */
  check: { ok: boolean; conditions: { label: string; passed: boolean; detail?: string }[]; blockedBy: string | null };
  /** What Dar actually counted, the truth this screen is read against. */
  measured: { packages: number | null; weightKg: string | null; cbm: string | null };
  /** How far the individual boxes have been scanned out. */
  boxes: { done: number; total: number };
  /** The one box a real scan named, when it named one — not a queue pick. */
  scannedBox: { sequence: number; of: number } | null;
  pickupNote: { noteNumber: string; status: string } | null;
  /** The bale number Guangzhou wrote on the outside, when there is one. */
  carton: string | null;
  /** The container this consignment sailed or is waiting on. */
  container: string | null;
  /** When Dar counted the boxes in — the date on the paper, not a status word. */
  arrivedInDar: string;
  /* The payment fact, without the figure — what the counter needs to hand a
     box over, present only while the note is still live. The amount itself
     is `finance` below, gated the same way it is everywhere else. */
  payment: { noteNumber: string; issuedAt: string; amountPaid: string | null } | null;
  finance: {
    invoiceNumber: string;
    total: string;
    paid: string;
    outstanding: string;
    owes: boolean;
  } | null;
};

export type ScanResult = { ok: true; data: ScanTarget } | { ok: false; error: string };

/**
 * ONE SCAN, ONE CONSIGNMENT, THE FULL ANSWER.
 *
 * `raw` is whatever landed in the box: a URL off a QR code, a bare token, or a
 * tracking number typed by hand. `lib/qr.ts#parseScan` tells the two apart;
 * either path lands on the same record, checked the same way — a typed
 * SC0057 and a scanned label carry equal weight, because both name the same
 * boxes and neither proves more about what is on the counter than the other
 * already does.
 *
 * `checkRelease` is the only place "may this go" is decided. This function
 * reads its answer; it never computes one of its own.
 */
export async function resolveForRelease(raw: string): Promise<ScanResult> {
  const actor = await authorize("cargo.scan");
  const value = raw.trim();
  if (!value) return { ok: false, error: "Scan a box, or type the tracking number." };

  const parsed = parseScan(value);
  const logToken = "token" in parsed ? parsed.token : value;
  let cargoId: string | null = null;
  let scannedBox: ScanTarget["scannedBox"] = null;

  if ("token" in parsed) {
    const scanned = await resolveScanToken(parsed.token);
    if (scanned) {
      cargoId = scanned.cargoId;
      if (scanned.box) scannedBox = { sequence: scanned.box.sequence, of: scanned.box.of };
    }
  } else {
    /* A typed reference names one consignment directly — the same number
       printed on the delivery note and the box label. Nothing fuzzy: a
       shipping mark shared by several consignments belongs on the by-hand
       list below, not a guess made here. */
    const clean = normaliseCode(parsed.text);
    const found = await prisma.cargo.findFirst({
      where: { deletedAt: null, reference: { equals: clean, mode: "insensitive" } },
      select: { id: true },
    });
    cargoId = found?.id ?? null;
  }

  if (!cargoId) {
    await recordScan({
      token: logToken,
      user: actor,
      workflow: "release",
      action: "open",
      result: "unknown",
      detail: "No cargo matches this code.",
    });
    return { ok: false, error: "No cargo matches that code." };
  }

  const cargo = await prisma.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    include: {
      ...RELEASE_INCLUDE,
      /* issuedAt/amountPaid/currency: the payment panel's own facts, kept off
         RELEASE_INCLUDE because checkRelease has no use for them. */
      pickupNote: {
        select: { status: true, onCredit: true, noteNumber: true, issuedAt: true, amountPaid: true, currency: true },
      },
      receiver: { select: { fullName: true, phone: true } },
      chinaReceiving: { select: { packagesCount: true, weightKg: true, cbm: true } },
      darReceiving: {
        select: {
          verified: true,
          discrepancy: true,
          packagesCount: true,
          weightKg: true,
          cbm: true,
          receivedAt: true,
        },
      },
      packages: {
        where: { deletedAt: null, balerNumber: { not: null } },
        select: { balerNumber: true },
        take: 1,
      },
      containerLines: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { container: { select: { reference: true } } },
      },
    },
  });
  if (!cargo) return { ok: false, error: "That cargo no longer exists." };

  const full = checkRelease(cargo);
  const check = { ok: full.ok, conditions: full.conditions, blockedBy: full.blockedBy };

  const total = await prisma.cargoBox.count({ where: { cargoId: cargo.id, voidedAt: null } });
  const done = total
    ? await prisma.cargoBox.count({
        where: { cargoId: cargo.id, voidedAt: null, collectedAt: { not: null } },
      })
    : 0;

  /* Dar's measurement wins once it exists — the same rule the delivery
     paperwork uses everywhere else — falling back to China's for a
     consignment not yet booked in here. */
  const measuredRow = cargo.darReceiving ?? cargo.chinaReceiving;

  /* The invoice, for whoever is allowed to see one. Absent from the object
     for the warehouse — not merely hidden by the screen — because CLAUDE.md
     is explicit that the floor never sees a price. */
  const live = cargo.invoices.find((i) => i.status !== "CANCELLED" && i.status !== "DRAFT");
  let finance: ScanTarget["finance"] = null;
  if (can(actor.role, "finance.view") && live) {
    const invoice = await prisma.invoice.findFirst({
      where: { cargoId: cargo.id, status: { notIn: ["CANCELLED"] } },
      orderBy: { createdAt: "desc" },
      select: { number: true },
    });
    const owed = outstandingOf(live);
    finance = {
      invoiceNumber: invoice?.number ?? "",
      total: formatMoney(live.total, live.currency),
      paid: formatMoney(new Prisma.Decimal(live.total).sub(owed), live.currency),
      outstanding: formatMoney(owed, live.currency),
      owes: owed.greaterThan(0),
    };
  }

  /* Only while the note is live — a collected or cancelled consignment gets
     no green "settled" panel, the same rule the fuller invoice card follows. */
  const note = cargo.pickupNote;
  const payment: ScanTarget["payment"] =
    note && note.status === "ACTIVE"
      ? {
          noteNumber: note.noteNumber,
          issuedAt: formatDate(note.issuedAt),
          amountPaid: can(actor.role, "finance.view")
            ? formatMoney(note.amountPaid, note.currency)
            : null,
        }
      : null;

  await recordScan({
    token: logToken,
    user: actor,
    workflow: "release",
    action: "open",
    result: full.ok ? "ok" : "warning",
    cargoId: cargo.id,
  });

  return {
    ok: true,
    data: {
      cargoId: cargo.id,
      reference: cargo.reference,
      customerName: cargo.receiver.fullName,
      customerPhone: cargo.receiver.phone,
      description: cargo.description,
      shippingMark: cargo.shippingMark,
      status: cargo.status,
      check,
      measured: {
        packages: measuredRow?.packagesCount ?? null,
        weightKg: measuredRow?.weightKg ? measuredRow.weightKg.toString() : null,
        cbm: measuredRow?.cbm ? measuredRow.cbm.toString() : null,
      },
      boxes: { done, total },
      scannedBox,
      pickupNote: cargo.pickupNote
        ? { noteNumber: cargo.pickupNote.noteNumber, status: cargo.pickupNote.status }
        : null,
      carton: cargo.packages[0]?.balerNumber ?? null,
      container: cargo.containerLines[0]?.container.reference ?? null,
      arrivedInDar: formatDate(cargo.darReceiving?.receivedAt ?? null),
      payment,
      finance,
    },
  };
}
