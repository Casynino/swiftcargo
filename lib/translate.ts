import "server-only";

import { detectLocale, type Locale } from "@/lib/locale";
import { prisma, type TxClient } from "@/lib/prisma";

/**
 * WHAT THE GUANGZHOU DESK TYPED, IN THE LANGUAGE THE DAR COUNTER READS.
 *
 * Three sources, in this order, as on the air side:
 *
 *  1. The glossary (CargoTerm). Instant, free, and the same words every time.
 *  2. A translation service, only if the deployment has a key. It never blocks
 *     a save: four seconds, then the cargo is saved without it.
 *  3. Nothing. The original stands — a missing translation is an
 *     inconvenience, a blank description is a box nobody can identify.
 *
 * What a person typed is never thrown away: it is kept in the column of its
 * own language.
 */

export type Bilingual = { en: string | null; zh: string | null };

function normalise(term: string) {
  return term.trim().replace(/[（]/g, "(").replace(/[）]/g, ")").replace(/\s+/g, " ");
}

/* "Accessories (配件)" — the shape clerks invented for this very problem. */
const PAIR = /^(.+?)\s*[（(]\s*([^（()）]+?)\s*[)）]\s*$/;

export function splitPair(text: string): { en: string; zh: string } | null {
  const match = normalise(text).match(PAIR);
  if (!match) return null;
  const [, a, b] = match;
  const aLang = detectLocale(a);
  const bLang = detectLocale(b);
  if (aLang === bLang || !aLang || !bLang) return null;
  return aLang === "zh" ? { zh: a.trim(), en: b.trim() } : { zh: b.trim(), en: a.trim() };
}

async function machineTranslate(text: string, from: Locale, to: Locale): Promise<string | null> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) return null;
  try {
    const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text, source: from, target: to, format: "text" }),
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { data?: { translations?: Array<{ translatedText?: string }> } };
    const out = data.data?.translations?.[0]?.translatedText?.trim();
    return out && out !== text ? out : null;
  } catch {
    return null;
  }
}

/** Add a pairing, or leave a person's pairing alone. */
export async function learnTerm(
  zh: string,
  en: string,
  source: "STAFF" | "MACHINE",
  db: TxClient | typeof prisma = prisma
) {
  const key = normalise(zh);
  const english = normalise(en);
  if (!key || !english || detectLocale(key) !== "zh" || detectLocale(english) !== "en") return;

  const existing = await db.cargoTerm.findUnique({ where: { zh: key }, select: { id: true, source: true } });
  if (!existing) {
    await db.cargoTerm.create({ data: { zh: key, en: english, source, timesUsed: 1 } });
    return;
  }
  const improve = source === "STAFF" && existing.source === "MACHINE";
  await db.cargoTerm.update({
    where: { id: existing.id },
    data: { timesUsed: { increment: 1 }, ...(improve ? { en: english, source: "STAFF" as const } : {}) },
  });
}

/**
 * One description, in both languages as far as they can be known.
 *
 * `typedZh` is what the clerk put in the Chinese box, when the form has one:
 * a line described twice teaches the glossary and is kept exactly as typed.
 */
export async function bilingual(
  typed: string | null | undefined,
  typedZh?: string | null,
  db: TxClient | typeof prisma = prisma
): Promise<Bilingual> {
  const original = (typed ?? "").trim();
  const zhTyped = (typedZh ?? "").trim();

  if (original && zhTyped) {
    if (detectLocale(original) === "en") await learnTerm(zhTyped, original, "STAFF", db);
    return { en: original, zh: zhTyped };
  }
  const text = original || zhTyped;
  if (!text) return { en: null, zh: null };

  const pair = splitPair(text);
  if (pair) {
    await learnTerm(pair.zh, pair.en, "STAFF", db);
    return pair;
  }

  const lang = detectLocale(text);
  /* A model number or a brand reads the same in both. */
  if (!lang) return { en: text, zh: null };

  const key = normalise(text);
  const known = await db.cargoTerm.findFirst({
    where: lang === "zh" ? { zh: key } : { en: { equals: key, mode: "insensitive" } },
    orderBy: { timesUsed: "desc" },
    select: { zh: true, en: true },
  });
  if (known) return lang === "zh" ? { en: known.en, zh: text } : { en: text, zh: known.zh };

  const machine = await machineTranslate(text, lang, lang === "zh" ? "en" : "zh");
  if (machine) {
    const pairOut = lang === "zh" ? { en: machine, zh: text } : { en: text, zh: machine };
    await learnTerm(pairOut.zh, pairOut.en, "MACHINE", db);
    return pairOut;
  }
  return lang === "zh" ? { en: null, zh: text } : { en: text, zh: null };
}
