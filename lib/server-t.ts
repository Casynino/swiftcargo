import "server-only";

import { cache } from "react";

import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { viewerLocale } from "@/lib/viewer-locale";

/*
  THE READER'S LANGUAGE, WITHOUT THREADING IT THROUGH EVERY HELPER.

  A page asks once — `await primeLocale()` at its top — and every server
  component rendered under it, in that file or another, translates with `T()`.
  React's cache is per request, so two people reading the same page in two
  languages never see each other's.

  Before a page primes it, T() answers in English, which is what every screen
  said before there was a dictionary: a missed prime is untranslated, never
  wrong.
*/
const current = cache((): { locale: Locale } => ({ locale: "en" }));

export async function primeLocale(): Promise<Locale> {
  const locale = await viewerLocale();
  current().locale = locale;
  return locale;
}

export function T(text: string): string {
  return t(current().locale, text);
}

/**
 * Goods in the reader's language: the Chinese to a Chinese reader, the English
 * to everyone else, and whichever exists when only one does. Never blank while
 * either was typed.
 */
export function P(en: string | null | undefined, zh: string | null | undefined): string {
  const first = current().locale === "zh" ? zh : en;
  return (first?.trim() || en?.trim() || zh?.trim() || "");
}
