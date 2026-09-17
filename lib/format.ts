import { Prisma } from "@prisma/client";

/**
 * Business-facing time is Tanzanian time.
 *
 * Everything is stored in UTC — the database, every timestamp, every
 * comparison. This is the display layer, and it is fixed to Africa/Dar_es_Salaam
 * rather than the reader's browser on purpose: a manager in Guangzhou reading
 * "received at 14:20" must see the same 14:20 the Dar clerk saw, or the two of
 * them are discussing different afternoons.
 */
export const BUSINESS_TZ = "Africa/Dar_es_Salaam";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return dateFmt.format(new Date(value));
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return dateTimeFmt.format(new Date(value));
}

export function formatRelative(value: Date | string | null | undefined) {
  if (!value) return "—";
  const then = new Date(value).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

type Numeric = Prisma.Decimal | number | string | null | undefined;

function toNumber(value: Numeric): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

export { toNumber };

/** Money, always with its currency. A bare figure invites the wrong assumption. */
export function formatMoney(value: Numeric, currency = "USD") {
  const n = toNumber(value);
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "TZS" ? 0 : 2,
    maximumFractionDigits: currency === "TZS" ? 0 : 2,
  }).format(n);
}

/** Four decimals, because that is what the column holds and what a rate uses. */
export function formatCbm(value: Numeric) {
  const n = toNumber(value);
  if (n === null) return "—";
  return `${n.toFixed(3)} CBM`;
}

export function formatWeight(value: Numeric) {
  const n = toNumber(value);
  if (n === null) return "—";
  return `${n.toFixed(2)} kg`;
}

/** "+0.4 kg", "−2 packages". The sign is the information. */
export function formatDelta(value: Numeric, suffix = "") {
  const n = toNumber(value);
  if (n === null || n === 0) return "—";
  const sign = n > 0 ? "+" : "−";
  return `${sign}${Math.abs(n).toFixed(2)}${suffix}`;
}

/** Tracking codes get typed with spaces, in lower case, with an O for a zero. */
export function normaliseCode(input: string) {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
