import "server-only";

import { headers } from "next/headers";

/**
 * HOW OFTEN ONE ADDRESS MAY ASK.
 *
 * Tracking references run in sequence — SC0042 says SC0043 exists — so a
 * script walking the numbers is the obvious thing to stop, and the website
 * forms are the only writes a stranger can make. Both are throttled here.
 *
 * The counts live in this server process's memory. That is a floor, not a
 * wall: on a host that runs several instances, each keeps its own count, so the
 * real ceiling is the limit times the instances. What makes enumeration
 * pointless is what the tracking page leaves out (see lib/tracking.ts); this
 * only makes it slow. The forms carry a second limit read from the database,
 * which every instance shares.
 */

type Bucket = { count: number; resetAt: number };

const store: Map<string, Bucket> =
  ((globalThis as { __swcRateLimit?: Map<string, Bucket> }).__swcRateLimit ??=
    new Map());

export type Limit = { ok: true } | { ok: false; retryAfterSeconds: number };

export function hit(key: string, max: number, windowMs: number): Limit {
  const now = Date.now();

  /* Swept on write rather than on a timer, so an idle server holds nothing and
     a busy one never grows past the addresses seen in one window. */
  if (store.size > 5_000) {
    for (const [k, bucket] of store) if (bucket.resetAt <= now) store.delete(k);
  }

  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true };
}

/**
 * The caller's address, as the proxy in front of us reports it.
 *
 * The first entry of x-forwarded-for. Vercel writes that header itself and
 * discards whatever the client sent; a proxy that passes a client's own value
 * through would let a script choose a fresh bucket per request, which is one
 * more reason this module is a floor and not the defence.
 */
export async function clientAddress(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "unknown";
}
