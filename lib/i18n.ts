/**
 * The interface, in one language for now.
 *
 * English is the key, not an invented code: `t("Receive cargo")` reads at the
 * call site as the thing it renders, so a screen stays legible to whoever edits
 * it next, and a string with no translation falls through to English instead of
 * showing a bare `nav.receive_cargo` to a warehouse floor.
 *
 * Swahili is the customer's language and will be added as a dictionary here —
 * the reason every user-facing string goes through this function today, while
 * the dictionary is empty, is that retrofitting it later means touching every
 * component instead of one file. Chinese for the Guangzhou floor follows the
 * same shape.
 *
 * The trade is that changing English copy silently drops its translation. That
 * is the right way round: an untranslated English label is a small annoyance,
 * and a Swahili label that still says what the English used to say is a wrong
 * instruction.
 */

export type Locale = "en" | "sw" | "zh";

export const LOCALES: Locale[] = ["en", "sw", "zh"];
export const DEFAULT_LOCALE: Locale = "en";

const SW: Record<string, string> = {};
const ZH: Record<string, string> = {};

const DICTIONARIES: Record<Locale, Record<string, string>> = {
  en: {},
  sw: SW,
  zh: ZH,
};

export function t(locale: Locale | undefined | null, english: string): string {
  if (!locale || locale === "en") return english;
  return DICTIONARIES[locale]?.[english] ?? english;
}
