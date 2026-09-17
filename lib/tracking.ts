import "server-only";

import type { CargoStatus, Prisma, ServiceType } from "@prisma/client";

import { balanceOf } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { checkRelease, RELEASE_INCLUDE } from "@/lib/release";
import { publicJourney, type Journey } from "@/lib/tracking-stage";

/**
 * PUBLIC TRACKING.
 *
 * Everything this returns is rendered to somebody who has not signed in, so it
 * is built by EXPLICIT ALLOW-LIST — a field reaches the page because it is
 * listed here, never because nobody remembered to remove it.
 *
 * WHAT A STRANGER MAY LEARN FROM A REFERENCE, AND NO MORE.
 *
 * References run in sequence and are four digits long: anyone can type SC0001
 * to SC9999 in an afternoon. So a reference alone answers "where is it and can
 * it be collected" — the journey, the container, the vessel, the ETA, whether
 * payment is still pending — and nothing that is worth walking the sequence
 * for. The goods description, the volume, the amounts, the charges and the
 * counter photographs describe what somebody owns and what it is worth; they
 * are on the customer's portal, behind their own sign-in. Staff names, notes,
 * case contents, phone numbers and other customers on the same container never
 * appear anywhere public.
 *
 * A shipping mark is not a tracking code. It is a customer's name in capitals,
 * so looking cargo up by it would hand one trader's whole list to anybody who
 * knows what they are called.
 */

export type PublicTracking = {
  reference: string;
  service: ServiceType;
  status: CargoStatus;
  packages: number | null;
  /** Our own container reference — the one the office can look up. */
  containerReference: string | null;
  vessel: string | null;
  journey: Omit<Journey, "steps" | "eta"> & {
    eta: string | null;
    steps: (Omit<Journey["steps"][number], "at"> & { at: string | null })[];
  };
};

/**
 * What a customer types, turned into what we print.
 *
 * Codes arrive with spaces, in lower case, with the letter O where a zero
 * belongs, and sometimes as the package label (SC0125-P3) rather than the
 * consignment.
 */
export function referenceFromInput(raw: string): string | null {
  const code = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!code || code.length > 40) return null;

  const onLabel = code.match(/^(SC-?[0-9O]+)-P\d+$/);
  const base = onLabel ? onLabel[1] : code;

  /* SC62 is SC0062 said aloud: the leading zeros are print padding, and the
     counter never reissues a number, so the two cannot name different cargo. */
  const sc = base.match(/^SC-?([0-9O]+)$/);
  if (sc) return `SC${sc[1].replace(/O/g, "0").padStart(4, "0")}`;

  /* Older printed references (SWC-2026-000125) are still valid names for a
     consignment migrated from the previous system. */
  if (/^[A-Z0-9][A-Z0-9-]{3,}$/.test(base)) return base;
  return null;
}

/** The record the journey is derived from. Shared with the portal. */
export const JOURNEY_INCLUDE = {
  ...RELEASE_INCLUDE,
  history: {
    select: { to: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  },
  invoices: {
    select: {
      status: true,
      total: true,
      currency: true,
      fxRate: true,
      totalTzs: true,
      issuedAt: true,
      createdAt: true,
      payments: {
        select: {
          status: true,
          amount: true,
          currency: true,
          fxRate: true,
          baseCurrencyAmount: true,
          creditedAmount: true,
        },
      },
    },
  },
  containerLines: {
    orderBy: { createdAt: "asc" },
    select: {
      container: {
        select: {
          reference: true,
          status: true,
          shipment: {
            select: { vessel: true, voyage: true, eta: true, actualArrival: true },
          },
          events: {
            where: { to: { in: ["DEPARTED", "IN_TRANSIT", "ARRIVED"] } },
            select: { to: true, createdAt: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  },
} satisfies Prisma.CargoInclude;

export type JourneyCargo = Prisma.CargoGetPayload<{
  include: typeof JOURNEY_INCLUDE;
}>;

export function journeyOf(cargo: JourneyCargo, now = new Date()): Journey {
  const stamps: Partial<Record<CargoStatus, Date>> = {};
  for (const row of cargo.history) stamps[row.to] ??= row.createdAt;

  /* The latest box it went into. A consignment split across two sailings is
     tracked by the one still moving. */
  const container = cargo.containerLines.at(-1)?.container ?? null;
  const departedEvent = container?.events.find(
    (e) => e.to === "DEPARTED" || e.to === "IN_TRANSIT"
  );
  const arrivedEvent = container?.events.find((e) => e.to === "ARRIVED");

  const live = cargo.invoices.filter(
    (i) => i.status !== "DRAFT" && i.status !== "CANCELLED"
  );
  const issued = live
    .map((i) => i.issuedAt ?? i.createdAt)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return publicJourney({
    status: cargo.status,
    stamps,
    container: container
      ? {
          status: container.status,
          departedAt: departedEvent?.createdAt ?? null,
          arrivedAt:
            container.shipment?.actualArrival ?? arrivedEvent?.createdAt ?? null,
          eta: container.shipment?.eta ?? null,
        }
      : null,
    billing: {
      issuedAt: issued ?? null,
      owes: live.some((invoice) => !balanceOf(invoice).settled),
      pendingClaim: live.some((invoice) =>
        invoice.payments.some((p) => p.status === "PENDING")
      ),
    },
    releasable: checkRelease(cargo).ok,
    onHold:
      cargo.operationalHold ||
      cargo.exceptions.some((e) => e.status !== "RESOLVED" && e.status !== "CLOSED"),
    now,
  });
}

export async function trackByReference(raw: string): Promise<PublicTracking | null> {
  const reference = referenceFromInput(raw);
  if (!reference) return null;

  const cargo = await prisma.cargo.findFirst({
    where: {
      deletedAt: null,
      reference: { equals: reference, mode: "insensitive" },
    },
    include: {
      ...JOURNEY_INCLUDE,
      chinaReceiving: { select: { packagesCount: true } },
    },
  });
  if (!cargo) return null;

  const journey = journeyOf(cargo);
  const container = cargo.containerLines.at(-1)?.container ?? null;

  return {
    reference: cargo.reference,
    service: cargo.service,
    status: cargo.status,
    packages:
      cargo.darReceiving?.packagesCount ??
      cargo.chinaReceiving?.packagesCount ??
      null,
    containerReference: container?.reference ?? null,
    vessel: container?.shipment?.vessel ?? null,
    journey: {
      ...journey,
      eta: journey.eta?.toISOString() ?? null,
      steps: journey.steps.map((step) => ({
        ...step,
        at: step.at?.toISOString() ?? null,
      })),
    },
  };
}
