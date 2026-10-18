-- Every automatic job run, written down. Additive: one new table.
CREATE TABLE "JobRun" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "ok" BOOLEAN NOT NULL DEFAULT false,
  "result" TEXT,
  "ms" INTEGER,
  CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "JobRun_name_startedAt_idx" ON "JobRun"("name", "startedAt");
