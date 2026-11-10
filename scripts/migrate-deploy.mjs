/*
  `prisma migrate deploy`, tried again when the database is simply not answering.

  Every Vercel build applies pending migrations first. Neon's compute can be asleep or briefly unreachable at that
  moment (P1001), and one failed connection used to fail the whole deploy even though nothing in the code was wrong.
  Only a connection failure is retried; a migration that fails for any other reason stops the build at once.
*/
import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const tries = Number(process.env.MIGRATE_TRIES ?? 6);
const waitMs = Number(process.env.MIGRATE_WAIT_MS ?? 15000);
const NOT_REACHABLE = /P1001|P1002|P1017|Can't reach database server|Timed out fetching a new connection/i;

for (let attempt = 1; attempt <= tries; attempt++) {
  const run = spawnSync("node_modules/.bin/prisma", ["migrate", "deploy"], { encoding: "utf8" });
  process.stdout.write(run.stdout ?? "");
  process.stderr.write(run.stderr ?? "");
  if (run.status === 0) process.exit(0);
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  if (!NOT_REACHABLE.test(output) || attempt === tries) process.exit(run.status ?? 1);
  console.log(`Database not reachable (try ${attempt} of ${tries}); waiting ${waitMs / 1000}s before the next one.`);
  await sleep(waitMs);
}
