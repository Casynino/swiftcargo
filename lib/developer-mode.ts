/**
 * MAY THIS SIGN-IN ACT AS THE DEVELOPER, AND AS WHOM?
 *
 * Pure, and the only place the answer is decided. The developer's browser
 * token holds nothing but the id of a server-side row; the answer is read from
 * that row on every request. A token for the developer account with no row, a
 * row that is still waiting for the choice, one that has ended or run past its
 * eight hours, or one that belongs to somebody else holds no privilege at all
 * — it is treated as signed out.
 */
export type DeveloperSessionRow = {
  userId: string;
  mode: "PENDING" | "DEVELOPER" | "ENDED";
  endedAt: Date | null;
  createdAt?: Date;
} | null;

export type DeveloperStanding = "active" | "pending" | "none";

/** A developer sign-in lasts a working day and no longer; it fails closed. */
export const DEVELOPER_SESSION_MAX_MS = 8 * 60 * 60 * 1000;

/** "Work as" ends by itself after this long, so a forgotten one cannot linger. */
export const WORK_AS_MAX_MS = 4 * 60 * 60 * 1000;

export function developerStanding(
  userId: string,
  row: DeveloperSessionRow,
  now: number = Date.now()
): DeveloperStanding {
  if (!row || row.userId !== userId || row.endedAt !== null) return "none";
  if (row.createdAt && now - row.createdAt.getTime() > DEVELOPER_SESSION_MAX_MS) return "none";
  if (row.mode === "DEVELOPER") return "active";
  if (row.mode === "PENDING") return "pending";
  return "none";
}

/**
 * WHO THE DEVELOPER MAY WORK AS.
 *
 * Any live staff account — the owner included, so the owner's own screens can
 * be seen as the owner sees them — but never another developer, never a
 * customer, never themselves, and never an account that is suspended or gone.
 */
export function canWorkAs(
  target: { id: string; role: string; active: boolean; status: string },
  developerId: string
): boolean {
  return (
    target.id !== developerId &&
    target.active &&
    target.status === "ACTIVE" &&
    target.role !== "DEVELOPER" &&
    target.role !== "CUSTOMER"
  );
}

/** Still inside its four hours? Anything without a start has already expired. */
export function workAsLive(startedAt: Date | null | undefined, now: number = Date.now()): boolean {
  return !!startedAt && now - startedAt.getTime() <= WORK_AS_MAX_MS;
}

/** Long enough that the account cannot be guessed, however it is provisioned. */
export const DEVELOPER_MIN_PASSWORD = 14;
