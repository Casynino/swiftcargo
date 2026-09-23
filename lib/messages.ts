import "server-only";

import { COMPANY, ROUTE } from "@/lib/constants";
import { normalSiteUrl } from "@/lib/site-url";
import { trackKey } from "@/lib/track-key";

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

/**
 * Where customers collect, and from when, in the owner's words. On the letter
 * rather than on the warehouse record because it is wording they chose — the
 * godown's everyday name, not its postal address.
 */
const PICKUP_PLACE = "warehouse (godown) yetu Sinza Mapambano";
const PICKUP_FROM = "kuanzia kesho saa 9:30 asubuhi";

export type MessageContext = {
  customerName: string;
  reference?: string | null;
  description?: string | null;
  shippingMark?: string | null;
  packages?: number | null;
  pieces?: number | null;
  /** The warehouse receipt the counter wrote the goods in on. */
  receiptNumber?: string | null;
  weightKg?: string | null;
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
  /** The day the storage clock started (cleared into our warehouse). */
  storageFrom?: Date | null;
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
  if (!context.statusLine && context.stage === "clearance") {
    context = { ...context, statusLine: "Clearance in Progress" };
  }
  const lines: string[] = ["*MAELEZO YA MZIGO*"];
  if (context.reference) lines.push(`• Tracking: ${context.reference}`);
  if (context.invoiceNumber) lines.push(`• Invoice: ${context.invoiceNumber}`);
  if (context.description) lines.push(`• Bidhaa: ${context.description}`);
  if (context.cbm) lines.push(`• Ujazo: ${context.cbm} CBM`);
  if (context.packages != null) lines.push(`• Mizigo: ${context.packages}`);
  if (context.pieces != null) lines.push(`• Vipande: ${context.pieces}`);
  if (context.weightKg) lines.push(`• Uzito: ${context.weightKg} kg`);
  if (context.shippingMark) lines.push(`• Shipping mark: ${context.shippingMark}`);
  if (context.receiptNumber) lines.push(`• Namba ya risiti: ${context.receiptNumber}`);
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
/**
 * WHICH LETTER THIS CONSIGNMENT IS DUE, FROM WHERE IT STANDS.
 *
 * One rule, read by every screen with a Notify button on it, so the floor
 * list, the consignment page and anything added later all send the same
 * sentence about the same boxes. The customer's story runs in one line:
 * received in China, on the way, at the port in clearance, then ready to
 * collect — and the storage clock only starts at that last one.
 */
export function letterForStage(cargo: {
  status: string;
  clearedAt?: Date | null;
  hasDarReceiving?: boolean;
}): ContactKind {
  switch (cargo.status) {
    case "REGISTERED":
    case "RECEIVED_CHINA":
      return "cargo.received_china";
    case "ASSIGNED_TO_CONTAINER":
    case "CONTAINER_LOADED":
      return "cargo.loaded";
    case "DEPARTED_CHINA":
    case "IN_TRANSIT":
      return "cargo.departed";
    case "ARRIVED_TANZANIA":
      return cargo.clearedAt ? "cargo.cleared_unpaid" : "cargo.arrived";
    case "RECEIVED_DAR":
      return cargo.clearedAt ? "cargo.received_dar" : "cargo.arrived";
    case "READY_FOR_RELEASE":
      return "cargo.ready";
    default:
      return "general";
  }
}

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

/**
 * Which letter a bill goes out in. At the port, in clearance, it is the
 * arrival letter with the bill inside it; everywhere else, the bill's own.
 */
export function billLetter(
  stage: MessageContext["stage"],
  owing: boolean
): ContactKind {
  if (stage === "clearance") return "cargo.arrived";
  return owing ? "payment.reminder" : "invoice.issued";
}

export function trackUrl(): string {
  const configured = normalSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  return configured ? `${configured}/track` : "https://www.swiftcargotz.com/track";
}

/**
 * THE STATUS LINE EVERY LETTER CARRIES.
 *
 * The details block is the same eight bullets on every message a customer
 * gets, and the last of them says where the goods are standing. A letter
 * without it is the one a customer forwards to us asking "so where is it now?"
 *
 * Read from the letter being sent, not from the record, because the letter IS
 * the claim: whoever pressed Notify is telling the customer this.
 */
function statusFor(
  kind: ContactKind,
  stage: MessageContext["stage"]
): string | null {
  switch (kind) {
    case "cargo.received_china":
      return "Received in China";
    case "cargo.loaded":
      return "Loaded into a container";
    case "cargo.departed":
      return "In transit";
    case "cargo.arrived":
      return "Clearance in Progress";
    case "cargo.received_dar":
    case "cargo.cleared_unpaid":
      return "Cleared — Ready for Pickup";
    case "cargo.ready":
      return stage === "ready" || stage === "cleared"
        ? "Cleared — Ready for Pickup"
        : stage === "clearance"
          ? "Clearance in Progress"
          : "In transit";
    case "storage.expired":
      return "Free storage ended";
    case "invoice.issued":
    case "payment.reminder":
      return stage === "ready" || stage === "cleared"
        ? "Cleared — Ready for Pickup"
        : stage === "clearance"
          ? "Clearance in Progress"
          : stage === "china"
            ? "Received in China"
            : "In transit";
    default:
      return null;
  }
}

export function composeMessage(
  kind: ContactKind,
  context: MessageContext
): string {
  /* Every letter has the same shape: the greeting, one sentence saying where
     the cargo is, the details, what happens next, and the tracking link. The
     status is part of the details on all of them. */
  const line = statusFor(kind, context.stage);
  if (line && !context.statusLine) context = { ...context, statusLine: line };
  const name = context.customerName.split(" ")[0] ?? context.customerName;
  const ref = context.reference ?? "";
  const track = context.trackUrl ?? trackUrl();
  /* The key lets the page offer this customer's invoice as a PDF. */
  const link = ref ? `${track}/${ref}?${SHARE_TAG}&k=${trackKey(ref)}` : track;

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
      /** The details block from a different view of the context. */
      detailsContext?: MessageContext;
      closing?: string;
    } = {}
  ) => {
    const { details = true, storage = true, linkLabel, storageText, closing, detailsContext } = options;
    return (
      `*${COMPANY.name.toUpperCase()}*\n\n` +
      `Habari ${name}!\n\n` +
      `${sentence}` +
      (details ? `\n\n${cargoBlock(detailsContext ?? context)}` : "") +
      (storageText ?? (storage ? storageBlock(context) : "")) +
      /* The closing sentence sits above the link: the link is the last thing
         in the message, where a thumb finds it. */
      (closing ? `\n\n${closing}` : "") +
      `\n\n*${linkLabel ?? "Fuatilia mzigo wako:"}*\n${link}`
    );
  };

  /*
    CLEARED AND IN OUR GODOWN: COME AND COLLECT.

    The owner's letter for goods out of clearance and on our floor. It says
    where and from when, that payment must be complete before coming, what is
    owed (nothing, once paid), and that the free storage runs from the day the
    goods came in — "leo" only when that is today.
  */
  const warehouseLetter = () => {
    const days = context.freeStorageDays ?? 7;
    const from = context.storageFrom;
    const today = new Date();
    const sameDay =
      from &&
      from.toLocaleDateString("en-GB", { timeZone: "Africa/Dar_es_Salaam" }) ===
        today.toLocaleDateString("en-GB", { timeZone: "Africa/Dar_es_Salaam" });
    const start = !from || sameDay ? "kuanzia leo" : `kuanzia ${day(from)}`;
    const fee =
      context.storagePerDay && Number(context.storagePerDay) > 0
        ? ` Baada ya hapo, storage fee ya ${context.storageCurrency ?? "USD"} ${context.storagePerDay} kwa siku itatozwa hadi mzigo utakapochukuliwa.`
        : "";
    const billed = Boolean(context.amountTzs || context.amount);
    return letter(
      `Tunakukaribisha kuja kuchukua mzigo wako kwenye ${PICKUP_PLACE}, ${PICKUP_FROM}. ` +
        `Tafadhali hakikisha malipo yamekamilika kabla ya kuja.`,
      {
        storageText: `\n\n*STORAGE:* Siku ${days} bure ${start}.${fee}`,
        linkLabel: billed ? "Angalia invoice na njia za malipo:" : "Angalia taarifa za mzigo wako:",
        /* The bill's number stays on the letter. A customer paying at a bank
           counter is asked what the payment is for, and "the cargo one" is not
           an answer either side can reconcile afterwards. */
        detailsContext: { ...context, statusLine: "Cleared — Ready for Pickup" },
      }
    );
  };

  switch (kind) {
    case "cargo.received_china":
      return letter(
        `Mzigo wako umepokelewa salama katika warehouse yetu nchini China.`,
        {
          storage: false,
          closing:
            `Mzigo wako sasa umepokelewa na umeingia kwenye mfumo wa ${COMPANY.name}. ` +
            `Tutakujulisha mara utakapowekwa kwenye safari kuelekea ${ROUTE.destinationCountry ?? "Tanzania"}.`,
          /* The one line of the block this letter states rather than reads: at
             this moment the goods are in China and nowhere else, whatever the
             record has since become. */
          detailsContext: { ...context, statusLine: context.statusLine ?? "Received in China" },
        }
      );

    case "cargo.loaded":
      return letter(
        `Mzigo wako umepakiwa kwenye kontena` +
          (context.containerNumber ? ` ${context.containerNumber}` : "") +
          ` tayari kwa safari kuelekea ${ROUTE.destinationCity}.`,
        {
          storage: false,
          closing: `Tutakujulisha mara meli itakapoondoka ${ROUTE.originCity}${
            context.eta ? `, na tunatarajia kufika ${day(context.eta)}` : ""
          }.`,
        }
      );

    /*
      AT SEA, AND THE DAY IT IS DUE.

      One date, not two: once the box has sailed the system knows the day it
      is expected (the departure plus the crossing — lib/eta.ts), and that is
      the day the customer's own tracking page shows them. A range quoted
      beside it is this company telling one person two different things about
      the same boat. The range is for a sailing with no date yet.
    */
    case "cargo.departed":
      return letter(
        `Mzigo wako umeondoka ${ROUTE.originCity}` +
          (context.vessel ? ` kwa meli ${context.vessel}` : "") +
          ` kuelekea ${ROUTE.destinationCity}. ` +
          (context.eta
            ? `Tunatarajia kufika tarehe ${day(context.eta)}.`
            : `Safari ya baharini huchukua siku ${ROUTE.transitDaysMin}-${ROUTE.transitDaysMax}.`),
        {
          storage: false,
          closing:
            `Tutakujulisha mara meli itakapofika bandarini ${ROUTE.destinationCity} ` +
            `na mzigo utakapoanza customs clearance.`,
        }
      );

    /*
      ARRIVED IS NOT READY.

      The first message from Dar — the ship is in and customs has the goods —
      says they are here and in clearance, that another message will follow,
      and what storage costs once they reach our warehouse. It never tells the
      customer to come, and never says ready: a customer who travels to the
      warehouse for goods still in customs has been lied to by us.
    */
    case "cargo.arrived": {
      /* Short, in the owner's words. With a bill out, the amount is in it and
         the customer is told they can pay now; the invoice number itself is
         left to the page the link opens. */
      const billed = Boolean(context.amountTzs || context.amount);
      const days = context.freeStorageDays ?? 7;
      const fee =
        context.storagePerDay && Number(context.storagePerDay) > 0
          ? ` Baada ya siku ${days}, storage fee ya ${context.storageCurrency ?? "USD"} ${context.storagePerDay}/siku itatozwa hadi mzigo utakapochukuliwa.`
          : "";
      return letter(
        `Mzigo wako umefika salama ${ROUTE.destinationCity} na kwa sasa uko kwenye ` +
          `customs clearance. ` +
          (billed
            ? `Unaweza kulipa sasa ili uwe tayari kuchukuliwa mara clearance itakapokamilika.`
            : `Tutakujulisha mara tu utakapokuwa tayari kuchukuliwa.`),
        {
          /* The clock starts when the goods leave clearance for our warehouse,
             so that is what the customer is told. */
          storageText:
            `\n\n*STORAGE:* Baada ya mzigo wako kutoka kwenye clearance, utapata siku ` +
            `${days} bure za kuhifadhiwa kwenye warehouse yetu ${ROUTE.destinationCity}.${fee}`,
          linkLabel: billed ? "Angalia invoice na njia za malipo:" : "Fuatilia mzigo wako:",
          detailsContext: { ...context, statusLine: "Clearance in Progress" },
        }
      );
    }

    case "cargo.received_dar":
      return warehouseLetter();

    case "cargo.cleared_unpaid":
      return warehouseLetter();

    case "invoice.issued":
    case "payment.reminder":
      /* The bill can go out while the ship is at sea; the sentence says where
         the goods actually are, and only says ready when they are. */
      if (context.stage === "ready" || context.stage === "cleared") {
        return warehouseLetter();
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
      if (!context.stage || context.stage === "ready" || context.stage === "cleared") {
        return warehouseLetter();
      }
      /* Paid is not ready. A pickup note can be written while the ship is at
         sea; the letter says so rather than sending somebody to the gate. */
      return letter(
        `Malipo yako yamethibitishwa, asante. ` +
          (context.stage === "clearance"
            ? `Mzigo wako umefika ${ROUTE.destinationCity} na bado uko kwenye customs clearance.`
            : `Mzigo wako bado uko njiani kuelekea ${ROUTE.destinationCity}.`) +
          ` Tutakujulisha mara tu utakapokuwa tayari kuchukuliwa.`,
        { storage: false }
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
        {
          storage: false,
          closing: `Tafadhali njoo kuchukua mzigo wako kwenye ${PICKUP_PLACE}.`,
        }
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
