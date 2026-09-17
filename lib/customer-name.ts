/**
 * ONE NAME PER CUSTOMER.
 *
 * The business knows a customer by the name on their boxes. The shipping mark is
 * normally that same name in capitals, and printing both reads as two different
 * people. The mark is shown beside the name only when it genuinely says
 * something else — a trading name — and never when it is the name again.
 */
export function distinctMark(name: string, mark: string | null | undefined): string | null {
  if (!mark) return null;
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
  const m = norm(mark);
  const n = norm(name);
  if (!m || m === n) return null;
  /* NAME-13: the same name with a customer number to keep it unique. */
  if (m.startsWith(n) && /^\d+$/.test(m.slice(n.length))) return null;
  return mark;
}
