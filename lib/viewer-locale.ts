import "server-only";

import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

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
