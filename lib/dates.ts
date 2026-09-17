import "server-only";

/**
 * A DATE SOMEBODY COULD HAVE MEANT.
 *
 * A native date input will happily hand back the year 226 — a clerk typing a
 * deadline hits the year field, types "226", tabs away, and the form is valid
 * as far as the browser is concerned. It saved, it printed on a container as
 * "11 Nov 226", and every list that sorts by date put it at the top of history.
 *
 * So the boundary checks it. Nothing in a sea-freight system legitimately
 * refers to the third century or the twenty-second, and refusing the value with
 * a sentence is better than storing a number nobody will question until it is
 * on a customs document.
 */
const EARLIEST = new Date("2000-01-01T00:00:00.000Z");
const LATEST = new Date("2100-01-01T00:00:00.000Z");

export class DateOutOfRange extends Error {
  constructor(readonly field: string) {
    super(`That ${field} is not a date anybody meant — check the year.`);
  }
}

/**
 * Parse a form date. Returns null for blank, throws for nonsense.
 *
 * `label` is what the person called the field, so the message reads back in
 * their own words rather than in the column name.
 */
export function formDate(
  raw: string | null | undefined,
  label: string
): Date | null {
  const text = (raw ?? "").trim();
  if (!text) return null;

  const value = new Date(text);
  if (Number.isNaN(value.getTime())) throw new DateOutOfRange(label);
  if (value < EARLIEST || value >= LATEST) throw new DateOutOfRange(label);
  return value;
}

/** For `min`/`max` on a date input, so the browser argues first. */
export const DATE_INPUT_RANGE = {
  min: "2000-01-01",
  max: "2099-12-31",
} as const;
