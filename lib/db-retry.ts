/**
 * RETRY A QUERY THAT NEVER REACHED THE DATABASE.
 *
 * Neon puts an idle database to sleep and wakes it on the first connection,
 * which takes a few seconds; until it is awake that first request fails with
 * P1001 "Can't reach database server" and the visitor sees an error page.
 * P1001 means the connection was never made, so nothing ran and asking again
 * cannot do anything twice — which is why this retries that code and no other.
 */
const WAITS_MS = [700, 1500, 3000];

export function isUnreachable(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P1001";
}

export async function withRetry<T>(run: () => Promise<T>, waits: number[] = WAITS_MS): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!isUnreachable(error) || attempt >= waits.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, waits[attempt]));
    }
  }
}
