import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * THE AUTOMATIC JOBS, AND A RECORD OF EACH RUN.
 *
 * The scheduler calls these by address. Wrapping the work in `runJob` writes
 * down when it started, how it ended and how long it took, so the developer
 * can see that the nightly storage work really happened — and notice the day
 * it did not. Failing to write the record never stops the job, and a job's
 * own failure is recorded and then raised as it always was.
 */

export const JOBS: { name: string; label: string; path: string; runsAt: string; everyHours: number }[] = [
  { name: "storage-charge", label: "Add storage to bills", path: "/api/cron/storage-charge", runsAt: "00:05 Dar time, daily", everyHours: 24 },
  { name: "storage-notices", label: "Tell customers their free storage ended", path: "/api/cron/storage", runsAt: "08:00 Dar time, daily", everyHours: 24 },
];

export async function runJob<T extends object>(name: string, work: () => Promise<T>): Promise<T> {
  const started = Date.now();
  let id: string | null = null;
  try {
    id = (await prisma.jobRun.create({ data: { name }, select: { id: true } })).id;
  } catch {
    /* the record must never stop the job */
  }
  const finish = async (ok: boolean, result: string) => {
    if (!id) return;
    try {
      await prisma.jobRun.update({ where: { id }, data: { ok, result: result.slice(0, 300), finishedAt: new Date(), ms: Date.now() - started } });
    } catch {
      /* same */
    }
  };
  try {
    const out = await work();
    await finish(true, JSON.stringify(out));
    return out;
  } catch (error) {
    await finish(false, error instanceof Error ? error.message.replace(/postgres(ql)?:\/\/\S+/gi, "[database address]") : "failed");
    throw error;
  }
}
