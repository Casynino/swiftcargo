import "server-only";

import { COMPANY, ROUTE } from "@/lib/constants";

/**
 * WHAT WE SAY TO CUSTOMERS, AND WHEN.
 *
 * Two honest constraints shaped this file:
 *
 *  1. The system does not deliver anything. It composes the wording and opens
 *     WhatsApp with it; a member of staff presses send. A logged contact means
 *     "we contacted them", never "the system notified them".
 *
 *  2. Swahili first. These go to traders in Dar es Salaam and Swahili is what
 *     they read. English follows for the ones who prefer it, in the same
 *     message, because splitting them means guessing which one to send.
 *
 * Sea freight, not air: nothing here mentions flights, airway bills or next-day
 * anything. A container is four weeks on the water and the wording says so.
 */

export type ContactKind =
  | "cargo.received_china"
  | "cargo.loaded"
  | "cargo.departed"
  | "cargo.arrived"
  | "cargo.received_dar"
  | "cargo.cleared_unpaid"
  | "invoice.issued"
  | "payment.reminder"
  | "cargo.ready"
  | "storage.expired"
  | "general";

export const CONTACT_KIND_LABELS: Record<ContactKind, string> = {
  "cargo.received_china": "Received in China",
  "cargo.loaded": "Loaded into a container",
  "cargo.departed": "Departed China",
  "cargo.arrived": "At Dar port — clearance in progress",
  "cargo.received_dar": "At our Dar warehouse",
  "cargo.cleared_unpaid": "Cleared — payment required",
  "invoice.issued": "Invoice issued",
  "payment.reminder": "Payment reminder",
  "cargo.ready": "Ready for pickup",
  "storage.expired": "Free storage ended",
  general: "Something else",
};

export const CONTACT_CHANNELS = [
  ["WHATSAPP", "WhatsApp"],
  ["PHONE", "Phone call"],
  ["SMS", "SMS"],
  ["EMAIL", "Email"],
  ["IN_PERSON", "In person"],
] as const;

export type MessageContext = {
  customerName: string;
  reference?: string | null;
  description?: string | null;
  shippingMark?: string | null;
  packages?: number | null;
  cbm?: string | null;
  containerNumber?: string | null;
  vessel?: string | null;
  eta?: Date | null;
  invoiceNumber?: string | null;
  amount?: string | null;
  currency?: string | null;
  amountTzs?: string | null;
  /**
   * The rate FROZEN ON THE INVOICE, never today's published one. A customer
   * quoted at 2,650 who reads 2,720 next month believes the bill changed.
   */
  fxRate?: string | null;
  /** The rate per cubic metre this cargo was charged at. */
  ratePerCbm?: string | null;
  /** Free days on the Dar floor, and what a day costs after that. */
  freeStorageDays?: number | null;
  storagePerDay?: string | null;
  storageCurrency?: string | null;
  /**
   * Where the boxes physically are, so a bill or a reminder never says "arrived
   * and ready" about goods still at sea or still in clearance.
   */
  stage?: "china" | "transit" | "clearance" | "cleared" | "ready" | null;
  /** A status line for the details block. */
  statusLine?: string | null;
  /** The last free day on the Dar floor, once the clock has started. */
  lastFreeDay?: Date | null;
  trackUrl?: string;
};

/**
 * THE MESSAGE THE CUSTOMER ACTUALLY GETS.
 *
 * One shape for every consignment, in Swahili, with the company name at the top
 * and the tracking link at the bottom. Swahili first because it is the language
 * the customer reads; the figures are the ones on their bill, not today's.
 *
 * WhatsApp renders *asterisks* as bold and • as a bullet, which is why they are
 * written literally — the message has to look right in the app, not in a
 * terminal.
 */
