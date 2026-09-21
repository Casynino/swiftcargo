import "server-only";

import { Prisma, type CargoStatus, type PhotoKind, type ServiceType } from "@prisma/client";

import { ROUTE } from "@/lib/constants";
import { usdToTzs } from "@/lib/currency";
import { CUSTOMER_PHOTO_KINDS } from "@/lib/file-access";
import { accountsForInvoice, type InvoiceAccount } from "@/lib/invoice-accounts";
import { balanceOf } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { checkRelease, RELEASE_INCLUDE } from "@/lib/release";
import { storagePosition } from "@/lib/storage-fee";
import { publicJourney, type Journey } from "@/lib/tracking-stage";
import { storageStart } from "@/lib/storage-clock";

/**
 * PUBLIC TRACKING.
 *
 * Everything this returns is rendered to somebody who has not signed in, so it
 * is built by EXPLICIT ALLOW-LIST — a field reaches the page because it is
 * listed here, never because nobody remembered to remove it.
 *
 * WHAT A STRANGER MAY LEARN FROM A REFERENCE.
 *
 * The consignment itself: what the goods are, the volume, the count, the
 * photographs taken at our counter, where it has got to, the bill with its
 * lines and its pinned rate, what is still owed, and the accounts to pay it
 * into.
 *
 * That is the owner's decision, taken by him. He was told in plain words that
 * references run in sequence and are four digits long — that a stranger can
 * type SC0001, SC0002, SC0003 in an afternoon and read one customer's amount
 * due, invoice breakdown and cargo photographs after another. He was offered a
 * link carrying a secret suffix nobody can guess, and a public page showing the
 * stage and nothing else. He chose to publish, the way the air side already
 * does, because his customers track with the number printed on their box and
 * expect to see their own cargo when they do.
 *
 * WHAT IS STILL WITHHELD, AND IS NOT HIS TO PUBLISH BY ACCIDENT.
 *
 * Telephone numbers. The customer's and the receiver's names — the shipper is
 * printed as initials, which is enough to recognise your own consignment and
 * not enough to harvest a name against every number in the sequence. Internal
 * notes, the contents of a case, staff names, receipts, payment proofs and case
 * evidence. Any other cargo belonging to the same customer, and anything at all
 * reached by a different reference: one lookup answers for one consignment.
 *
 * A shipping mark is not a tracking code. It is a customer's name in capitals,
 * so looking cargo up by it would hand one trader's whole list to anybody who
 * knows what they are called.
 */

/** One photograph of the boxes, as the counter took it. */
export type PublicPhoto = { id: string; url: string; caption: string | null };

/** One line of the bill, read off the invoice row and never recomputed. */
export type PublicChargeLine = {
  label: string;
  /** The arithmetic under the name of it — "USD 250.00/CBM × 1.440 CBM". */
  note: string | null;
  /** Decimals travel as strings: this payload crosses into a client component. */
  amount: string;
};

export type PublicCharge = {
  /** For the download link, which is only drawn when the page was opened with
      the key from the customer's own message — see lib/track-key.ts. */
  invoiceId: string;
  invoiceNumber: string;
  currency: string;
  total: string;
  paid: string;
  outstanding: string;
  /** At the invoice's own pinned rate. Null when a dollar bill never had one. */
  totalTzs: string | null;
  outstandingTzs: string | null;
  rate: string | null;
  status: "UNPAID" | "PART_PAID" | "PAID";
  lines: PublicChargeLine[];
};

export type PublicStorage = {
  arrivedAt: string;
  daysInWarehouse: number;
  freeDays: number;
  freeDaysRemaining: number;
  chargeableDays: number;
  perDay: string;
  currency: string;
  charge: string;
  /** Today's rate, because no bill has pinned one against this accrual yet. */
  chargeTzs: string | null;
  collected: boolean;
  /** False when no rate is set: the business does not charge storage. */
  charged: boolean;
};

/** Two sentences about where the cargo actually is. Swahili leads. */
export type PublicNote = { sw: string; en: string };

