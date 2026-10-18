-- Server errors, recorded as they happen. Additive: one new table.
CREATE TABLE "SystemEvent" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "path" TEXT,
  "route" TEXT,
  "digest" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SystemEvent_kind_createdAt_idx" ON "SystemEvent"("kind", "createdAt");
