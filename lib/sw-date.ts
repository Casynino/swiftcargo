/*
  DATES IN KISWAHILI, THE WAY THE SAILING NOTICE WRITES THEM.

  "Novemba 16, 2026 (Jumatatu)": month, day, year, weekday in brackets. Read in UTC, because a sailing date is a
  calendar day, not a moment, and must not slide to the next day for somebody in another time zone.
*/
const MONTHS = ["Januari", "Februari", "Machi", "Aprili", "Mei", "Juni", "Julai", "Agosti", "Septemba", "Oktoba", "Novemba", "Disemba"];
const MONTHS_SHORT = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ago", "Sep", "Okt", "Nov", "Des"];
const WEEKDAYS = ["Jumapili", "Jumatatu", "Jumanne", "Jumatano", "Alhamisi", "Ijumaa", "Jumamosi"];

/** Novemba 16, 2026 (Jumatatu) */
export function swDate(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} (${WEEKDAYS[d.getUTCDay()]})`;
}

/** Novemba 16 */
export function swDay(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Nov 16 */
export function swShort(d: Date): string {
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Ijumaa */
export function swWeekday(d: Date): string {
  return WEEKDAYS[d.getUTCDay()];
}