export type PublicTracking = {
  reference: string;
  service: ServiceType;
  status: CargoStatus;
  /** What the goods are, as the counter wrote it down. */
  description: string;
  /** "G. M. H." — never the name itself. */
  shipperInitials: string;
  cbm: string | null;
  packages: number | null;
  pieces: number | null;
  /** "12 packages · 240 pieces" */
  countedAs: string;
  origin: string;
  destination: string;
  /** Where the boxes are standing, in the customer's words. */
  location: string;
  /** Our own container reference — the one the office can look up. */
  containerReference: string | null;
  vessel: string | null;
  receivedInChinaAt: string | null;
  expectedInDarAt: string | null;
  arrivedInDarAt: string | null;
  photos: PublicPhoto[];
  storage: PublicStorage | null;
  charge: PublicCharge | null;
  /** Where to send the money: the bill's own copy where it kept one. */
  accounts: InvoiceAccount[];
  whatsapp: string | null;
  /** The same number as it is printed for people to read. */
  whatsappLabel: string | null;
  officeAddress: string | null;
  note: PublicNote;
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

/**
 * "Grace Mwaijande Hassan" → "G. M. H."
 *
 * Enough to recognise your own consignment, not enough to put a name to every
 * reference in the sequence.
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 3);
  if (parts.length === 0) return "—";
  return parts.map((part) => `${part[0].toUpperCase()}.`).join(" ");
}

/** The record the journey is derived from. Shared with the portal. */
export const JOURNEY_INCLUDE = {
  ...RELEASE_INCLUDE,
  /* A superset of what the release check selects off the same row. The stage
     needs the condition too, because "damaged" and "short" are different
     sentences to a customer while the release check only cares that either one
     stops the boxes. */
  darReceiving: {
    select: {
      verified: true,
      discrepancy: true,
      packagesCount: true,
      condition: true,
      /* The storage clock starts here. */
      receivedAt: true,
    },
  },
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
          /* The manifest freezes when the box is sealed, so its date is the
             plainest answer there is to "has it been packed and shut". */
          packingList: { select: { issuedAt: true } },
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

  const dar = cargo.darReceiving;

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
          packingListAt: container.packingList?.issuedAt ?? null,
        }
      : null,
    billing: {
      issuedAt: issued ?? null,
      owes: live.some((invoice) => !balanceOf(invoice).settled),
      pendingClaim: live.some((invoice) =>
        invoice.payments.some((p) => p.status === "PENDING")
      ),
      /* Verified money only. A claim nobody has checked moves the customer's
         screen to "we are confirming your payment" and not one shilling
         further — see paymentState. */
      paidSome: live.some((invoice) => balanceOf(invoice).paid.greaterThan(0)),
      /* Priced by the rate book at Dar check-in and waiting on the price list.
         Never called a bill: nobody has been asked for it. */
      drafted: cargo.invoices.some((i) => i.status === "DRAFT"),
    },
    releasable: checkRelease(cargo).ok,
    /* A hold and an open case are both reasons the boxes stand still, and they
       are different sentences — so they arrive separately rather than as one
       word the customer cannot act on. */
    onHold: cargo.operationalHold,
    caseOpen: cargo.exceptions.some(
      (e) => e.status !== "RESOLVED" && e.status !== "CLOSED"
    ),
    receivedAtDar: dar !== null,
    clearance: { clearedAt: cargo.clearedAt },
    awaitingDarVerification: dar !== null && !dar.verified,
    /* Repacked is not damage — the floor put a burst carton back together,
       which is a kindness and not something to alarm a customer with. */
    damaged:
      dar?.condition === "DAMAGED" ||
      dar?.condition === "MINOR_DAMAGE" ||
      dar?.condition === "WET",
    discrepancy: dar?.discrepancy === true,
    now,
  });
}

/**
 * The shape the public payload is built from.
 *
 * Written structurally rather than as a Prisma payload type so the rule about
 * what may be published can be pinned down without a database — see
 * tests/tracking-public.test.ts, which hands this a record stuffed with
 * telephone numbers, staff notes and case references and checks that not one
 * of them comes back out.
 */
