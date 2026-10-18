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

/**
 * EVERY SERVER ERROR, WRITTEN DOWN.
 *
 * Next calls this when a request fails on the server. It stores what failed and
 * where — never the request's body, cookies or headers — so the developer's
 * home can say what is going wrong. Failing to write it must never be the
 * thing that breaks a request, so nothing here can throw.
 */
export async function onRequestError(
  error: unknown,
  request: { path?: string },
  context: { routePath?: string }
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { prisma } = await import("@/lib/prisma");
    const e = error as { message?: string; digest?: string };
    const message = String(e?.message ?? error ?? "Unknown error")
      .replace(/postgres(ql)?:\/\/\S+/gi, "[database address]")
      .slice(0, 400);
    /* The usual non-errors Next raises for redirects and missing pages. */
    if (/NEXT_REDIRECT|NEXT_NOT_FOUND/.test(message)) return;
    await prisma.systemEvent.create({
      data: {
        kind: "ERROR",
        message,
        path: (request?.path ?? "").split("?")[0].slice(0, 200) || null,
        route: context?.routePath?.slice(0, 200) ?? null,
        digest: e?.digest ?? null,
      },
    });
  } catch {
    /* never the thing that breaks the request */
  }
}
