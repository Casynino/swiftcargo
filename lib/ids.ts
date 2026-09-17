import { randomBytes } from "crypto";

import type { TxClient } from "@/lib/prisma";

/**
 * Human-readable document numbers.
 *
 * Every number is minted from the Counter table INSIDE THE CALLER'S
 * TRANSACTION, so two clerks pressing Save in the same second cannot receive
 * the same one. `nextSequence` therefore always takes a transaction client and
 * never the bare prisma singleton — a number handed out by a connection that
 * later rolls back is a gap at best and a duplicate at worst.
 */
async function nextSequence(tx: TxClient, key: string): Promise<number> {
  const counter = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return counter.value;
}

const pad = (n: number, width = 6) => String(n).padStart(width, "0");

const year = () => new Date().getFullYear();

/**
 * THE TRACKING NUMBER: SC0001, SC0002, SC0003.
 *
 * Six characters, said down a phone line in one breath. SWC-2026-000125 was
 * fifteen of which twelve were the same on every consignment — all the work of
 * reading it, none of the information.
 *
 * It runs in order, and every number looks like every other number, which is
 * the point: a customer who has shipped before recognises the shape, and a
 * clerk reading a list can see at a glance that nothing is missing between two
 * rows. Random codes were unguessable but told nobody anything, and two of them
 * side by side looked like two different systems.
 *
 * Minted from Counter inside the caller's transaction, so two clerks pressing
 * Save in the same second cannot be handed the same one. The counter is global
 * and never resets — SC0999 in December is followed by SC1000 in January, and
 * a number is never reissued to a second consignment.
 */
export async function nextCargoReference(tx: TxClient) {
  return `SC${pad(await nextSequence(tx, "cargo"), 4)}`;
}

/** A line within it. SC0125-P3. Composed, not counted. */
export function packageReference(cargoReference: string, sequence: number) {
  return `${cargoReference}-P${sequence}`;
}

export async function nextCustomerCode(tx: TxClient) {
  return `CUS-${pad(await nextSequence(tx, "customer"))}`;
}

/**
 * The customer's shipping mark: SWC-NINO-125.
 *
 * Built from a name, not counted, because the point of a mark is that a factory
 * worker in Guangzhou can write it on a box with a marker pen and a clerk can
 * read it back off a photo. Sequential digits at the end keep two customers
 * called Nino apart; the name in the middle is what makes it human.
 */
/**
 * A NEW CUSTOMER'S MARK IS THEIR NAME.
 *
 * A customer is known by one thing — the name written on their boxes — so the
 * mark is that name as the boxes carry it, not a code this system invents. The
 * column is unique: a second trader with the same name gets their customer
 * number after it, which is plain and still theirs alone.
 */
export async function shippingMarkFor(
  tx: TxClient,
  name: string,
  customerCode: string,
  wanted?: string | null
) {
  const mark = (wanted?.trim() || name).trim().replace(/\s+/g, " ").toUpperCase();
  const taken = await tx.customer.findFirst({ where: { shippingMark: mark }, select: { id: true } });
  if (!taken) return mark;
  const digits = customerCode.replace(/\D/g, "").replace(/^0+/, "") || "0";
  return `${mark}-${digits}`;
}

export async function nextDeliveryNoteNumber(tx: TxClient, y = year()) {
  return `DN-${y}-${pad(await nextSequence(tx, `deliveryNote:${y}`))}`;
}

/**
 * OUR OWN NAME FOR THE BOX: SWC26M09C5.
 *
 * The shape the business already uses — two-digit year, M and the month it was
 * opened, then C and the container's number. The number RUNS FROM ONE AND NEVER
 * RESETS, not even in January: C5 in December is followed by C6 in the new
 * year, so "container six" means one box for as long as the company exists.
 * Resetting annually would give two boxes the same name a year apart, which is
 * exactly the confusion a reference is for avoiding.
 *
 * Minted here and never typed. The shipping line's own box number — MSCU1234567
 * — is a different thing, arrives with the allocation and is recorded at
 * sealing.
 */
export async function nextContainerReference(tx: TxClient, at = new Date()) {
  const yy = String(at.getFullYear()).slice(-2);
  const mm = pad(at.getMonth() + 1, 2);
  return `SWC${yy}M${mm}C${await nextSequence(tx, "container")}`;
}