export type TrackingSource = {
  reference: string;
  service: ServiceType;
  status: CargoStatus;
  /** Storage starts once cleared into our warehouse. Absent on older fixtures. */
  clearedAt?: Date | null;
  description: string;
  sender: { fullName: string };
  chinaReceiving: {
    packagesCount: number;
    piecesCount: number | null;
    cbm: Prisma.Decimal | number | string;
    receivedAt: Date;
  } | null;
  darReceiving: {
    packagesCount: number;
    piecesCount: number | null;
    cbm: Prisma.Decimal | number | string | null;
    receivedAt: Date;
  } | null;
  photos: { id: string; url: string; caption: string | null }[];
  containerLines: {
    container: {
      reference: string;
      shipment: { vessel: string | null } | null;
    } | null;
  }[];
  history: { to: CargoStatus; createdAt: Date }[];
};

export type TrackingInvoice = {
  id: string;
  number: string;
  status: string;
  currency: string;
  total: Prisma.Decimal | number | string;
  discount: Prisma.Decimal | number | string;
  vatPercent: Prisma.Decimal | number | string;
  vatAmount: Prisma.Decimal | number | string;
  fxRate: Prisma.Decimal | number | string | null;
  totalTzs?: Prisma.Decimal | number | string | null;
  items: {
    description: string;
    quantity: Prisma.Decimal | number | string;
    unit: string | null;
    unitPrice: Prisma.Decimal | number | string;
    amount: Prisma.Decimal | number | string;
  }[];
  payments: {
    status: string;
    amount: Prisma.Decimal | number | string;
    currency: string;
    fxRate: Prisma.Decimal | number | string | null;
    baseCurrencyAmount: Prisma.Decimal | number | string | null;
    creditedAmount?: Prisma.Decimal | number | string | null;
  }[];
};

export type TrackingSettings = {
  freeStorageDays: number;
  storagePerDay: Prisma.Decimal | number | string;
  storageCurrency: string;
  whatsapp: string | null;
  phone: string | null;
  darAddress: string | null;
};

const dec = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);

