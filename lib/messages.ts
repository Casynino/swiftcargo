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
  | "invoice.issued"
  | "payment.reminder"
  | "cargo.ready"
  | "general";

export const CONTACT_KIND_LABELS: Record<ContactKind, string> = {
  "cargo.received_china": "Received in China",
  "cargo.loaded": "Loaded into a container",
  "cargo.departed": "Departed China",
  "cargo.arrived": "Arrived in Tanzania",
  "cargo.received_dar": "At our Dar warehouse",
  "invoice.issued": "Invoice issued",
  "payment.reminder": "Payment reminder",
  "cargo.ready": "Ready to collect",
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
  if (context.packages) lines.push(`• Vifurushi: ${context.packages}`);
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
  return lines.join("\n");
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
  const sign = `\n\n— ${COMPANY.name}`;
  const goods = context.description ? ` (${context.description})` : "";

  switch (kind) {
    case "cargo.received_china":
      return (
        `Habari ${name}, mzigo wako${goods} umepokelewa katika ghala letu ${ROUTE.originCity}, China.\n` +
        `Namba ya kufuatilia: ${ref}\n` +
        (context.packages ? `Vifurushi: ${context.packages}\n` : "") +
        (context.cbm ? `Ujazo: ${context.cbm} CBM\n` : "") +
        `Fuatilia hapa: ${track}\n\n` +
        `Hello ${name}, we have received your cargo at our ${ROUTE.originCity} warehouse. ` +
        `Track it any time with ${ref}.` +
        sign
      );

    case "cargo.loaded":
      return (
        `Habari ${name}, mzigo wako ${ref} umepakiwa kwenye kontena` +
        (context.containerNumber ? ` ${context.containerNumber}` : "") +
        ` tayari kwa safari.\n\n` +
        `Hello ${name}, your cargo ${ref} has been loaded into a container and is ready to sail.` +
        sign
      );

    case "cargo.departed":
      return (
        `Habari ${name}, mzigo wako ${ref} umeondoka ${ROUTE.originCity}` +
        (context.vessel ? ` kwa meli ${context.vessel}` : "") +
        ` kuelekea ${ROUTE.destinationCity}.\n` +
        `Safari ya baharini huchukua siku ${ROUTE.transitDaysMin}–${ROUTE.transitDaysMax}.\n` +
        (context.eta ? `Tunatarajia kufika: ${day(context.eta)}\n` : "") +
        `\nHello ${name}, your cargo ${ref} has left ${ROUTE.originCity} for ${ROUTE.destinationCity}. ` +
        `Sea transit takes ${ROUTE.transitDaysMin}–${ROUTE.transitDaysMax} days.` +
        sign
      );

    case "cargo.arrived":
      return (
        `Habari ${name}, mzigo wako ${ref} umefika bandari ya ${ROUTE.destinationCity}. ` +
        `Tunaendelea na taratibu za forodha na tutakujulisha ukiwa tayari.\n\n` +
        `Hello ${name}, your cargo ${ref} has arrived at ${ROUTE.destinationCity} port. ` +
        `We are clearing it and will let you know when it is ready.` +
        sign
      );

    case "cargo.received_dar":
      return (
        `Habari ${name}, mzigo wako ${ref} umefika ghala letu ${ROUTE.destinationCity}. ` +
        `Tunauhakiki na tutakutumia invoice hivi punde.\n\n` +
        `Hello ${name}, your cargo ${ref} is at our ${ROUTE.destinationCity} warehouse. ` +
        `We are checking it in and your invoice will follow shortly.` +
        sign
      );

    case "invoice.issued":
      /* The same shape as the reminder: the customer reads one message layout
         whichever desk sent it, with the shilling figure in bold and the link
         to the bill underneath. */
      return (
        `*${COMPANY.name.toUpperCase()}*\n\n` +
        `Habari ${name},\n` +
        `Mzigo wako umefika salama ${ROUTE.destinationCity} na uko tayari ` +
        `kuchukuliwa baada ya malipo kuthibitishwa.\n\n` +
        cargoBlock(context) +
        storageBlock(context) +
        `\n\n*Angalia invoice yako kamili na njia za malipo:*\n` +
        `${track}/${ref}`
      );

    case "payment.reminder":
      return (
        `*${COMPANY.name.toUpperCase()}*\n\n` +
        `Habari ${name},\n` +
        `Mzigo wako umefika salama ${ROUTE.destinationCity} na uko tayari ` +
        `kuchukuliwa baada ya malipo kuthibitishwa.\n\n` +
        cargoBlock(context) +
        storageBlock(context) +
        `\n\n*Angalia invoice yako kamili na njia za malipo:*\n` +
        `${track}/${ref}`
      );

    case "cargo.ready":
      return (
        `*${COMPANY.name.toUpperCase()}*\n\n` +
        `Habari ${name},\n` +
        `Mzigo wako umelipiwa na uko tayari kuchukuliwa katika ghala letu ` +
        `${ROUTE.destinationCity}.\n\n` +
        cargoBlock(context) +
        `\n\nTafadhali njoo na kitambulisho.` +
        storageBlock(context) +
        `\n\n*Fuatilia mzigo wako:*\n${track}/${ref}`
      );

    default:
      return (
        `Habari ${name},\n\nHello ${name},` + (ref ? ` (${ref})` : "") + sign
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
