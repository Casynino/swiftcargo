/**
 * Links built from the company's own contact settings.
 *
 * The numbers on CompanySetting are typed for people to read — "+255 767 852
 * 126" — and a tel: or wa.me link with the spaces and plus sign left in fails
 * on some phones and opens WhatsApp to nobody on others. The formatting is kept
 * for display and stripped only here.
 */

export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** Null when the setting is empty or holds no digits, so no dead button renders. */
export function whatsappHref(number: string | null | undefined) {
  const digits = (number ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? `https://wa.me/${digits}` : null;
}

/**
 * A WhatsApp chat that opens with the message already written.
 *
 * NOBODY SHOULD ARRIVE IN THE DESK'S INBOX SAYING NOTHING. A bare wa.me link
 * opens an empty chat, and what lands is "Hi" — the desk then spends two
 * messages finding out who is writing and about what. With the greeting and the
 * reference already in the box the customer presses send once, and the first
 * thing the desk reads is the thing it needs.
 *
 * Swahili first: it is the customer's language, and the warmth is the point.
 * The text is the customer's to edit before they send it — it is a draft in
 * their app, not a message anybody sends on their behalf.
 */
export function whatsappLink(
  number: string | null | undefined,
  text?: string | null
): string | null {
  const base = whatsappHref(number);
  if (!base || !text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}

/** The openers, in one place so every entrance to the desk sounds the same. */
export const WHATSAPP_OPENER = {
  /** No reference to hand — the footer, the contact page. */
  general: "Habari Swift Cargo! Mambo vipi? Naomba msaada kuhusu usafirishaji wa mzigo.",
  /** Asking about one consignment. */
  cargo: (reference: string) =>
    `Habari Swift Cargo! Mambo vipi? Naomba msaada kuhusu mzigo ${reference}.`,
  /** Sending the slip for a bill. */
  paymentProof: (reference: string) =>
    `Habari Swift Cargo! Mambo vipi? Nimelipia mzigo ${reference} — huu hapa uthibitisho wa malipo.`,
} as const;
