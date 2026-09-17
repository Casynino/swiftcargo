/**
 * DEVELOPMENT DATA NEVER REACHES THE LIVE DATABASE.
 *
 * Every script beside this one invents customers, cargo, bills or payments, or
 * rewrites rows in place to make a screen interesting. Against production that
 * is fake money in real books, and the Counter it advances is the real invoice
 * and receipt sequence — the gap it leaves cannot be explained to an auditor.
 *
 * So each of them calls this before it opens a connection, and it refuses on
 * either sign of a live database: NODE_ENV=production, or a connection string
 * that points at a hosted Postgres rather than a machine on the desk.
 */
const HOSTED = [/neon\.tech/i, /neon\.build/i, /vercel-storage\.com/i, /supabase\.co/i, /rds\.amazonaws\.com/i];

function hostOf(url: string | undefined) {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function refuseProductionDatabase(script: string) {
  const hosts = [process.env.DATABASE_URL, process.env.DIRECT_URL].map(hostOf);
  const hosted = hosts.find((host) => HOSTED.some((pattern) => pattern.test(host)));

  if (process.env.NODE_ENV === "production" || hosted) {
    const why = hosted ? `DATABASE_URL points at ${hosted}` : "NODE_ENV is production";
    console.error(
      `${script} writes development data and will not run here: ${why}.\n` +
        "The live database is seeded with prisma/seed.production.ts only."
    );
    process.exit(1);
  }
}
