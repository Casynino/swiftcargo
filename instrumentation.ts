/**
 * Runs once when a server instance starts.
 *
 * Only the Node runtime is checked: the edge middleware reads none of these
 * variables, and the build phase is skipped because a build does not need the
 * secrets a running server does.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { assertProductionEnvironment } = await import("@/lib/env");
  assertProductionEnvironment();
}