function cargoBlock(context: MessageContext): string {
  const lines: string[] = ["*MAELEZO YA MZIGO*"];
  if (context.reference) lines.push(`• Tracking: ${context.reference}`);
  if (context.invoiceNumber) lines.push(`• Invoice: ${context.invoiceNumber}`);
  if (context.description) lines.push(`• Bidhaa: ${context.description}`);
  if (context.cbm) lines.push(`• Ujazo: ${context.cbm} CBM`);
  if (context.ratePerCbm) {
    lines.push(`• Rate: ${context.currency ?? "USD"} ${context.ratePerCbm}/CBM`);
  }
  /* Shillings first: it is the figure they will hand over. The dollar figure
     and the rate the bill was issued at sit under it, so nobody reads a
     dollar number as the amount due. */
  if (context.amountTzs) {
    lines.push(`• *Kiasi cha kulipa: TZS ${context.amountTzs}*`);
    if (context.amount) lines.push(`• Sawa na: ${context.currency ?? "USD"} ${context.amount}`);
    if (context.fxRate) lines.push(`• Exchange Rate: 1 USD = ${context.fxRate} TZS`);
  } else if (context.amount) {
    lines.push(`• Kiasi cha kulipa: ${context.currency ?? "USD"} ${context.amount}`);
  }
  if (context.statusLine) lines.push(`• Status: ${context.statusLine}`);
  return lines.join("\n");
}

/**
 * The storage terms as they stand at Dar arrival: the free days counted from
 * the day the boxes were confirmed here, and the fee only when one is set —
 * a rate nobody configured is never quoted to a customer.
 */
function arrivalStorageBlock(context: MessageContext): string {
  const days = context.freeStorageDays ?? 7;
  const fee =
    context.storagePerDay && Number(context.storagePerDay) > 0
      ? ` Baada ya siku ${days}, storage fee ya ${context.storageCurrency ?? "USD"} ${context.storagePerDay} kwa siku itatozwa hadi mzigo utakapochukuliwa.`
      : "";
  return (
    `\n\n*STORAGE:* Siku ${days} bure kuanzia siku mzigo unapothibitishwa kufika ` +
    `${ROUTE.destinationCity}.${fee}`
  );
}

function storageBlock(context: MessageContext): string {
  if (!context.storagePerDay || Number(context.storagePerDay) <= 0) return "";
  return (
    `\n\n*STORAGE:* Siku ${context.freeStorageDays ?? 7} bure, baada ya hapo ` +
    `${context.storageCurrency ?? "USD"} ${context.storagePerDay}/siku hadi mzigo uchukuliwe.`
  );
}

const day = (date: Date | null | undefined) =>
  date
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date)
    : null;

/**
 * The tracking address a customer is given.
 *
 * A localhost value is refused rather than sent: anybody composing a message on
 * a dev machine would otherwise put a link in a customer's WhatsApp that
 * resolves to the customer's own phone.
 */
/**
 * WHATSAPP REMEMBERS A LINK'S CARD FOREVER.
 *
 * Its servers fetch the preview once per exact address and keep it, so a link
 * already sent keeps showing the card it had that day — the old wording, the
 * old picture. Bumping this tag changes the address enough for a fresh fetch
 * while the page it opens is the same one.
 */
const SHARE_TAG = "s=2";

/**
 * Where a consignment physically is, in the grain the letters need. Ready is
 * the release check's answer, passed in; everything else is read off the
 * record.
 */
export function messageStage(cargo: {
  status: string;
  hasDarReceiving: boolean;
  clearedAt: Date | null;
  ready?: boolean;
}): NonNullable<MessageContext["stage"]> {
  if (cargo.ready || cargo.status === "READY_FOR_RELEASE") return "ready";
  if (cargo.hasDarReceiving || cargo.status === "ARRIVED_TANZANIA") {
    return cargo.clearedAt ? "cleared" : "clearance";
  }
  if (["REGISTERED", "RECEIVED_CHINA", "ASSIGNED_TO_CONTAINER", "CONTAINER_LOADED"].includes(cargo.status)) {
    return "china";
  }
  return "transit";
}

export function trackUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured && !configured.includes("localhost")) {
    return `${configured.replace(/\/$/, "")}/track`;
  }
  return "swiftcargo.co.tz/track";
}