export async function nextPackingListNumber(tx: TxClient, y = year()) {
  return `PL-${y}-${pad(await nextSequence(tx, `packingList:${y}`))}`;
}

export async function nextShipmentReference(tx: TxClient, y = year()) {
  return `SHP-${y}-${pad(await nextSequence(tx, `shipment:${y}`))}`;
}

export async function nextInvoiceNumber(tx: TxClient, y = year()) {
  return `INV-${y}-${pad(await nextSequence(tx, `invoice:${y}`))}`;
}

/**
 * A block of invoice numbers, taken in one go.
 *
 * Raising a draft for every consignment on a container means asking the counter
 * three hundred times, one round trip each. One increment of N hands back the
 * whole run and is exactly as safe: the upsert is atomic, so two desks invoicing
 * different containers at the same moment get disjoint blocks.
 *
 * Returned in order, oldest number first.
 */
export async function reserveInvoiceNumbers(
  tx: TxClient,
  count: number,
  y = year()
): Promise<string[]> {
  if (count <= 0) return [];
  const counter = await tx.counter.upsert({
    where: { key: `invoice:${y}` },
    create: { key: `invoice:${y}`, value: count },
    update: { value: { increment: count } },
  });
  const last = counter.value;
  return Array.from(
    { length: count },
    (_, i) => `INV-${y}-${pad(last - count + 1 + i)}`
  );
}

export async function nextPaymentReference(tx: TxClient, y = year()) {
  return `PAY-${y}-${pad(await nextSequence(tx, `payment:${y}`))}`;
}

export async function nextReceiptNumber(tx: TxClient, y = year()) {
  return `RCT-${y}-${pad(await nextSequence(tx, `receipt:${y}`))}`;
}

/** The customer's permission to collect. PN-2026-000123. */
export async function nextPickupNoteNumber(tx: TxClient, y = year()) {
  return `PN-${y}-${pad(await nextSequence(tx, `pickupNote:${y}`))}`;
}

export async function nextReleaseNumber(tx: TxClient, y = year()) {
  return `REL-${y}-${pad(await nextSequence(tx, `release:${y}`))}`;
}

export async function nextDeliveryReference(tx: TxClient, y = year()) {
  return `DEL-${y}-${pad(await nextSequence(tx, `delivery:${y}`))}`;
}

export async function nextExpenseReference(tx: TxClient, y = year()) {
  return `EXP-${y}-${pad(await nextSequence(tx, `expense:${y}`))}`;
}

export async function nextTransferReference(tx: TxClient, y = year()) {
  return `TRF-${y}-${pad(await nextSequence(tx, `transfer:${y}`))}`;
}

export async function nextExceptionReference(tx: TxClient, y = year()) {
  return `EXC-${y}-${pad(await nextSequence(tx, `exception:${y}`))}`;
}

export async function nextConversationReference(tx: TxClient, y = year()) {
  return `TKT-${y}-${pad(await nextSequence(tx, `conversation:${y}`))}`;
}

/* Requests off the website are not year-scoped: they are a queue, not a ledger,
   and a booking reference that resets every January is one a customer can quote
   back at you ambiguously twelve months later. */
export async function nextSourcingReference(tx: TxClient, y = year()) {
  return `SRC-${y}-${pad(await nextSequence(tx, `sourcing:${y}`))}`;
}

export async function nextBookingReference(tx: TxClient) {
  return `BK-${pad(await nextSequence(tx, "booking"))}`;
}

export async function nextPickupReference(tx: TxClient) {
  return `PU-${pad(await nextSequence(tx, "pickup"))}`;
}

export async function nextQuoteReference(tx: TxClient) {
  return `QT-${pad(await nextSequence(tx, "quote"))}`;
}

/**
 * The value physically encoded in the cargo's QR code.
 *
 * Deliberately NOT the reference: references are sequential and public, so
 * anyone could guess one and present a forged label at the Dar counter. 160 bits
 * of entropy makes the QR itself the credential.
 */
export function generateQrToken() {
  return `SWQ${randomBytes(20).toString("base64url")}`;
}