/** How many packages and pieces, in the words the delivery note uses. */
function countedAs(packages: number | null, pieces: number | null): string {
  const parts: string[] = [];
  if (packages !== null) {
    parts.push(`${packages} ${packages === 1 ? "package" : "packages"}`);
  }
  if (pieces !== null && pieces > 0) {
    parts.push(`${pieces} ${pieces === 1 ? "piece" : "pieces"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

const reachedIn = (journey: Journey, key: string) =>
  journey.steps.find((s) => s.key === key)?.state !== "upcoming";

/**
 * Where the boxes are standing.
 *
 * Read from the journey rather than from the status meta, because the meta's
 * word for a consignment nobody can find is "Under investigation" — the
 * company's phrase for its own case file, not a place to print in public.
 */
function locationOf(journey: Journey, status: CargoStatus): string {
  if (status === "DELIVERED") return "Delivered to the address";
  if (status === "COLLECTED") return `Collected from our ${ROUTE.destinationCity} warehouse`;
  if (status === "MISSING_AT_DAR") return "Being located";
  if (reachedIn(journey, "RECEIVED_DAR")) return `${ROUTE.destinationCity} warehouse`;
  if (reachedIn(journey, "ARRIVED_DAR")) return `${ROUTE.destinationCity} port`;
  if (reachedIn(journey, "DEPARTED")) return "At sea";
  if (reachedIn(journey, "RECEIVED_CHINA")) return `${ROUTE.originCity} warehouse`;
  return `Awaiting arrival in ${ROUTE.originCity}`;
}

const asDate = (value: Date | null | undefined) => (value ? value.toISOString() : null);

const dayMonthYear = (value: Date | string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Dar_es_Salaam",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(value))
    : "—";

/**
 * A word to the customer about their own consignment.
 *
 * Assembled from that cargo's own dates and counts, so two customers never read
 * the same sentence and the same customer reads a different one next week. A
 * held consignment gets the journey's own neutral notice: the case, its
 * reference and its contents stay inside.
 */
function noteFor(input: {
  journey: Journey;
  status: CargoStatus;
  countedAs: string;
  darPackages: number | null;
  receivedChinaAt: Date | null;
  departedAt: Date | null;
  arrivedAt: Date | null;
  receivedDarAt: Date | null;
  handedOverAt: Date | null;
  eta: Date | null;
  freeDays: number;
  owes: boolean;
}): PublicNote {
  const { journey, status } = input;

  if (journey.notice) {
    return { sw: "Tunaufuatilia mzigo wako.", en: journey.notice };
  }
  if (status === "DELIVERED" || status === "COLLECTED") {
    return {
      sw: "Asante kwa kutuamini.",
      en:
        `${status === "DELIVERED" ? "Delivered" : "Collected"} on ` +
        `${dayMonthYear(input.handedOverAt)} — ${input.countedAs}, handed over and ` +
        `signed for. Karibu tena.`,
    };
  }
  if (journey.headline === "Ready for collection") {
    return {
      sw: "Uko tayari kuchukuliwa.",
      en:
        `Cleared for collection. Bring your reference to our ${ROUTE.destinationCity} ` +
        `warehouse — storage is free for ${input.freeDays} days from the day it landed.`,
    };
  }
  if (reachedIn(journey, "RECEIVED_DAR")) {
    return {
      sw: "Umefika Dar es Salaam salama.",
      en:
        `Landed on ${dayMonthYear(input.receivedDarAt ?? input.arrivedAt)} and counted ` +
        `in at our ${ROUTE.destinationCity} warehouse` +
        (input.darPackages !== null
          ? `, ${input.darPackages} ${input.darPackages === 1 ? "package" : "packages"} counted`
          : "") +
        (input.owes ? ". Settle the balance and we will release it the same day." : "."),
    };
  }
  if (reachedIn(journey, "ARRIVED_DAR")) {
    return {
      sw: "Meli imefika bandarini.",
      en:
        `The container arrived on ${dayMonthYear(input.arrivedAt)}. We book each ` +
        `consignment in at our ${ROUTE.destinationCity} warehouse as it comes off the box.`,
    };
  }
  if (reachedIn(journey, "DEPARTED")) {
    return {
      sw: "Mzigo wako uko baharini.",
      en:
        `It left ${ROUTE.originCity} on ${dayMonthYear(input.departedAt)}` +
        (input.eta
          ? ` and is expected in ${ROUTE.destinationCity} on ${dayMonthYear(input.eta)}`
          : "") +
        `. The crossing takes ${ROUTE.transitDaysMin}–${ROUTE.transitDaysMax} days.`,
    };
  }
  if (reachedIn(journey, "LOADED")) {
    return {
      sw: "Umepakiwa kwenye kontena.",
      en: `Loaded into a container in ${ROUTE.originCity}. We will tell you the day it sails.`,
    };
  }
  if (reachedIn(journey, "RECEIVED_CHINA")) {
    return {
      sw: "Umepokelewa Guangzhou.",
      en:
        `Counted, weighed and measured at our ${ROUTE.originCity} warehouse on ` +
        `${dayMonthYear(input.receivedChinaAt)}. It waits there until a container is loaded.`,
    };
  }
  return {
    sw: "Tunausubiri mzigo wako Guangzhou.",
    en: `Nothing has reached our ${ROUTE.originCity} warehouse under this reference yet.`,
  };
}

/**
 * The bill, as the customer's own invoice states it.
 *
 * Every figure is read off the row. Multiplying a volume by a rate here would be
 * a second opinion about what somebody owes, and the two would disagree the
 * first time Finance moved a price by hand.
 */
function chargeFrom(invoice: TrackingInvoice): PublicCharge {
  const balance = balanceOf(invoice);

  const lines: PublicChargeLine[] = invoice.items.map((item) => {
    const quantity = dec(item.quantity);
    const unitPrice = dec(item.unitPrice);
    /* The arithmetic, when the row carries it. A charge typed as one figure has
       no rate behind it, and inventing one would be worse than showing none. */
    const note =
      item.unit && quantity.greaterThan(0) && unitPrice.greaterThan(0)
        ? `${invoice.currency} ${unitPrice.toFixed(2)}/${item.unit} × ` +
          `${quantity.toFixed(3)} ${item.unit}`
        : null;
    return { label: item.description, note, amount: dec(item.amount).toFixed(2) };
  });

  const discount = dec(invoice.discount);
  if (discount.greaterThan(0)) {
    lines.push({
      label: "Punguzo (discount)",
      note: null,
      amount: discount.negated().toFixed(2),
    });
  }
  const vat = dec(invoice.vatAmount);
  if (vat.greaterThan(0)) {
    lines.push({
      label: `VAT ${dec(invoice.vatPercent).toFixed(0)}%`,
      note: null,
      amount: vat.toFixed(2),
    });
  }

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    currency: invoice.currency,
    total: balance.total.toFixed(2),
    paid: balance.paid.toFixed(2),
    outstanding: balance.outstanding.toFixed(2),
    totalTzs: balance.totalTzs ? balance.totalTzs.toFixed(0) : null,
    outstandingTzs: balance.outstandingTzs ? balance.outstandingTzs.toFixed(0) : null,
    rate: balance.rate ? balance.rate.toString() : null,
    status: balance.settled ? "PAID" : balance.paid.greaterThan(0) ? "PART_PAID" : "UNPAID",
    lines,
  };
}

/**
 * THE ALLOW-LIST, APPLIED.
 *
 * Pure: everything it knows was handed to it. That is what lets a test give it a
 * record carrying a phone number, a staff note and somebody's full name, and
 * assert that none of the three survive the trip.
 */
export function publicTracking(input: {
  cargo: TrackingSource;
  journey: Journey;
  invoice: TrackingInvoice | null;
  accounts: InvoiceAccount[];
  settings: TrackingSettings | null;
  /** Today's published rate, for an accrual no bill has pinned a rate against. */
  liveRate: Prisma.Decimal | number | string | null;
}): PublicTracking {
  const { cargo, journey, invoice, accounts, settings } = input;

  const stamps: Partial<Record<CargoStatus, Date>> = {};
  for (const row of cargo.history) stamps[row.to] ??= row.createdAt;

  const container = cargo.containerLines.at(-1)?.container ?? null;
  const packages =
    cargo.darReceiving?.packagesCount ?? cargo.chinaReceiving?.packagesCount ?? null;
  const pieces =
    cargo.darReceiving?.piecesCount ?? cargo.chinaReceiving?.piecesCount ?? null;

  /* Dar's own measurement leads once Dar has taken one — it is the volume the
     bill is priced from. China's stands until then. */
  const cbm = cargo.darReceiving?.cbm ?? cargo.chinaReceiving?.cbm ?? null;

  const arrivedInDar = journey.steps.find((s) => s.key === "ARRIVED_DAR")?.at ?? null;
  const handedOverAt = stamps.DELIVERED ?? stamps.COLLECTED ?? null;
  const counted = countedAs(packages, pieces);
  const charge = invoice ? chargeFrom(invoice) : null;

  /* The floor clock, counted from the day Dar booked the boxes in — the day
     they started taking up room. See lib/storage-fee.ts. */
  let storage: PublicStorage | null = null;
  if (cargo.darReceiving && settings) {
    const position = storagePosition({
      receivedAt: storageStart(cargo.darReceiving.receivedAt, cargo.clearedAt),
      collectedAt: handedOverAt,
      freeDays: settings.freeStorageDays,
      perDay: dec(settings.storagePerDay),
      currency: settings.storageCurrency,
    });
    /* Today's rate, not a bill's: nothing has been billed for this yet, so there
       is no pinned rate to honour and no older bill to contradict. */
    storage = {
      arrivedAt: cargo.darReceiving.receivedAt.toISOString(),
      daysInWarehouse: position.daysHeld,
      freeDays: position.freeDays,
      /* Today counts: on the last free day this reads one, never zero above a
         line saying today is still free. */
      freeDaysRemaining:
        position.chargeableDays === 0
          ? Math.max(1, position.freeDays - position.daysHeld + 1)
          : 0,
      chargeableDays: position.chargeableDays,
      perDay: position.perDay.toFixed(2),
      currency: position.currency,
      charge: position.amount.toFixed(2),
      chargeTzs:
        input.liveRate && position.currency === "USD"
          ? usdToTzs(position.amount, input.liveRate).toFixed(0)
          : null,
      collected: handedOverAt !== null,
      charged: position.configured,
    };
  }

  return {
    reference: cargo.reference,
    service: cargo.service,
    status: cargo.status,
    description: cargo.description,
    shipperInitials: initialsOf(cargo.sender.fullName),
    cbm: cbm === null ? null : dec(cbm).toFixed(3),
    packages,
    pieces,
    countedAs: counted,
    origin: ROUTE.originCity,
    destination: ROUTE.destinationCity,
    location: locationOf(journey, cargo.status),
    containerReference: container?.reference ?? null,
    vessel: container?.shipment?.vessel ?? null,
    receivedInChinaAt: asDate(cargo.chinaReceiving?.receivedAt ?? stamps.RECEIVED_CHINA),
    expectedInDarAt: asDate(journey.eta),
    arrivedInDarAt: asDate(arrivedInDar),
    photos: cargo.photos.map((photo) => ({
      id: photo.id,
      url: photo.url,
      caption: photo.caption,
    })),
    storage,
    charge,
    accounts,
    whatsapp: settings?.whatsapp ?? null,
    whatsappLabel: settings?.phone ?? settings?.whatsapp ?? null,
    officeAddress: settings?.darAddress ?? null,
    note: noteFor({
      journey,
      status: cargo.status,
      countedAs: counted,
      darPackages: cargo.darReceiving?.packagesCount ?? null,
      receivedChinaAt: cargo.chinaReceiving?.receivedAt ?? stamps.RECEIVED_CHINA ?? null,
      departedAt: journey.steps.find((s) => s.key === "DEPARTED")?.at ?? null,
      arrivedAt: arrivedInDar,
      receivedDarAt: cargo.darReceiving?.receivedAt ?? null,
      handedOverAt,
      eta: journey.eta,
      freeDays: settings?.freeStorageDays ?? 0,
      owes: charge !== null && charge.status !== "PAID",
    }),
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

/** The photographs the public page may show — the same three the portal shows. */
export const PUBLIC_PHOTO_KINDS: PhotoKind[] = CUSTOMER_PHOTO_KINDS;

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
      sender: { select: { fullName: true } },
      chinaReceiving: {
        select: { packagesCount: true, piecesCount: true, cbm: true, receivedAt: true },
      },
      /* The release check reads verified and discrepancy off the same row, so
         they stay selected; neither reaches the payload. */
      darReceiving: {
        select: {
          verified: true,
          discrepancy: true,
          condition: true,
          packagesCount: true,
          piecesCount: true,
          cbm: true,
          receivedAt: true,
        },
      },
      photos: {
        where: { kind: { in: PUBLIC_PHOTO_KINDS } },
        orderBy: { takenAt: "desc" },
        take: 12,
        select: { id: true, url: true, caption: true },
      },
    },
  });
  if (!cargo) return null;

  /*
    ONE BILL — THE ONE THE CUSTOMER IS BEING ASKED TO PAY.

    A draft is Finance's working and was never sent to anybody, so it can be
    neither owed nor shown; a cancelled bill is not owed either. The unsettled
    one leads, and with nothing owing the last one issued is what says "Paid".
  */
  const invoices = await prisma.invoice.findMany({
    where: { cargoId: cargo.id, status: { notIn: ["DRAFT", "CANCELLED"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      number: true,
      status: true,
      currency: true,
      total: true,
      discount: true,
      vatPercent: true,
      vatAmount: true,
      fxRate: true,
      totalTzs: true,
      paymentSnapshot: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          description: true,
          quantity: true,
          unit: true,
          unitPrice: true,
          amount: true,
        },
      },
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
  });
  const invoice = invoices.find((row) => !balanceOf(row).settled) ?? invoices.at(-1) ?? null;

  const [settings, liveRate] = await Promise.all([
    prisma.companySetting.findUnique({
      where: { id: "singleton" },
      select: {
        freeStorageDays: true,
        storagePerDay: true,
        storageCurrency: true,
        whatsapp: true,
        phone: true,
        darAddress: true,
      },
    }),
    prisma.exchangeRate.findFirst({
      where: { fromCurrency: "USD", toCurrency: "TZS", active: true },
      orderBy: { effectiveFrom: "desc" },
      select: { rate: true },
    }),
  ]);

  /* The accounts the bill was issued with, where it kept a copy. Editing an
     account never redraws a bill a customer is already holding — see
     lib/invoice-accounts.ts. */
  const accounts = await accountsForInvoice(invoice?.paymentSnapshot ?? null);

  return publicTracking({
    cargo,
    journey: journeyOf(cargo),
    invoice,
    accounts,
    settings,
    liveRate: liveRate?.rate ?? null,
  });
}
