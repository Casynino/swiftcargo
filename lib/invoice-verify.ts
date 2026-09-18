import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

import { qrDataUrl } from "@/lib/qr";
import { labelSiteUrl } from "@/lib/site-url";

/**
 * THE INVOICE'S OWN CODE — NOT A CARGO CODE.
 *
 * Printed on every invoice so anybody holding one — a customer, a clearing
 * agent, a bank — can scan it and see that Swift Cargo really issued this bill
 * and whether it has been paid. A forged or altered invoice has nowhere to
 * point.
 *
 * The code is the invoice's id with a signature made from the server secret,
 * so it cannot be composed for an invoice somebody has only guessed at, and it
 * needs no column: the same invoice always yields the same code. It opens a
 * read-only verification page and nothing else; it never releases cargo — only
 * the box codes and the pickup note do that.
 */
function secret() {
  const value = process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (!value) throw new Error("AUTH_SECRET is not set.");
  return value;
}

function sign(id: string) {
  return createHmac("sha256", secret()).update(`invoice:${id}`).digest("base64url").slice(0, 24);
}

export function invoiceVerifyToken(id: string) {
  return `${id}.${sign(id)}`;
}

/** The invoice id the code names, or null when the code was not made by us. */
export function readInvoiceVerifyToken(token: string): string | null {
  const [id, mac] = token.split(".");
  if (!id || !mac || id.length > 40) return null;
  const expected = Buffer.from(sign(id));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return id;
}

export function invoiceVerifyUrl(id: string) {
  return `${labelSiteUrl()}/v/${invoiceVerifyToken(id)}`;
}

export async function invoiceQr(id: string, size = 360) {
  return qrDataUrl(invoiceVerifyUrl(id), size);
}
