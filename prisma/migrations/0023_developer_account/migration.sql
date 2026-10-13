-- THE DEVELOPER ACCOUNT, AND AN AUDIT THAT KNOWS WHO ACTED.
--
-- Additive only: one new role, one new table, and defaulted columns on the
-- audit log. Every existing row keeps meaning exactly what it did — staff, a
-- success, no request id.

ALTER TYPE "Role" ADD VALUE 'DEVELOPER';

CREATE TYPE "DeveloperMode" AS ENUM ('PENDING', 'DEVELOPER', 'ENDED');

CREATE TABLE "DeveloperSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "mode" "DeveloperMode" NOT NULL DEFAULT 'PENDING',
  "chosenAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "endedBy" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeveloperSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeveloperSession_userId_mode_idx" ON "DeveloperSession"("userId", "mode");
ALTER TABLE "DeveloperSession" ADD CONSTRAINT "DeveloperSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
  ADD COLUMN "actorName" TEXT,
  ADD COLUMN "actorDepartment" "Department",
  ADD COLUMN "actorType" TEXT NOT NULL DEFAULT 'STAFF',
  ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN "requestId" TEXT;
CREATE INDEX "AuditLog_actorType_createdAt_idx" ON "AuditLog"("actorType", "createdAt");
CREATE INDEX "AuditLog_outcome_createdAt_idx" ON "AuditLog"("outcome", "createdAt");

-- Name and department for rows already written, taken from the account they
-- name. Only fills what is empty; nothing is overwritten.
UPDATE "AuditLog" a
SET "actorName" = u."name", "actorDepartment" = u."department"
FROM "User" u
WHERE a."actorId" = u."id" AND a."actorName" IS NULL;
