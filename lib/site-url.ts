import "server-only";

import { headers } from "next/headers";

/**
 * The address the public site is reached at, for the few places that must
 * print it whole: the sitemap and robots.txt.
 *
 * NEXT_PUBLIC_SITE_URL when it names a real host. A development address is
 * refused rather than published — a sitemap telling a search engine that the
 * site lives on localhost is worse than none — and in that case the host the
 * request actually arrived on is used instead, which is right on any
 * deployment that has not been configured yet.
 */
const NOT_PUBLIC = /localhost|127\.0\.0\.1|0\.0\.0\.0/;

/**
 * NEXT_PUBLIC_SITE_URL without its trailing slash, or null when it is unset or
 * names this machine.
 *
 * A NEXT_PUBLIC_ variable is written into the build, server code included, so
 * it has to be set in the environment the build runs in; changing it means a
 * redeploy.
 */
export function configuredSiteUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  return configured && !NOT_PUBLIC.test(configured) ? configured : null;
}

/**
 * The address printed where nobody can correct it afterwards: the QR code on a
 * package label and a pickup note.
 *
 * No guessing from the request here. A label printed by a clerk on an internal
 * hostname, or on the preview address of a deploy, outlives that address by
 * weeks at sea, and the phone that scans it in Dar opens nothing. In production
 * an unset address stops the print with a message saying what to set, rather
 * than putting localhost on a sticker.
 */
export function labelSiteUrl(): string {
  const configured = configuredSiteUrl();
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "http://localhost:3177";
  throw new Error(
    "NEXT_PUBLIC_SITE_URL is not set to the public address (for example https://www.swiftcargotz.com). " +
      "Set it in the deployment environment and redeploy before printing labels or pickup notes."
  );
}

/**
 * The base for absolute URLs in page metadata (Open Graph, canonical links).
 *
 * Falls back to the production domain Vercel reports, and in development to the
 * local server. Null rather than localhost when neither is known: a share card
 * with no image is better than one pointing at the reader's own machine.
 */
export function metadataBaseUrl(): URL | null {
  const configured = configuredSiteUrl();
  if (configured) return new URL(configured);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return new URL(`https://${vercel}`);
  return process.env.NODE_ENV === "production" ? null : new URL("http://localhost:3177");
}

export async function publicSiteUrl(): Promise<string> {
  const configured = configuredSiteUrl();
  if (configured) return configured;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (NOT_PUBLIC.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
