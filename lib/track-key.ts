import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

/**
 * THE KEY IN A CUSTOMER'S TRACKING LINK THAT OPENS THEIR BILL.
 *
 * A reference is a counter — SC0019 is followed by SC0020 — so the tracking
 * page cannot hand a full invoice (name, phone, lines, our bank accounts) to
 * whoever types one. The link we send in WhatsApp carries this key as well:
 * it is signed with the server secret over the reference, so it cannot be
 * composed for cargo somebody has only guessed at, and it needs no column.
 * With it the page offers the invoice as a PDF; without it the page is the
 * public tracking page it always was.
 *
 * Signed over the reference rather than the id because every letter already
 * carries the reference, and a reference is never issued twice.
 */
function secret() {
  const value = process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (!value) throw new Error("AUTH_SECRET is not set.");
  return value;
}

function sign(reference: string) {
  return createHmac("sha256", secret())
    .update(`track:${reference.toUpperCase()}`)
    .digest("base64url")
    .slice(0, 16);
}

export function trackKey(reference: string): string {
  return sign(reference);
}

/** True only for the key we made for this reference. */
export function trackKeyValid(reference: string, key: string | null | undefined): boolean {
  if (!key || key.length > 64) return false;
  const expected = Buffer.from(sign(reference));
  const given = Buffer.from(key);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
