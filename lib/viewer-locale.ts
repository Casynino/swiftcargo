import "server-only";

import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n";
import { cache } from "react";

import { localeOf as staffLocaleOf, type Locale as StaffLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";

/**
 * The language a staff member chose on their profile.
 *
 * Read from the user row rather than the session, so a change on the profile
 * page shows on the next screen without signing out and in again.
 */
export async function localeOf(userId: string): Promise<Locale> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { locale: true },
  });
  const chosen = row?.locale as Locale | undefined;
  return chosen && LOCALES.includes(chosen) ? chosen : DEFAULT_LOCALE;
}

/**
 * The staff language of whoever is looking at this page — English or Chinese.
 * Cached per request, so a screen that translates twenty things asks the
 * database once.
 */
export const viewerLocale = cache(async (): Promise<StaffLocale> => {
  const user = await currentUser();
  if (!user) return "en";
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { locale: true } });
  return staffLocaleOf(row?.locale);
});
