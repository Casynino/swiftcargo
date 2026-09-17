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