export function composeMessage(
  kind: ContactKind,
  context: MessageContext
): string {
  const name = context.customerName.split(" ")[0] ?? context.customerName;
  const ref = context.reference ?? "";
  const track = context.trackUrl ?? trackUrl();
  const link = ref ? `${track}/${ref}?${SHARE_TAG}` : track;

  /**
   * ONE LETTER, WHATEVER THE DESK.
   *
   * Company name, a greeting on its own line, one sentence saying where the
   * cargo is, the details as bullets, the storage terms, then the link. Support,
   * Finance and the owner all send this shape, so a customer who gets two
   * messages in a week reads the same thing twice rather than two inventions.
   */
  const letter = (
    sentence: string,
    options: {
      details?: boolean;
      storage?: boolean;
      linkLabel?: string;
      /** Replaces the usual storage terms. */
      storageText?: string;
      closing?: string;
    } = {}
  ) => {
    const { details = true, storage = true, linkLabel, storageText, closing } = options;
    return (
      `*${COMPANY.name.toUpperCase()}*\n\n` +
      `Habari ${name} !\n\n` +
      `${sentence}` +
      (details ? `\n\n${cargoBlock(context)}` : "") +
      (storageText ?? (storage ? storageBlock(context) : "")) +
      `\n\n*${linkLabel ?? "Fuatilia mzigo wako:"}*\n${link}` +
      (closing ? `\n\n${closing}` : "")
    );
  };

  switch (kind) {
    case "cargo.received_china":
      return letter(
        `Mzigo wako umepokelewa katika ghala letu ${ROUTE.originCity}, China, ` +
          `na unasubiri kupakiwa kwenye kontena.`,
        { storage: false }
      );

    case "cargo.loaded":
      return letter(
        `Mzigo wako umepakiwa kwenye kontena` +
          (context.containerNumber ? ` ${context.containerNumber}` : "") +
          ` tayari kwa safari kuelekea ${ROUTE.destinationCity}.`,
        { storage: false }
      );

    case "cargo.departed":
      return letter(
        `Mzigo wako umeondoka ${ROUTE.originCity}` +
          (context.vessel ? ` kwa meli ${context.vessel}` : "") +
          ` kuelekea ${ROUTE.destinationCity}. Safari ya baharini huchukua siku ` +
          `${ROUTE.transitDaysMin}–${ROUTE.transitDaysMax}` +
          (context.eta ? `, tunatarajia kufika ${day(context.eta)}` : "") +
          `.`,
        { storage: false }
      );

    /*
      ARRIVED IS NOT READY.

      The first message from Dar — the ship is in and customs has the goods —
      says they are here and in clearance, that another message will follow,
      and what storage costs once they reach our warehouse. It never tells the
      customer to come, and never says ready: a customer who travels to the
      warehouse for goods still in customs has been lied to by us.
    */
    case "cargo.arrived":
      return letter(
        `Mzigo wako umefika salama ${ROUTE.destinationCity} na kwa sasa uko kwenye ` +
          `hatua ya customs clearance. Tunaendelea na taratibu za kuutoa kwenye ` +
          `clearance, na mara tu utakapokuwa umekamilika utapokea notification ` +
          `nyingine ya kukujulisha kuwa mzigo wako uko tayari kuchukuliwa.`,
        {
          storageText: arrivalStorageBlock(context),
          linkLabel: "Angalia taarifa za mzigo wako:",
          closing:
            "Tutakujulisha mara tu mzigo wako utakapokuwa umekamilisha clearance " +
            "na kuwa tayari kuchukuliwa.",
        }
      );

    case "cargo.received_dar":
      return letter(
        `Mzigo wako umekamilisha clearance na sasa umefika ghala letu ` +
          `${ROUTE.destinationCity}. Malipo yakithibitishwa utakuwa tayari ` +
          `kuchukuliwa — tutakujulisha.`,
        { linkLabel: "Angalia taarifa za mzigo wako:" }
      );

    case "cargo.cleared_unpaid":
      return letter(
        `Mzigo wako umekamilisha clearance ${ROUTE.destinationCity}. Malipo bado ` +
          `yanahitajika kabla ya kuuchukua — ukishalipa na malipo kuthibitishwa, ` +
          `mzigo utakuwa tayari kuchukuliwa.`,
        { linkLabel: "Angalia invoice yako kamili na njia za malipo:" }
      );

    case "invoice.issued":
    case "payment.reminder":
      /* The bill can go out while the ship is at sea; the sentence says where
         the goods actually are, and only says ready when they are. */
      if (context.stage === "ready" || context.stage === "cleared") {
        return letter(
          `Mzigo wako umefika salama ${ROUTE.destinationCity}, umekamilisha ` +
            `clearance na sasa uko tayari kuchukuliwa baada ya malipo kuthibitishwa.`,
          { linkLabel: "Angalia invoice yako kamili na njia za malipo:" }
        );
      }
      if (context.stage === "clearance") {
        return letter(
          `Mzigo wako umefika ${ROUTE.destinationCity} na uko kwenye customs ` +
            `clearance. Invoice yako iko tayari — unaweza kulipa sasa ili mzigo ` +
            `uwe tayari kuchukuliwa mara clearance itakapokamilika.`,
          { linkLabel: "Angalia invoice yako kamili na njia za malipo:" }
        );
      }
      return letter(
        `Invoice ya mzigo wako iko tayari. Unaweza kulipa sasa, hata kama mzigo ` +
          `bado uko njiani. Tutakujulisha mzigo ukifika ${ROUTE.destinationCity} ` +
          `na ukiwa tayari kuchukuliwa.`,
        { storage: false, linkLabel: "Angalia invoice yako kamili na njia za malipo:" }
      );

    case "cargo.ready":
      /* Paid is not ready. A pickup note can be written while the ship is at
         sea; the letter says so rather than sending somebody to the gate. */
      if (context.stage && context.stage !== "ready") {
        return letter(
          `Malipo yako yamethibitishwa, asante. ` +
            (context.stage === "clearance"
              ? `Mzigo wako umefika ${ROUTE.destinationCity} na bado uko kwenye customs clearance.`
              : context.stage === "cleared"
                ? `Mzigo wako umekamilisha clearance; tunaandaa pickup note yako.`
                : `Mzigo wako bado uko njiani kuelekea ${ROUTE.destinationCity}.`) +
            ` Tutakujulisha mara tu utakapokuwa tayari kuchukuliwa.`,
          { storage: context.stage === "clearance" || context.stage === "cleared" }
        );
      }
      return letter(
        `Mzigo wako umefika salama ${ROUTE.destinationCity}, umekamilisha clearance ` +
          `na malipo yamethibitishwa. Sasa uko tayari kuchukuliwa katika ghala letu — ` +
          `tafadhali njoo na pickup note yako na kitambulisho.`,
        { linkLabel: "Angalia pickup note na taarifa za mzigo wako:" }
      );

    case "storage.expired":
      return letter(
        `Siku ${context.freeStorageDays ?? 7} za storage bure kwa mzigo wako ` +
          `zimekwisha` +
          (context.lastFreeDay ? ` (siku ya mwisho ilikuwa ${day(context.lastFreeDay)})` : "") +
          `. ` +
          (context.storagePerDay && Number(context.storagePerDay) > 0
            ? `Storage fee ya ${context.storageCurrency ?? "USD"} ${context.storagePerDay} kwa siku inaweza kutozwa hadi mzigo utakapochukuliwa.`
            : `Gharama za storage zinaweza kuanza kutozwa.`),
        { storage: false }
      );

    default:
      return letter(
        `Tunakuandikia kuhusu mzigo wako.`,
        { details: !!ref, storage: false }
      );
  }
}

/**
 * The wa.me address for a Tanzanian or Chinese number.
 *
 * WhatsApp wants digits only with the country code and no plus. A number saved
 * as "0767 852 126" is a local habit, not an international number, and sending
 * it as-is opens a chat with nobody.
 */
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("255")) return digits;
  if (digits.startsWith("0")) return `255${digits.slice(1)}`;
  if (digits.startsWith("86")) return digits;
  return digits;
}
