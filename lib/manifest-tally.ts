/**
 * EXPECTED, RECEIVED, MISSING — THE CONTAINER'S ARITHMETIC.
 *
 * The packing list is what was supposed to arrive. Dar's check-in is what
 * physically arrived. Missing is the difference, and it is WORKED OUT, never
 * typed: no screen lets a clerk lower a container's count to make it agree
 * with the floor, because a total somebody edited is a total that can be
 * edited to hide a short delivery.
 *
 * Two ways a package can be missing, and both are counted here:
 *
 *   - A whole consignment that never came off the box. It keeps its place on
 *     the manifest and on the packing list, standing at MISSING_AT_DAR with a
 *     case against it. Every package it was expected to hold is missing.
 *   - A consignment that came off short. China counted a hundred, Dar counted
 *     ninety-eight: two packages are missing and the other ninety-eight carry
 *     on to pricing, release and collection like anything else.
 *
 * NOTHING IS EVER DELETED to make these add up. The expected figure is China's
 * measurement and stays exactly as China recorded it; the received figure is
 * Dar's and stays exactly as Dar counted it. The gap between them is the only
 * evidence of what happened at sea, which is why neither column is allowed to
 * overwrite the other.
 *
 * A consignment nobody has counted yet is NOT missing — it is unchecked. The
 * floor is part-way through a box, and calling that a shortage would put a
 * container into dispute every time a clerk went to lunch.
 */

export type ManifestLine = {
  /** China's count — what the packing list says should be in the box. */
  expectedPackages: number;
  /** Dar's count. Null while nobody has counted this consignment yet. */
  receivedPackages: number | null;
  /** Reported as never having come off the container. */
  missing: boolean;
};

export type ManifestTally = {
  /** The packing list's own total. Never reduced by anything below. */
  expected: number;
  /** What Dar actually counted off the box. */
  received: number;
  /** Expected and not found: whole consignments plus every short count. */
  missing: number;
  /** Counted off the box and more than the paper said. */
  over: number;
  /** Physically here and usable — the same figure as received. */
  available: number;
  /** How far the box is from its paper, in packages. */
  discrepancy: number;
  /** Consignments nobody has counted or reported yet. */
  uncheckedLines: number;
  /** True while the floor is still working the box: the gap is not final. */
  inProgress: boolean;
};

export function manifestTally(lines: ManifestLine[]): ManifestTally {
  let expected = 0;
  let received = 0;
  let missing = 0;
  let over = 0;
  let uncheckedLines = 0;

  for (const line of lines) {
    const expectedOf = Math.max(0, line.expectedPackages);
    expected += expectedOf;

    if (line.missing) {
      /* Never came off the box: every package it was carrying is missing, and
         nothing of it is available. The line stays on the manifest. */
      missing += expectedOf;
      continue;
    }

    if (line.receivedPackages === null) {
      uncheckedLines += 1;
      continue;
    }

    const receivedOf = Math.max(0, line.receivedPackages);
    received += receivedOf;
    if (receivedOf < expectedOf) missing += expectedOf - receivedOf;
    if (receivedOf > expectedOf) over += receivedOf - expectedOf;
  }

  return {
    expected,
    received,
    missing,
    over,
    available: received,
    discrepancy: missing + over,
    uncheckedLines,
    inProgress: uncheckedLines > 0,
  };
}
