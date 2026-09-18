/**
 * THE CUSTOMER'S PHONE NUMBER IS THEIR IDENTITY.
 *
 * Every number is stored one way — +255 and nine digits, mobile numbers
 * starting 6 or 7 — so that "0712 345 678" said at the counter, "712345678"
 * typed into the website and "+255 712-345-678" pasted from WhatsApp are one
 * customer, found by one lookup, never three accounts. Only Tanzanian numbers
 * are accepted for now; a Kenyan +254 number is refused rather than quietly
 * turned into a wrong Tanzanian one.
 *
 * Safe to import on the client: the registration form checks as the customer
 * types with the same rule the server enforces.
 */

/** "+255712345678", or null when the input is not a Tanzanian mobile number. */
export function normaliseTzPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const compact = raw.trim().replace(/[\s\-().]/g, "");
  if (!compact) return null;

  let national: string | null = null;
  if (/^\+255\d{9}$/.test(compact)) national = compact.slice(4);
  else if (/^255\d{9}$/.test(compact)) national = compact.slice(3);
  else if (/^0\d{9}$/.test(compact)) national = compact.slice(1);
  else if (/^\d{9}$/.test(compact)) national = compact;
  else return null;

  return /^[67]\d{8}$/.test(national) ? `+255${national}` : null;
}

/** Why a number was refused, in a sentence the person can act on. */
export function tzPhoneProblem(raw: string | null | undefined): string | null {
  const compact = (raw ?? "").trim().replace(/[\s\-().]/g, "");
  if (!compact) return "A phone number is required.";
  if (/^\+(?!255)\d+/.test(compact)) return "Only Tanzanian numbers (+255) are accepted for now.";
  if (normaliseTzPhone(compact)) return null;
  return "Enter a Tanzanian mobile number: +255 and nine digits, such as +255 712 345 678.";
}

/** "+255 712 345 678" for reading; storage keeps the compact form. */
export function formatTzPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const m = phone.match(/^\+255(\d{3})(\d{3})(\d{3})$/);
  return m ? `+255 ${m[1]} ${m[2]} ${m[3]}` : phone;
}

/** Whatever a search box was given, as a phone number when it can be one. */
export function phoneForSearch(raw: string): string | null {
  return normaliseTzPhone(raw);
}

/**
 * A second number, or one from somebody who is not (yet) a customer — a
 * supplier's line in Guangzhou, a caller from Nairobi. Tanzanian numbers still
 * come out in the one stored shape; anything else is kept as digits with its
 * country code rather than refused, because it identifies nobody.
 */
export function normaliseAnyPhone(raw: string): string {
  const tz = normaliseTzPhone(raw);
  if (tz) return tz;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  return digits;
}
