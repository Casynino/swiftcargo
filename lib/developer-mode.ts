/**
 * MAY THIS SIGN-IN ACT AS THE DEVELOPER?
 *
 * Pure, and the only place the answer is decided. The developer's browser
 * token holds nothing but the id of a server-side row; the answer is read from
 * that row on every request. A token for the developer account with no row, a
 * row that is still waiting for the choice, one that has ended, or one that
 * belongs to somebody else holds no privilege at all — it is treated as
 * signed out.
 */
export type DeveloperSessionRow = {
  userId: string;
  mode: "PENDING" | "DEVELOPER" | "ENDED";
  endedAt: Date | null;
} | null;

export type DeveloperStanding = "active" | "pending" | "none";

export function developerStanding(
  userId: string,
  row: DeveloperSessionRow
): DeveloperStanding {
  if (!row || row.userId !== userId || row.endedAt !== null) return "none";
  if (row.mode === "DEVELOPER") return "active";
  if (row.mode === "PENDING") return "pending";
  return "none";
}

/** Long enough that the account cannot be guessed, however it is provisioned. */
export const DEVELOPER_MIN_PASSWORD = 14;
