import "server-only";

import QRCode from "qrcode";

import { labelSiteUrl } from "@/lib/site-url";

/**
 * WHAT A LABEL'S CODE ACTUALLY SAYS.
 *
 * Every code is a URL, because the commonest scanner this business has is the
 * phone in a customer's hand. A plain-text payload like `SWC:P:<token>` makes a
 * camera answer "no usable data found" and leaves the person holding the box
 * none the wiser. A URL opens the right page with no app and no account.
 *
 * It carries a random token, never the tracking number. Tracking numbers run in
 * sequence — SC0042 tells you SC0043 exists — and this same code is what the
 * Dar counter scans to identify a box before handing it over. A guessable code
 * is a way to walk in and claim somebody else's cargo.
 *
 * The number and "3 of 5" print in large type beside the code. Nobody reads a
 * QR by eye; they read the label and scan the code.
 */
export function qrPayload(token: string) {
  return `${labelSiteUrl()}/t/${encodeURIComponent(token)}`;
}

export async function qrDataUrl(payload: string, size = 240) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    /*
      Four modules of quiet zone, which is what the QR spec requires. One is
      enough on a screen with white space round it and not enough on a sticker
      where a printed border runs along the edge of the code — a decoder that
      cannot find clean margin may never lock on.
    */
    margin: 4,
    width: size,
    color: { dark: "#0f172aff", light: "#ffffffff" },
  });
}

export async function packageQrDataUrl(token: string, size = 500) {
  return qrDataUrl(qrPayload(token), size);
}

/**
 * Read a scanned string.
 *
 * A warehouse scanner emulates a keyboard, so what lands in the box is whatever
 * the label said: our URL, a bare token, or — when somebody types instead of
 * scans — a tracking number or a shipping mark. All four have to work, because
 * the alternative is a clerk holding a box that the screen refuses to find.
 */
export function parseScan(raw: string): { token: string } | { text: string } {
  const value = raw.trim();

  const link = value.match(/\/t\/([A-Za-z0-9_\-%]+)\/?$/);
  if (link) return { token: decodeURIComponent(link[1]) };

  const query = value.match(/[?&]t=([^&]+)/);
  if (query) return { token: decodeURIComponent(query[1]) };

  if (/^swq[a-z0-9]{12,}$/i.test(value)) return { token: value };

  return { text: value };
}
